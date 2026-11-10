/** Authorized, server-generated identity. Never an access credential. */
export type AnalyticsIdentity = { albumId: string }
export const ANALYTICS_EVENT_NAMES = [
  'studio_home_viewed', 'album_creation_started', 'album_creation_submitted', 'album_created',
  'album_creation_failed', 'album_published', 'album_shared', 'album_opened',
  'guest_selection_started', 'photo_selected', 'photo_unselected', 'guest_selection_save_failed',
  'guest_selection_save_rejected', 'selection_finalize_submitted', 'selection_finalized',
  'selection_finalize_failed', 'selection_reopened', 'gallery_view_changed', 'photo_note_saved',
  'file_match_completed',
] as const
export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number]
export type AnalyticsEnvironment = 'production' | 'staging' | 'development'
export type PhotoCountBucket = '0' | '1_20' | '21_50' | '51_100' | '101_300' | 'over_300'
export type AnalyticsErrorCode = 'validation' | 'network' | 'timeout' | 'permission' | 'not_found' | 'expired' | 'conflict' | 'rate_limited' | 'upstream' | 'unknown'
export type AnalyticsErrorCategory = 'validation' | 'network' | 'api' | 'permission' | 'unknown'
type Common = {
  analytics?: AnalyticsIdentity
  actor_type?: 'studio' | 'guest_admin' | 'customer'
  screen_name?: 'studio_home' | 'album_create' | 'album_manage' | 'guest_album' | 'album_results' | 'file_filter'
  cycle?: number
}
type Attempt = { attempt_id?: string }
type Result = { event_id?: string }
type Failure = Attempt & { error_code: AnalyticsErrorCode; error_category: AnalyticsErrorCategory }
type Creation = { creation_flow: 'studio' | 'guest' }
type Source = { source_method?: 'google_drive' }
type Bucket = { photo_count_bucket?: PhotoCountBucket }
export type AnalyticsEvent = Common & (
  | { name: 'studio_home_viewed' }
  | ({ name: 'album_creation_started'; entry_point?: 'quick_create_page' | 'studio_create_dialog' } & Creation)
  | ({ name: 'album_creation_submitted' } & Creation & Attempt & Source)
  | ({ name: 'album_created'; duration_ms?: number } & Creation & Attempt & Result & Source & Bucket)
  | ({ name: 'album_creation_failed' } & Creation & Failure)
  | ({ name: 'album_published' } & Creation & Result & Bucket)
  | { name: 'album_shared'; share_method: 'clipboard'; share_content: 'link' | 'message'; share_channel: 'copy_link' }
  | ({ name: 'album_opened'; guest_auth_type?: 'token' } & Bucket)
  | { name: 'guest_selection_started'; selection_count?: number }
  | { name: 'photo_selected' | 'photo_unselected'; selected_count?: number }
  | ({ name: 'guest_selection_save_failed' | 'selection_finalize_failed' } & Failure)
  | ({ name: 'guest_selection_save_rejected'; outcome: 'conflict' | 'limit_reached' } & Attempt)
  | ({ name: 'selection_finalize_submitted' } & Attempt)
  | ({ name: 'selection_finalized'; surface: 'studio' | 'guest_admin'; version_number?: number; selection_count?: number } & Attempt & Result)
  | ({ name: 'selection_reopened'; surface: 'studio' | 'guest_admin' } & Result)
  | { name: 'gallery_view_changed'; layout: 'justified' | 'grid' | 'masonry' | 'list'; surface: 'customer' | 'studio' }
  | { name: 'photo_note_saved' }
  | { name: 'file_match_completed'; context?: 'album' | 'standalone'; version_number?: number; matched_count: number; missing_count: number; ambiguous_count: number }
)
