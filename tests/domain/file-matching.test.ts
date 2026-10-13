import { describe, expect, it } from 'vitest'
import { matchLocalFiles } from '../../shared/domain/file-matching'

const local = (name: string, path = name) => ({ name, path })

describe('local file matching', () => {
  it('matches a selected JPEG to one RAW file by stem', () => {
    const result = matchLocalFiles(['DSC_0001.JPG'], [local('DSC_0001.CR3')], { matchBy: 'stem', fileType: 'raw' })
    expect(result.matched).toEqual([{ requested: 'DSC_0001.JPG', file: local('DSC_0001.CR3') }])
    expect(result.missing).toEqual([])
  })

  it('marks duplicate stems across folders as ambiguous instead of choosing one', () => {
    const files = [local('DSC_0001.CR3', 'a/DSC_0001.CR3'), local('DSC_0001.CR3', 'b/DSC_0001.CR3')]
    const result = matchLocalFiles(['DSC_0001.JPG'], files, { matchBy: 'stem', fileType: 'raw' })
    expect(result.matched).toEqual([])
    expect(result.ambiguous).toEqual([{ requested: 'DSC_0001.JPG', files }])
  })

  it('reports missing files and ignores unrelated extensions', () => {
    const result = matchLocalFiles(['DSC_0002.JPG'], [local('DSC_0002.TXT')], { matchBy: 'stem', fileType: 'all' })
    expect(result.missing).toEqual(['DSC_0002.JPG'])
  })
})
