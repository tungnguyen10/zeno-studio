import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimSessionEvent, releaseSessionEvent } from '../../app/lib/analytics-session'
import { createAnalyticsDispatcher, newAnalyticsAttemptId, registerAnalyticsSender, trackAnalyticsEvent } from '../../app/lib/analytics-events'
import { safePage } from '../../app/lib/analytics-model'
const analytics = { albumId: `alb_${'b'.repeat(64)}` }
const event = { name: 'guest_selection_started', analytics, cycle: 2, selection_count: 1 } as const
const common = { environment: 'staging', app_version: '123abcd', taxonomy_version: 'zeno_v2' } as const
function storage(): Storage {
  const values = new Map<string,string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key,value) }, removeItem: key => { values.delete(key) }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size } }
}
beforeEach(() => { registerAnalyticsSender(null) })
describe('session claims', () => {
  it('uses persisted keys and release supports retry', () => {
    const store = storage()
    expect(claimSessionEvent('session-release', store)).toBe(true)
    expect(claimSessionEvent('session-release', store)).toBe(false)
    releaseSessionEvent('session-release', store)
    expect(claimSessionEvent('session-release', store)).toBe(true)
  })
  it('retains memory fallback with blocked storage', () => {
    const store = { getItem() { throw new Error('private') }, setItem() { throw new Error('private') } } as unknown as Storage
    expect(claimSessionEvent('blocked', store)).toBe(true)
    expect(claimSessionEvent('blocked', store)).toBe(false)
  })
})
describe('safe analytics dispatch', () => {
  it('buffers at most 50 safe payloads and captures context before route changes', () => {
    let path = '/create?token=secret'
    const dispatch = createAnalyticsDispatcher({ enabled: true, common, getPage: () => safePage(path, 'https://studio.example') })
    for (let i = 0; i < 51; i++) dispatch.send({ name: 'album_creation_started', creation_flow: 'guest', entry_point: 'quick_create_page' })
    path = '/studio'
    const delivered: unknown[] = []
    dispatch.start((name, params) => delivered.push({ name, params }))
    dispatch.start((name, params) => delivered.push({ name, params }))
    expect(delivered).toHaveLength(50)
    expect(delivered[0]).toEqual({ name: 'album_creation_started', params: { creation_flow: 'guest', entry_point: 'quick_create_page', page_location: 'https://studio.example/create', page_title: 'Tạo album', ...common } })
  })
  it('gate disabled and full queue never commit dedup', () => {
    const store = storage()
    const options = { common, storage: store, getPage: () => safePage('/album/private', 'https://studio.example') }
    const disabled = createAnalyticsDispatcher({ ...options, enabled: false })
    disabled.send(event)
    const full = createAnalyticsDispatcher({ ...options, enabled: true })
    for (let i = 0; i < 50; i++) full.send({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    full.send(event)
    const enabled = createAnalyticsDispatcher({ ...options, enabled: true })
    enabled.send(event)
    enabled.send(event)
    const delivered = vi.fn()
    enabled.start(delivered)
    expect(delivered).toHaveBeenCalledTimes(1)
  })
  it('dedups results by version and started by album/cycle, survives storage refresh', () => {
    const store = storage()
    const options = { enabled: true, common, storage: store, getPage: () => safePage('/studio', 'https://studio.example') }
    const first = createAnalyticsDispatcher(options)
    const send = vi.fn(); first.start(send)
    for (const version of [1,1,2]) first.send({ name: 'selection_finalized', analytics, surface: 'studio', cycle: 1, version_number: version, selection_count: 0, attempt_id: '11111111-1111-4111-8111-111111111111', event_id: `selection_finalized:${analytics.albumId}:${version}` })
    expect(send).toHaveBeenCalledTimes(2)
    first.dispose()
    first.send({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    const next = createAnalyticsDispatcher(options); next.start(send)
    next.send({ name: 'selection_finalized', analytics, surface: 'studio', cycle: 1, version_number: 1, selection_count: 0, attempt_id: '11111111-1111-4111-8111-111111111111', event_id: `selection_finalized:${analytics.albumId}:1` })
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('isolates sender, validation and transport errors without preventing later events', () => {
    registerAnalyticsSender(() => { throw new Error('private') })
    expect(() => trackAnalyticsEvent({ name: 'studio_home_viewed', screen_name: 'studio_home' })).not.toThrow()
    const dispatch = createAnalyticsDispatcher({ enabled: true, common, getPage: () => safePage('/studio', 'https://studio.example') })
    dispatch.send({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    dispatch.start(() => { throw new Error('private') })
    const next = vi.fn()
    const other = createAnalyticsDispatcher({ enabled: true, common, getPage: () => safePage('/studio', 'https://studio.example') }); other.start(next); other.send({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    expect(next).toHaveBeenCalledTimes(1)
    expect(() => trackAnalyticsEvent(new Proxy({}, { get() { throw new Error('private') } }) as never)).not.toThrow()
  })
  it('generates only random UUIDs or safely omits them', () => {
    const value = newAnalyticsAttemptId()
    expect(value === undefined || /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)).toBe(true)
  })
})

describe('session boundaries and lifecycle', () => {
  it('restores a persisted result claim after module memory resets', async () => {
    const store = storage()
    expect(claimSessionEvent('persisted-refresh', store)).toBe(true)
    vi.resetModules()
    const fresh = await import('../../app/lib/analytics-session')
    expect(fresh.claimSessionEvent('persisted-refresh', store)).toBe(false)
    expect(fresh.claimSessionEvent('new-tab-session', storage())).toBe(true)
  })
  it('does not suppress started for another album or reopened cycle', () => {
    const store = storage()
    const dispatcher = createAnalyticsDispatcher({ enabled: true, common, storage: store, getPage: () => safePage('/album/private', 'https://studio.example') })
    const deliver = vi.fn(); dispatcher.start(deliver)
    const different = { albumId: `alb_${'c'.repeat(64)}` }
    dispatcher.send({ ...event, cycle: 10 })
    dispatcher.send({ ...event, cycle: 10 })
    dispatcher.send({ ...event, cycle: 11 })
    dispatcher.send({ ...event, cycle: 10, analytics: different })
    expect(deliver).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(deliver.mock.calls)).not.toContain('private')
  })
  it('teardown of the old registration cannot clear a replacement sender', () => {
    const old = vi.fn(), next = vi.fn()
    const cleanup = registerAnalyticsSender(old)
    registerAnalyticsSender(next)
    cleanup()
    trackAnalyticsEvent({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    expect(old).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
  it('storage/page/transport failures are fixed-code diagnostics only and do not block later events', () => {
    let broken = true
    const diagnostic = vi.fn(), deliver = vi.fn()
    const dispatcher = createAnalyticsDispatcher({ enabled: true, common, diagnostic, getPage() {
      if (broken) throw new Error('private-token')
      return safePage('/studio', 'https://studio.example')
    } })
    dispatcher.send({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    broken = false
    dispatcher.send({ name: 'studio_home_viewed', screen_name: 'studio_home' })
    dispatcher.start(deliver)
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(diagnostic.mock.calls).toEqual([['analytics_unavailable']])
  })
})
