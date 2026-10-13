export type SelectionLimit =
  | { kind: 'unlimited' }
  | { kind: 'exact' | 'maximum' | 'minimum'; count: number }
  | { kind: 'range'; min: number; max: number }

export function canSelectAnother(limit: SelectionLimit, selectedCount: number): boolean {
  if (limit.kind === 'exact' || limit.kind === 'maximum') return selectedCount < limit.count
  if (limit.kind === 'range') return selectedCount < limit.max
  return true
}

export function canFinalizeSelection(limit: SelectionLimit, selectedCount: number): boolean {
  switch (limit.kind) {
    case 'unlimited': return true
    case 'exact': return selectedCount === limit.count
    case 'maximum': return selectedCount <= limit.count
    case 'minimum': return selectedCount >= limit.count
    case 'range': return selectedCount >= limit.min && selectedCount <= limit.max
  }
}
