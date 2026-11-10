import { safePage, safeReferrer } from '~/lib/analytics-model'
import { createAnalyticsDispatcher, registerAnalyticsSender } from '~/lib/analytics-events'
import { analyticsCommonContext, isAnalyticsEnabled } from '~/lib/analytics-config'

type AnalyticsWindow = Window & {
  dataLayer?: IArguments[]
  gtag?: (...args: unknown[]) => void
}

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig().public
  if (!isAnalyticsEnabled(config.ga4Enabled, config.ga4MeasurementId)) return

  const router = useRouter()
  const gaWindow = window as AnalyticsWindow
  const common = analyticsCommonContext(config.analyticsEnvironment, config.analyticsAppVersion)
  let active = false
  let disposed = false
  let lastPath: string | null = null
  let previousSafeLocation: string | undefined
  let storage: Storage | undefined
  try { storage = window.sessionStorage } catch { /* Browser may block storage. */ }
  const diagnostic = (code: string) => { if (import.meta.dev || import.meta.test) console.warn(code) }
  const dispatcher = createAnalyticsDispatcher({
    enabled: true, common, storage, diagnostic,
    getPage: () => ({ ...safePage(router.currentRoute.value.path, location.origin), referrer: previousSafeLocation ?? safeReferrer(document.referrer, location.origin) }),
  })
  // Register during setup: page mounted hooks can run before app:mounted.
  const unregister = registerAnalyticsSender(event => dispatcher.send(event))

  function pageView(path: string): void {
    if (!active || disposed || path === lastPath) return
    try {
      const page = safePage(path, location.origin)
      const referrer = previousSafeLocation ?? safeReferrer(document.referrer, location.origin)
      const metadata = {
        page_location: page.location,
        page_title: page.title,
        page_referrer: referrer,
        ...common,
      }
      gaWindow.gtag?.('config', config.ga4MeasurementId, {
        update: true, send_page_view: false, ...metadata,
      })
      gaWindow.gtag?.('event', 'page_view', metadata)
      lastPath = path
      previousSafeLocation = page.location
    } catch { diagnostic('analytics_unavailable') }
  }

  function start(): void {
    if (active || disposed) return
    try {
      gaWindow.dataLayer ??= []
      gaWindow.gtag ??= function () { gaWindow.dataLayer!.push(arguments) }
      gaWindow.gtag('consent', 'default', {
        analytics_storage: 'granted', ad_storage: 'denied',
        ad_user_data: 'denied', ad_personalization: 'denied',
      })
      gaWindow.gtag('js', new Date())
      const page = safePage(router.currentRoute.value.path, location.origin)
      // Safe defaults precede the remote tag. No album/actor context in config.
      gaWindow.gtag('config', config.ga4MeasurementId, {
        send_page_view: false, page_location: page.location, page_title: page.title,
        page_referrer: safeReferrer(document.referrer, location.origin), ...common,
      })
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${config.ga4MeasurementId}`
      document.head.append(script)
      active = true
      dispatcher.start((name, params) => gaWindow.gtag?.('event', name, params))
      pageView(router.currentRoute.value.path)
    } catch { diagnostic('analytics_unavailable') }
  }

  const removeAfterEach = router.afterEach((to, _from, failure) => { if (!failure) pageView(to.path) })
  const removeMounted = nuxtApp.hook('app:mounted', start)
  function dispose() {
    if (disposed) return
    disposed = true
    unregister()
    dispatcher.dispose()
    removeAfterEach()
    removeMounted()
  }
  nuxtApp.vueApp.onUnmount(dispose)
  import.meta.hot?.dispose(dispose)
})
