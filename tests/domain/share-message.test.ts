import { describe, expect, it } from 'vitest'
import { buildShareMessage } from '../../shared/domain/share-message'
import { buildAndroidIntentUrl, detectInAppBrowser } from '../../app/lib/in-app-browser'

const link = 'https://studio.zenocorp.vn/album/abc?token=xyz'

describe('buildShareMessage', () => {
  it('names the album and ends with the link', () => {
    expect(buildShareMessage({ albumTitle: 'Cưới Lan & Minh', link })).toBe(
      `Album "Cưới Lan & Minh" đã sẵn sàng. Mở link bằng Safari/Chrome (trong Zalo/Messenger: bấm ⋯ → Mở bằng trình duyệt) để chọn ảnh:\n\n${link}`,
    )
  })

  it('falls back to a generic name when the title is blank', () => {
    expect(buildShareMessage({ albumTitle: '  ', link })).toMatch(/^Album ảnh của bạn đã sẵn sàng\./)
    expect(buildShareMessage({ link })).toMatch(/^Album ảnh của bạn đã sẵn sàng\./)
  })
})

describe('detectInAppBrowser', () => {
  const zaloAndroid = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Zalo android/12100'
  const messengerIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerLiteForiOS;FBAV/480.0]'
  const instagramIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0'
  const tiktokAndroid = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6'
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

  it('recognises common in-app browsers and their platform', () => {
    expect(detectInAppBrowser(zaloAndroid)).toEqual({ app: 'Zalo', platform: 'android' })
    expect(detectInAppBrowser(messengerIos)).toEqual({ app: 'Facebook', platform: 'ios' })
    expect(detectInAppBrowser(instagramIos)).toEqual({ app: 'Instagram', platform: 'ios' })
    expect(detectInAppBrowser(tiktokAndroid)).toEqual({ app: 'TikTok', platform: 'android' })
  })

  it('ignores regular browsers', () => {
    expect(detectInAppBrowser(safari)).toBeNull()
    expect(detectInAppBrowser(chrome)).toBeNull()
  })
})

describe('buildAndroidIntentUrl', () => {
  it('keeps path and token so the browser can redeem the link', () => {
    expect(buildAndroidIntentUrl(link)).toBe('intent://studio.zenocorp.vn/album/abc?token=xyz#Intent;scheme=https;end')
  })
})
