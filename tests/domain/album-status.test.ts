import { describe, expect, it } from 'vitest'
import {
  countByFilter, daysLeft, effectiveStatus, filterAlbums, nextStep, sortAlbums, workflowStepIndex,
  type AlbumStatus,
} from '../../shared/domain/album-status'

const now = new Date('2026-10-17T00:00:00Z')
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
const album = (title: string, status: AlbumStatus, days = 10) => ({ title, status, expiresAt: inDays(days) })
const base = { selectedCount: 0, selectionLimit: null, latestVersionNumber: null }
const can = { publish: true, share: true }

describe('album status', () => {
  it('shows an overdue album as expired before the expiry job runs', () => {
    expect(effectiveStatus(album('A', 'PUBLISHED', -1), now)).toBe('EXPIRED')
    expect(effectiveStatus(album('A', 'DELIVERED', -1), now)).toBe('EXPIRED')
    expect(effectiveStatus(album('A', 'PUBLISHED', 1), now)).toBe('PUBLISHED')
  })

  it('rounds the remaining time up to whole days', () => {
    expect(daysLeft(new Date(now.getTime() + 60 * 60 * 1000), now)).toBe(1)
    expect(daysLeft(inDays(3), now)).toBe(3)
    expect(daysLeft(inDays(-2), now)).toBe(-2)
  })

  it('places each status on the workflow', () => {
    expect(['DRAFT', 'PUBLISHED', 'FINALIZED', 'DELIVERED', 'EXPIRED'].map(status => workflowStepIndex(status as AlbumStatus))).toEqual([0, 1, 2, 2, null])
  })

  it('counts and filters albums by effective status and accent-insensitive title', () => {
    const albums = [album('Mai & Quang', 'PUBLISHED'), album('Đám cưới', 'DRAFT'), album('Cũ', 'PUBLISHED', -1)]
    expect(countByFilter(albums, now)).toEqual({ all: 3, DRAFT: 1, PUBLISHED: 1, FINALIZED: 0, DELIVERED: 0, EXPIRED: 1 })
    expect(filterAlbums(albums, 'PUBLISHED', '', now).map(item => item.title)).toEqual(['Mai & Quang'])
    expect(filterAlbums(albums, 'all', 'dam cuoi', now).map(item => item.title)).toEqual(['Đám cưới'])
    expect(filterAlbums(albums, 'EXPIRED', 'xyz', now)).toEqual([])
  })

  it('sorts by name or nearest expiry without mutating newest-first order', () => {
    const albums = [album('Zebra', 'DRAFT', 8), album('Ánh', 'PUBLISHED', 2), album('Mai', 'DRAFT', 5)]
    expect(sortAlbums(albums, 'newest').map(item => item.title)).toEqual(['Zebra', 'Ánh', 'Mai'])
    expect(sortAlbums(albums, 'name').map(item => item.title)).toEqual(['Ánh', 'Mai', 'Zebra'])
    expect(sortAlbums(albums, 'expiry').map(item => item.title)).toEqual(['Ánh', 'Mai', 'Zebra'])
    expect(albums[0]?.title).toBe('Zebra')
  })

})

describe('next step', () => {
  it('asks a publisher to publish a draft and others to wait', () => {
    expect(nextStep({ ...base, status: 'DRAFT' }, can).kind).toBe('publish')
    expect(nextStep({ ...base, status: 'DRAFT' }, { publish: false, share: true }).kind).toBe('detail')
  })

  it('shares a published album until the customer has chosen photos, then asks to finalize', () => {
    expect(nextStep({ ...base, status: 'PUBLISHED' }, can)).toMatchObject({ kind: 'share', hint: 'Chờ khách chọn ảnh' })
    expect(nextStep({ ...base, status: 'PUBLISHED' }, { publish: false, share: false }).kind).toBe('detail')
    expect(nextStep({ ...base, status: 'PUBLISHED', selectedCount: 12, selectionLimit: 30 }, can))
      .toEqual({ kind: 'finalize', hint: 'Khách đã chọn 12/30 ảnh' })
    expect(nextStep({ ...base, status: 'PUBLISHED', selectedCount: 5 }, can).hint).toBe('Khách đã chọn 5 ảnh')
  })

  it('points finalized and delivered albums at the results', () => {
    expect(nextStep({ ...base, status: 'FINALIZED', latestVersionNumber: 2 }, can)).toMatchObject({ kind: 'results', hint: expect.stringContaining('phiên bản 2') })
    expect(nextStep({ ...base, status: 'DELIVERED' }, can).kind).toBe('results')
    expect(nextStep({ ...base, status: 'EXPIRED' }, can).kind).toBe('detail')
  })
})
