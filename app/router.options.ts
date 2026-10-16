import type { RouterConfig } from '@nuxt/schema'

export default {
  scrollBehavior(to, _from, savedPosition) {
    if (to.hash.startsWith('#admin-')) return { top: 0 }
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
} satisfies RouterConfig
