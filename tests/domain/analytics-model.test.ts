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
  })

  it('allowlists event properties and discards injected fields', () => {
    const event = { name: 'album_created', creation_flow: 'guest', albumId: 'secret' } as const
    expect(buildAnalyticsEvent(event).params).toEqual({ creation_flow: 'guest' })
    expect(buildAnalyticsEvent({ name: 'photo_selected', selected_count: -1 }).params).toEqual({})
  })
})
