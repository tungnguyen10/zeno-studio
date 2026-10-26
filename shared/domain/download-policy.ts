import type { AlbumStatus } from './album-status'

export type DownloadAction = 'single' | 'selected' | 'all'

export interface DownloadSettings {
  enabled: boolean
  allowSingle: boolean
  allowSelected: boolean
  allowAll: boolean
  availableWhen: 'anytime' | 'after_finalize'
}

export interface DownloadCapabilities {
  canSingle: boolean
  canSelected: boolean
  canAll: boolean
  reason: 'disabled' | 'waiting_for_finalize' | null
  selectedSource: 'live' | 'snapshot' | null
  selectedCount: number
}

export function evaluateDownload(
  settings: DownloadSettings,
  status: AlbumStatus,
  hasCurrentCycleSnapshot: boolean,
  selectedCount: number,
): DownloadCapabilities {
  const active = status === 'PUBLISHED' || ((status === 'FINALIZED' || status === 'DELIVERED') && hasCurrentCycleSnapshot)
  const timingAllowed = settings.availableWhen === 'anytime' || (status !== 'PUBLISHED' && hasCurrentCycleSnapshot)
  const allowed = settings.enabled && active && timingAllowed
  return {
    canSingle: allowed && settings.allowSingle,
    canSelected: allowed && settings.allowSelected,
    canAll: allowed && settings.allowAll,
    reason: !settings.enabled || !active ? 'disabled' : !timingAllowed ? 'waiting_for_finalize' : null,
    selectedSource: allowed ? status === 'PUBLISHED' ? 'live' : 'snapshot' : null,
    selectedCount: allowed ? selectedCount : 0,
  }
}
