import { DOWNLOAD_LIMITS } from './limits'
import { uniqueZipNames } from './names'

export type ZipInput = { name: string; sizeBytes: number; open: () => Promise<ReadableStream<Uint8Array>> }

const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crcUpdate(current: number, bytes: Uint8Array): number {
  let crc = current
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return crc >>> 0
}
function block(size: number, values: Array<[number, number, 2 | 4]>): Uint8Array {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  for (const [offset, value, width] of values) {
    if (width === 2) view.setUint16(offset, value, true)
    else view.setUint32(offset, value, true)
  }
  return bytes
}
type CentralEntry = { name: Uint8Array; crc: number; size: number; offset: number }
const aborted = () => new Error('Tải ZIP đã dừng')

export function createStoredZip(files: ZipInput[], signal: AbortSignal): ReadableStream<Uint8Array> {
  if (!files.length || files.length > DOWNLOAD_LIMITS.maxFiles ||
    files.some(file => !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > DOWNLOAD_LIMITS.maxBytes) ||
    files.reduce((sum, file) => sum + file.sizeBytes, 0) > DOWNLOAD_LIMITS.maxBytes) {
    throw new Error('Phần ZIP vượt giới hạn an toàn')
  }
  const names = uniqueZipNames(files.map(file => file.name)).map(name => encoder.encode(name))
  if (names.some(name => name.length > 0xffff)) throw new Error('Tên file ZIP quá dài')
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let cancelled = false
  const onAbort = () => { cancelled = true; void activeReader?.cancel().catch(() => {}) }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()

  async function* generate(): AsyncGenerator<Uint8Array> {
    let offset = 0
    const central: CentralEntry[] = []
    try {
      for (const [index, file] of files.entries()) {
        if (cancelled) throw aborted()
        const name = names[index]!
        const localOffset = offset
        const header = block(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0808, 2],
          [8, 0, 2], [26, name.length, 2]])
        yield header; yield name
        offset += header.length + name.length
        const stream = await file.open()
        activeReader = stream.getReader()
        let size = 0
        let crc = 0xffffffff
        while (true) {
          if (cancelled) throw aborted()
          const result = await activeReader.read()
          if (cancelled) throw aborted()
          if (result.done) break
          size += result.value.byteLength
          if (size > file.sizeBytes) throw new Error('Kích thước ảnh gốc đã thay đổi')
          crc = crcUpdate(crc, result.value)
          yield result.value
          offset += result.value.byteLength
        }
        activeReader.releaseLock()
        activeReader = null
        if (size !== file.sizeBytes) throw new Error('Kích thước ảnh gốc đã thay đổi')
        crc = (crc ^ 0xffffffff) >>> 0
        const descriptor = block(16, [[0, 0x08074b50, 4], [4, crc, 4], [8, size, 4], [12, size, 4]])
        yield descriptor
        offset += descriptor.length
        central.push({ name, crc, size, offset: localOffset })
      }
      const centralOffset = offset
      for (const entry of central) {
        if (cancelled) throw aborted()
        const header = block(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0808, 2],
          [10, 0, 2], [16, entry.crc, 4], [20, entry.size, 4], [24, entry.size, 4],
          [28, entry.name.length, 2], [42, entry.offset, 4]])
        yield header; yield entry.name
        offset += header.length + entry.name.length
      }
      yield block(22, [[0, 0x06054b50, 4], [8, central.length, 2], [10, central.length, 2],
        [12, offset - centralOffset, 4], [16, centralOffset, 4]])
    } finally {
      if (activeReader) { await activeReader.cancel().catch(() => {}); activeReader.releaseLock(); activeReader = null }
      signal.removeEventListener('abort', onAbort)
    }
  }
  const iterator = generate()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) controller.close()
        else controller.enqueue(result.value)
      } catch (error) { controller.error(error) }
    },
    async cancel() { cancelled = true; await activeReader?.cancel().catch(() => {}); await iterator.return(undefined) },
  })
}
