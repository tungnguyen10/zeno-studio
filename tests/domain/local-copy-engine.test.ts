import { describe, expect, it } from 'vitest'
import { copyLocalFiles } from '../../app/services/local-filter/copyEngine'

describe('safe local copy', () => {
  it('streams a file, skips an existing name, and leaves source unchanged', async () => {
    const written = new Map<string, Uint8Array[]>()
    const destination = {
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!options?.create && !written.has(name)) throw new DOMException('missing', 'NotFoundError')
        if (options?.create) written.set(name, [])
        return { isSameEntry: async () => false, createWritable: async () => new WritableStream<Uint8Array>({ write(chunk) { written.get(name)!.push(chunk) } }), getFile: async () => new File(written.get(name) ?? [], name) }
      },
    }
    written.set('OLD.CR3', [new TextEncoder().encode('old')])
    const handle = (name: string) => ({ getFile: async () => new File(['new bytes'], name) })
    const outcomes = await copyLocalFiles([
      { id: 'new', requested: 'A.JPG', sourcePath: 'A.CR3', outputPath: 'A.CR3', handle: handle('A.CR3') as FileSystemFileHandle },
      { id: 'old', requested: 'OLD.JPG', sourcePath: 'OLD.CR3', outputPath: 'OLD.CR3', handle: handle('OLD.CR3') as FileSystemFileHandle },
    ], destination as unknown as FileSystemDirectoryHandle)
    expect(outcomes.map(item => item.status)).toEqual(['copied', 'skipped'])
    expect(new TextDecoder().decode(written.get('OLD.CR3')![0])).toBe('old')
  })

  it('stops after the current file and never overwrites a partial file on retry', async () => {
    const written = new Map<string, Uint8Array[]>()
    const destination = {
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!options?.create && !written.has(name)) throw new DOMException('missing', 'NotFoundError')
        if (options?.create) written.set(name, [])
        return {
          async getFile() { return new File(written.get(name) ?? [], name) },
          async createWritable() { return new WritableStream<Uint8Array>({ write(chunk) { written.get(name)!.push(chunk); if (name === 'A.CR3') throw new Error('Ổ đĩa bị ngắt') } }) },
        }
      },
    }
    const plan = ['A.CR3', 'B.CR3'].map(name => ({ id: name, requested: name.replace('.CR3', '.JPG'), sourcePath: name, outputPath: name, handle: { async getFile() { return new File(['raw'], name) } } as FileSystemFileHandle }))
    const controller = new AbortController()
    const first = await copyLocalFiles(plan, destination as unknown as FileSystemDirectoryHandle, {
      signal: controller.signal, onProgress: () => controller.abort(),
    })
    expect(first.map(item => item.status)).toEqual(['partial', 'cancelled'])
    expect(written.has('B.CR3')).toBe(false)
    const retry = await copyLocalFiles(plan.slice(0, 1), destination as unknown as FileSystemDirectoryHandle)
    expect(retry[0]?.status).toBe('skipped')
    expect(new TextDecoder().decode(written.get('A.CR3')![0])).toBe('raw')
  })

  it('does not create a target when read or write permission is denied', async () => {
    let created = false
    const destination = {
      queryPermission: async () => 'granted',
      async getFileHandle() { created = true; throw new Error('should not create') },
    }
    const source = { queryPermission: async () => 'denied', async getFile() { throw new Error('should not read') } }
    const result = await copyLocalFiles([{ id: 'a', requested: 'A.JPG', sourcePath: 'A.CR3', outputPath: 'A.CR3', handle: source as FileSystemFileHandle }], destination as unknown as FileSystemDirectoryHandle)
    expect(result[0]).toMatchObject({ status: 'failed', reason: 'Không có quyền đọc file nguồn' })
    expect(created).toBe(false)
  })
})
