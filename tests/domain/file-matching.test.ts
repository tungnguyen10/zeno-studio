import { describe, expect, it } from 'vitest'
import { matchLocalFiles, matchLocalPhotos } from '../../shared/domain/file-matching'

const local = (name: string, path = name) => ({ name, path })

describe('local file matching', () => {
  it('indexes a RAW and JPEG pair as two matches for one requested photo', () => {
    const result = matchLocalFiles(['Ảnh.001.JPG'], [local('Ảnh.001.CR3'), local('Ảnh.001.JPG')], { matchBy: 'stem', fileType: 'all' })
    expect(result.matched.map(item => item.file.name)).toEqual(['Ảnh.001.CR3', 'Ảnh.001.JPG'])
    expect(result.ambiguous).toEqual([])
  })

  it('supports PEF and keeps duplicate RAW extensions ambiguous', () => {
    expect(matchLocalFiles(['A.JPG'], [local('A.PEF')], { matchBy: 'stem', fileType: 'raw' }).matched).toHaveLength(1)
    expect(matchLocalFiles(['A.JPG'], [local('A.CR3', 'one/A.CR3'), local('a.cr3', 'two/a.cr3')], { matchBy: 'stem', fileType: 'raw' }).ambiguous).toHaveLength(1)
  })
  it('keeps duplicate requested filenames attached to stable photo IDs', () => {
    const result = matchLocalPhotos([{ photoId: 'one', filename: 'A.JPG' }, { photoId: 'two', filename: 'A.JPG' }], [local('A.CR3')], { matchBy: 'stem', fileType: 'raw' })
    expect(result.matched.map(item => item.photoId)).toEqual(['one', 'two'])
  })
  it('does not allow executable files through Custom', () => {
    expect(matchLocalFiles(['A.JPG'], [local('A.EXE')], { matchBy: 'stem', fileType: 'custom', customExtensions: ['.exe'] }).matched).toEqual([])
  })
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
