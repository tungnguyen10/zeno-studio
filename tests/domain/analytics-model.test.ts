import { describe, expect, it } from 'vitest'
import { buildAnalyticsEvent, safePage, safeReferrer } from '../../app/lib/analytics-model'

const origin = 'https://studio.example'

describe('safe GA4 metadata', () => {
  it('templates private routes and excludes capabilities', () => {
    expect(safePage('/album/a-private-id', origin)).toEqual({
      path: '/album/:albumId', title: 'Album khách', location: `${origin}/album/:albumId`,
    })
    expect(safePage('/guest/albums/a-private-id/results', origin).location).toBe(`${origin}/guest/albums/:albumId/results`)
    expect(safePage('/unrecognized/a-private-id', origin).location).toBe(`${origin}/other`)
    expect(safeReferrer(`${origin}/album/a-private-id?token=secret`, origin)).toBe(`${origin}/album/:albumId`)
    expect(safeReferrer('https://referrer.example/path?email=secret', origin)).toBe('https://referrer.example/')
    expect(safePage('/admin/analytics?token=secret', origin).location).toBe(`${origin}/admin/analytics`)
    expect(safePage('/studio/analytics?studio=private', origin).location).toBe(`${origin}/studio/analytics`)
  })

  it('allowlists event properties and discards injected fields', () => {
    const analytics = { albumId: `alb_${'a'.repeat(64)}` }
    const event = { name: 'album_shared', share_method: 'clipboard', share_content: 'link', share_channel: 'copy_link', analytics, albumId: 'secret' } as const
    expect(buildAnalyticsEvent(event)?.params).toEqual({ album_id: analytics.albumId, share_method: 'clipboard', share_content: 'link', share_channel: 'copy_link' })
    expect(buildAnalyticsEvent({ name: 'photo_selected', analytics, selected_count: -1 })).toBeNull()
  })
})
