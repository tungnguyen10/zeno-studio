import { describe, expect, it } from 'vitest'
import { copyMatchedFiles } from '../../shared/domain/file-copy'

describe('local copy', () => {
  it('copies bytes without deleting source and skips an existing destination', async () => {
    const written: Record<string, Uint8Array[]> = { 'existing.jpg': [new Uint8Array([9])] }
    const destination = {
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!options?.create) {
          if (written[name]) return {}
          throw new DOMException('missing', 'NotFoundError')
        }
        written[name] = []
        return {
          async createWritable() {
            return new WritableStream<Uint8Array>({ write(chunk) { written[name]!.push(chunk) } })
          },
        }
      },
    }
    const files = [
      { requested: 'new.jpg', file: new File(['hello'], 'new.jpg') },
      { requested: 'existing.jpg', file: new File(['replace'], 'existing.jpg') },
    ]
    const result = await copyMatchedFiles(files, destination)
    expect(result.copied).toEqual(['new.jpg'])
    expect(result.skipped).toEqual(['existing.jpg'])
    expect(result.outcomes.map(item => item.status)).toEqual(['copied', 'skipped'])
    expect(new TextDecoder().decode(written['new.jpg']![0])).toBe('hello')
    expect(written['existing.jpg']![0]).toEqual(new Uint8Array([9]))
    expect(await files[0]!.file.text()).toBe('hello')
  })
})
