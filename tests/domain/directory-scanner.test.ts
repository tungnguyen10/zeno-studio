import { describe, expect, it } from 'vitest'
import { scanDirectory } from '../../app/services/local-filter/directoryScanner'

function dir(name: string, entries: Array<[string, unknown]>) {
  return { kind: 'directory', name, async *entries() { for (const entry of entries) yield entry } }
}
function file(name: string) { return { kind: 'file', name, getFile() { throw new Error('scan read file content') } } }

describe('directory scanner', () => {
  it('excludes old SELECTED and a custom nested output without opening files', async () => {
    const root = dir('RAW', [
      ['A.CR3', file('A.CR3')],
      ['SELECTED', dir('SELECTED', [['old.CR3', file('old.CR3')]])],
      ['KhachA', dir('KhachA', [['DaLoc', dir('DaLoc', [['copied.CR3', file('copied.CR3')]])], ['B.CR3', file('B.CR3')]])],
    ])
    const result = await scanDirectory(root as unknown as FileSystemDirectoryHandle, { excludedPaths: ['KhachA/DaLoc'] })
    expect(result.files.map(item => item.path)).toEqual(['A.CR3', 'KhachA/B.CR3'])
  })
  it('skips a prior application output folder identified by its marker', async () => {
    const output = Object.assign(dir('OldOutput', [['A.CR3', file('A.CR3')]]), { async getFileHandle(name: string) { if (name === '.zeno-filter-output') return file(name); throw new DOMException('missing', 'NotFoundError') } })
    const root = dir('RAW', [['OldOutput', output], ['B.CR3', file('B.CR3')]])
    const result = await scanDirectory(root as unknown as FileSystemDirectoryHandle)
    expect(result.files.map(item => item.path)).toEqual(['B.CR3'])
  })
})
