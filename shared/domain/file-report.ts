import type { CopyResult } from './file-copy'
import type { MatchResult } from './file-matching'
import { csv } from './csv'

export function exportFileFilterReport(preview: MatchResult, resolvedPaths: Record<string, string>, copy: CopyResult | null): string {
  const rows: string[][] = [['phase', 'status', 'requested', 'local_path', 'detail']]
  for (const item of preview.matched) rows.push(['match', 'matched', item.requested, item.file.path, ''])
  for (const requested of preview.missing) rows.push(['match', 'missing', requested, '', ''])
  for (const item of preview.ambiguous) {
    const chosen = resolvedPaths[item.requested]
    rows.push(['match', chosen ? 'resolved' : 'ambiguous', item.requested, chosen || '', item.files.map(file => file.path).join(' | ')])
  }
  if (copy) {
    for (const outcome of copy.outcomes) {
      rows.push(['copy', outcome.status, outcome.requested, outcome.sourcePath, outcome.detail])
    }
  }
  return '\uFEFF' + csv(rows)
}
