import { describe, expect, it } from 'vitest'
import { buildFilterReports } from '../../shared/domain/local-filter-reports'

describe('local filter reports', () => {
  it('includes copied and missing photos with safe Vietnamese notes CSV', () => {
    const reports = buildFilterReports('v2', [
      { photoId: 'a', originalFilename: 'Ảnh.JPG', notes: [{ text: '=chỉnh da' }] },
      { photoId: 'b', originalFilename: 'B.JPG', notes: [] },
    ], [
      { photoId: 'a', sourcePath: 'raw/Ảnh.CR3', outputPath: 'Ảnh.CR3', status: 'copied', reason: '' },
      { photoId: 'b', sourcePath: '', outputPath: '', status: 'missing', reason: '' },
    ])
    expect(reports.notes).toContain("'=chỉnh da")
    expect(reports.report).toContain('B.JPG,,,missing,')
  })
})
