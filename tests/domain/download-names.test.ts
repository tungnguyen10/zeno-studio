import { describe, expect, it } from 'vitest'
import { contentDisposition, uniqueZipNames } from '../../server/downloads/names'

describe('original download names', () => {
  it('keeps Unicode names in filename* and removes path segments from fallback', () => {
    const header = contentDisposition('../Ảnh cưới.jpg')
    expect(header).toContain("filename*=UTF-8''%E1%BA%A2nh%20c%C6%B0%E1%BB%9Bi.jpg")
    expect(header).not.toContain('../')
    expect(header).toMatch(/filename="[^"/\\]+"/)
  })

  it('deduplicates ZIP names safely while preserving extensions', () => {
    expect(uniqueZipNames(['a.jpg', 'a.jpg', '../a.jpg', 'dir\\a.jpg'])).toEqual([
      'a.jpg', 'a (2).jpg', 'a (3).jpg', 'a (4).jpg',
    ])
    expect(uniqueZipNames(['\u0000../x.png', 'Ảnh.jpg'])).toEqual(['x.png', 'Ảnh.jpg'])
  })
})
