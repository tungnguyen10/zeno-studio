import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createStoredZip } from '../../server/downloads/zip'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) chunks.push(chunk)
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

describe('lossless ZIP STORE stream', () => {
  it('preserves original bytes and emits UTF-8 central entries with matching CRCs', async () => {
    const fixtures = [
      { name: 'A.jpg', bytes: new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9]) },
      { name: 'Ảnh.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3]) },
      { name: 'C.heic', bytes: new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]) },
    ]
    const zip = await collect(createStoredZip(fixtures.map(file => ({ name: file.name, sizeBytes: file.bytes.length,
      open: async () => new ReadableStream({ start(controller) { controller.enqueue(file.bytes); controller.close() } }) })), new AbortController().signal))
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    let offset = 0
    const localCrcs: number[] = []
    for (const file of fixtures) {
      expect(view.getUint32(offset, true)).toBe(0x04034b50)
      expect(view.getUint16(offset + 6, true) & 0x0800).toBe(0x0800)
      expect(view.getUint16(offset + 8, true)).toBe(0)
      const nameLength = view.getUint16(offset + 26, true)
      const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength))
      expect(name).toBe(file.name)
      const dataStart = offset + 30 + nameLength
      expect(digest(zip.slice(dataStart, dataStart + file.bytes.length))).toBe(digest(file.bytes))
      const descriptor = dataStart + file.bytes.length
      expect(view.getUint32(descriptor, true)).toBe(0x08074b50)
      localCrcs.push(view.getUint32(descriptor + 4, true))
      expect(view.getUint32(descriptor + 8, true)).toBe(file.bytes.length)
      offset = descriptor + 16
    }
    for (const [index, file] of fixtures.entries()) {
      expect(view.getUint32(offset, true)).toBe(0x02014b50)
      expect(view.getUint16(offset + 10, true)).toBe(0)
      expect(view.getUint32(offset + 16, true)).toBe(localCrcs[index])
      const nameLength = view.getUint16(offset + 28, true)
      expect(new TextDecoder().decode(zip.slice(offset + 46, offset + 46 + nameLength))).toBe(file.name)
      offset += 46 + nameLength
    }
    expect(view.getUint32(offset, true)).toBe(0x06054b50)
    expect(view.getUint16(offset + 10, true)).toBe(fixtures.length)
  })

  it('rejects size mismatch, source failure and an empty part', async () => {
    const source = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } })
    await expect(collect(createStoredZip([{ name: 'bad.jpg', sizeBytes: 3, open: async () => source(new Uint8Array([1, 2])) }], new AbortController().signal))).rejects.toThrow()
    await expect(collect(createStoredZip([{ name: 'bad.jpg', sizeBytes: 1, open: async () => { throw new Error('Drive failed') } }], new AbortController().signal))).rejects.toThrow('Drive failed')
    expect(() => createStoredZip([], new AbortController().signal)).toThrow()
  })

  it('renames duplicate and path-like ZIP entries', async () => {
    const bytes = new Uint8Array([1])
    const zip = await collect(createStoredZip(['a.jpg', '../a.jpg'].map(name => ({ name, sizeBytes: 1,
      open: async () => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }) })), new AbortController().signal))
    const text = new TextDecoder().decode(zip)
    expect(text).toContain('a.jpg')
    expect(text).toContain('a (2).jpg')
    expect(text).not.toContain('../')
  })

  it('cancels an active Drive reader when the client aborts', async () => {
    const abort = new AbortController()
    const cancelled = vi.fn()
    const source = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array([1])) },
      cancel: cancelled,
    })
    const zip = createStoredZip([{ name: 'large.jpg', sizeBytes: 100, open: async () => source }], abort.signal)
    const reader = zip.getReader()
    await reader.read()
    await reader.read()
    await reader.read()
    abort.abort()
    await expect(reader.read()).rejects.toThrow()
    expect(cancelled).toHaveBeenCalled()
  })
})
