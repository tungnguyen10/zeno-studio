import { describe, expect, it } from 'vitest'
import { exportFileFilterReport } from '../../shared/domain/file-report'

describe('local file filter report', () => {
  it('includes manual choices and copy outcomes with Unicode-safe CSV escaping', () => {
    const report = exportFileFilterReport({
      requested: ['Ảnh,"đẹp".JPG', 'B.JPG'],
      matched: [], missing: ['B.JPG'],
      ambiguous: [{ requested: 'Ảnh,"đẹp".JPG', files: [{ name: 'Ảnh.CR3', path: 'set,1/Ảnh.CR3' }, { name: 'Ảnh.CR3', path: 'set 2/Ảnh.CR3' }] }],
    }, { 'Ảnh,"đẹp".JPG': 'set,1/Ảnh.CR3' }, {
      copied: [], skipped: ['Ảnh.CR3'], errors: [],
      outcomes: [{ requested: 'Ảnh,"đẹp".JPG', filename: 'Ảnh.CR3', sourcePath: 'set,1/Ảnh.CR3', status: 'skipped', detail: 'File đích đã tồn tại' }],
    })
    expect(report).toContain('match,missing,B.JPG,,')
    expect(report).toContain('match,resolved,"Ảnh,""đẹp"".JPG","set,1/Ảnh.CR3"')
    expect(report).toContain('copy,skipped,"Ảnh,""đẹp"".JPG","set,1/Ảnh.CR3",File đích đã tồn tại')
  })
})
