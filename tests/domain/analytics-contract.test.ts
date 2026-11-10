import { describe, expect, it } from 'vitest'
import { buildAnalyticsEvent, normalizeAnalyticsError, photoCountBucket } from '../../app/lib/analytics-model'
const analytics = { albumId: `alb_${'a'.repeat(64)}` }
const attempt_id = '11111111-1111-4111-8111-111111111111'
const created = { attempt_id, event_id: `album_created:${analytics.albumId}`, duration_ms: 1, source_method: 'google_drive', photo_count_bucket: '1_20' }
const build = (event: unknown) => buildAnalyticsEvent(event as never)
describe('analytics v2 contract', () => {
  it('maps authorized identity and strips free text and raw ids', () => {
    expect(build({ name: 'album_created', analytics, creation_flow: 'studio', ...created, albumId: 'raw', token: 'secret', email: 'private', filename: 'private' })).toEqual({ name: 'album_created', params: { album_id: analytics.albumId, creation_flow: 'studio', ...created } })
  })
  it('requires album identity but preserves pre-album and standalone events', () => {
    expect(build({ name: 'album_opened' })).toBeNull()
    expect(build({ name: 'album_opened', analytics: { albumId: 'raw' } })).toBeNull()
    expect(build({ name: 'album_creation_started', creation_flow: 'studio', entry_point: 'studio_create_dialog' })).not.toBeNull()
    expect(build({ name: 'file_match_completed', context: 'standalone', matched_count: 0, missing_count: 1, ambiguous_count: 0 })).toEqual({ name: 'file_match_completed', params: { context: 'standalone', matched_count: 0, missing_count: 1, ambiguous_count: 0 } })
    expect(build({ name: 'file_match_completed', context: 'album', matched_count: 0, missing_count: 0, ambiguous_count: 0 })).toBeNull()
  })
  it.each([{ name: 'unknown' }, { name: 'album_created', analytics, creation_flow: 'fake' }, { name: 'gallery_view_changed', analytics, layout: 'private', surface: 'customer' }, { name: 'photo_selected', analytics, selected_count: '1' }, { name: 'photo_selected', analytics, selected_count: -1 }, { name: 'photo_selected', analytics, selected_count: NaN }, { name: 'photo_selected', analytics, selected_count: Infinity }, { name: 'album_opened', analytics, actor_type: 'fake' }])('rejects invalid runtime inputs %j', event => { expect(build(event)).toBeNull() })
  it('allows rejected outcomes and only safe stable event ids', () => {
    expect(build({ name: 'guest_selection_save_rejected', analytics, cycle: 1, attempt_id, outcome: 'limit_reached' })?.params.outcome).toBe('limit_reached')
    expect(build({ name: 'guest_selection_save_rejected', analytics, outcome: 'saved' })).toBeNull()
    expect(build({ name: 'selection_finalized', analytics, cycle: 1, version_number: 2, selection_count: 0, attempt_id, surface: 'studio', event_id: `selection_finalized:${analytics.albumId}:2` })?.params.event_id).toBe(`selection_finalized:${analytics.albumId}:2`)
    expect(build({ name: 'selection_finalized', analytics, surface: 'studio', event_id: 'private' })).toBeNull()
  })
  it.each([[0,'0'],[1,'1_20'],[20,'1_20'],[21,'21_50'],[50,'21_50'],[51,'51_100'],[100,'51_100'],[101,'101_300'],[300,'101_300'],[301,'over_300']])('buckets %s', (value, bucket) => { expect(photoCountBucket(value as number)).toBe(bucket) })
  it.each([-1, NaN, Infinity, 1.5, '1'])('rejects invalid bucket %s', value => { expect(photoCountBucket(value as number)).toBeUndefined() })
  it.each([[400,'validation','validation'],[422,'validation','validation'],[401,'permission','permission'],[403,'permission','permission'],[404,'not_found','api'],[409,'conflict','api'],[410,'expired','api'],[413,'validation','validation'],[429,'rate_limited','api'],[502,'upstream','api'],[503,'upstream','api'],[500,'unknown','unknown']])('normalizes HTTP %s', (statusCode, code, category) => {
    expect(normalizeAnalyticsError({ statusCode, message: 'private' })).toEqual({ error_code: code, error_category: category })
  })
  it('normalizes only structured network and timeout errors', () => {
    expect(normalizeAnalyticsError({ name: 'TimeoutError', message: 'private' }).error_code).toBe('timeout')
    expect(normalizeAnalyticsError({ request: {}, message: 'private' }).error_code).toBe('network')
    expect(normalizeAnalyticsError(new Error('timeout private'))).toEqual({ error_code: 'unknown', error_category: 'unknown' })
  })
})

describe('mandatory analytics semantics', () => {
  it.each([
    { name: 'album_created', analytics, creation_flow: 'studio' },
    { name: 'album_creation_started', creation_flow: 'guest' },
    { name: 'album_creation_submitted', creation_flow: 'guest' },
    { name: 'album_creation_failed', creation_flow: 'guest' },
    { name: 'album_shared', analytics },
    { name: 'album_opened', analytics },
    { name: 'guest_selection_started', analytics },
    { name: 'photo_selected', analytics },
    { name: 'guest_selection_save_rejected', analytics },
    { name: 'selection_finalized', analytics, surface: 'studio' },
    { name: 'gallery_view_changed', analytics },
    { name: 'file_match_completed', matched_count: 0, missing_count: 0, ambiguous_count: 0 },
    { name: 'album_creation_started', creation_flow: 'studio', entry_point: 'private' },
  ])('drops incomplete or invented semantics %j', event => { expect(build(event)).toBeNull() })
  it('ties result dedup identity to its exact backend version/cycle', () => {
    const attempt_id = '11111111-1111-4111-8111-111111111111'
    expect(build({ name: 'selection_finalized', analytics, cycle: 1, version_number: 2, selection_count: 0, attempt_id, surface: 'studio', event_id: `selection_finalized:${analytics.albumId}:3` })).toBeNull()
    expect(build({ name: 'selection_reopened', analytics, cycle: 2, surface: 'studio', event_id: `selection_reopened:${analytics.albumId}:3` })).toBeNull()
  })
})

const validEvents = [
  { name: 'studio_home_viewed', screen_name: 'studio_home' },
  { name: 'album_creation_started', creation_flow: 'guest', entry_point: 'quick_create_page' },
  { name: 'album_creation_submitted', creation_flow: 'studio', attempt_id, source_method: 'google_drive' },
  { name: 'album_created', analytics, creation_flow: 'studio', ...created },
  { name: 'album_creation_failed', creation_flow: 'guest', attempt_id, error_code: 'upstream', error_category: 'api' },
  { name: 'album_published', analytics, creation_flow: 'studio', event_id: `album_published:${analytics.albumId}`, photo_count_bucket: '0' },
  { name: 'album_shared', analytics, share_method: 'clipboard', share_content: 'message', share_channel: 'copy_link' },
  { name: 'album_opened', analytics, cycle: 1, photo_count_bucket: '0', guest_auth_type: 'token' },
  { name: 'guest_selection_started', analytics, cycle: 1, selection_count: 0 },
  { name: 'photo_selected', analytics, cycle: 1, selected_count: 1 },
  { name: 'photo_unselected', analytics, cycle: 1, selected_count: 0 },
  { name: 'guest_selection_save_failed', analytics, cycle: 1, attempt_id, error_code: 'network', error_category: 'network' },
  { name: 'guest_selection_save_rejected', analytics, cycle: 1, attempt_id, outcome: 'conflict' },
  { name: 'selection_finalize_submitted', analytics, cycle: 1, attempt_id },
  { name: 'selection_finalized', analytics, cycle: 1, attempt_id, version_number: 2, selection_count: 1, surface: 'studio', event_id: `selection_finalized:${analytics.albumId}:2` },
  { name: 'selection_finalize_failed', analytics, cycle: 1, attempt_id, error_code: 'timeout', error_category: 'network' },
  { name: 'selection_reopened', analytics, cycle: 2, surface: 'guest_admin', event_id: `selection_reopened:${analytics.albumId}:2` },
  { name: 'gallery_view_changed', analytics, layout: 'grid', surface: 'customer' },
  { name: 'photo_note_saved', analytics, cycle: 1 },
  { name: 'file_match_completed', analytics, context: 'album', version_number: 2, cycle: 1, matched_count: 1, missing_count: 0, ambiguous_count: 0 },
  { name: 'file_match_completed', context: 'standalone', matched_count: 1, missing_count: 0, ambiguous_count: 0 },
]
describe('complete taxonomy allowlist', () => {
  it.each(validEvents)('accepts %j without forwarding injected request context', event => {
    const result = build({ ...event, environment: 'private', taxonomy_version: 'private', app_version: 'private', title: 'private', filename: 'private', note: 'private', token: 'private', photo_id: 'private' })
    expect(result?.name).toBe(event.name)
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it.each([NaN, Infinity, -1, '1', 1.5])('actually validates counts with otherwise valid context: %s', selected_count => {
    expect(build({ name: 'photo_selected', analytics, cycle: 1, selected_count })).toBeNull()
  })
  it.each(['album_id', 'email', 'filename', 'raw album id'])('never accepts arbitrary attempt IDs %s', attempt_id => {
    expect(build({ name: 'album_creation_submitted', creation_flow: 'guest', source_method: 'google_drive', attempt_id })).toBeNull()
  })
  it('ignores actor/album identity on standalone tooling even when injected', () => {
    const result = build({ name: 'file_match_completed', context: 'standalone', analytics, actor_type: 'studio', cycle: 1, matched_count: 0, missing_count: 0, ambiguous_count: 0 })
    expect(result?.params).toEqual({ context: 'standalone', matched_count: 0, missing_count: 0, ambiguous_count: 0 })
  })
})
