import { describe, expect, it } from 'vitest'
import { exportNotesCsv, exportSelectionCsv, exportFilenamesTxt, exportNotesTxt } from '../../shared/domain/export'

describe('selection exports', () => {
  const items = [
    { photoId: 'photo-1', filename: 'Ảnh,"đẹp".jpg', notes: [{ text: 'Sáng ảnh\nchỉnh da' }] },
  ]

  it('escapes filenames and notes as UTF-8 CSV', () => {
    expect(exportSelectionCsv(items)).toBe('photo_id,filename\r\nphoto-1,"Ảnh,""đẹp"".jpg"\r\n')
    expect(exportNotesCsv(items)).toBe('photo_id,filename,note\r\nphoto-1,"Ảnh,""đẹp"".jpg","Sáng ảnh\nchỉnh da"\r\n')
  })

  it('exports requested filenames one per line', () => {
    expect(exportFilenamesTxt(items)).toBe('Ảnh,"đẹp".jpg\n')
    expect(exportNotesTxt(items)).toBe('Ảnh,"đẹp".jpg\nSáng ảnh\nchỉnh da\n')
  })
})
