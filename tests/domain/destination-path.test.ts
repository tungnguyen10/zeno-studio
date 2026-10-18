import { describe, expect, it } from 'vitest'
import { parseDestinationPath, destinationCollisionKey } from '../../shared/domain/destination-path'

describe('destination path across macOS and Windows', () => {
  it('accepts nested relative paths with either separator', () => {
    expect(parseDestinationPath('KhachA\\DaLoc')).toEqual(['KhachA', 'DaLoc'])
  })
  it.each(['C:\\Users\\Pictures', '/Volumes/Photos', '../outside', 'A//B', 'CON', 'A/PRN.txt', 'folder.', 'a:b', 'one/./two'])('rejects unsafe destination %s', path => {
    expect(() => parseDestinationPath(path)).toThrow()
  })
  it('detects case and Unicode collisions', () => {
    expect(destinationCollisionKey('Ảnh.CR3')).toBe(destinationCollisionKey('ẢNH.cr3'))
    expect(destinationCollisionKey('KhachA\\A.CR3')).toBe(destinationCollisionKey('khacha/a.cr3'))
  })
})
