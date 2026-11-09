export type InAppBrowser = { app: string; platform: 'android' | 'ios' }

const apps: Array<[string, RegExp]> = [
  ['Zalo', /\bZalo\b/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|Messenger/],
  ['Instagram', /\bInstagram\b/],
  ['TikTok', /BytedanceWebview|musical_ly|TikTok/i],
  ['Line', /\bLine\//],
]

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  const match = apps.find(([, pattern]) => pattern.test(userAgent))
  if (!match) return null
  if (/Android/i.test(userAgent)) return { app: match[0], platform: 'android' }
  if (/iP(hone|od|ad)/.test(userAgent)) return { app: match[0], platform: 'ios' }
  return null
}

export function buildAndroidIntentUrl(href: string): string {
  const url = new URL(href)
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};end`
}
