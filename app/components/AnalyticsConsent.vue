<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { isAnalyticsEnabled } from '~/lib/analytics-consent'
const config = useRuntimeConfig().public
const route = useRoute()
const { choice, ready, settingsOpen, initialize, decide, openSettings, closeSettings } = useAnalyticsConsent()
const enabled = computed(() => isAnalyticsEnabled(config.ga4Enabled, config.ga4MeasurementId))
const bannerVisible = computed(() => enabled.value && ready.value && (choice.value === 'unknown' || settingsOpen.value))
const settingsVisible = computed(() => enabled.value && ready.value && choice.value !== 'unknown'
  && !bannerVisible.value && !['/', '/create', '/tools/file-filter', '/studio'].includes(route.path))
const bannerTitle = ref<HTMLElement | null>(null)
const floatingSettingsButton = ref<HTMLButtonElement | null>(null)
let settingsOpener: HTMLElement | null = null

watch(settingsOpen, async open => {
  if (open) {
    settingsOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    bannerTitle.value?.focus()
  } else if (choice.value !== 'unknown') {
    await nextTick()
    const target = settingsOpener?.isConnected ? settingsOpener : floatingSettingsButton.value
    target?.focus()
    settingsOpener = null
  }
})

onMounted(initialize)
</script>

<template>
  <!-- In document flow: never cover the gallery's fixed selection controls. -->
  <section
    v-if="bannerVisible"
    role="region"
    aria-labelledby="analytics-consent-title"
    class="border-t border-line bg-white px-4 pt-4 pb-[max(8rem,env(safe-area-inset-bottom))] text-sm text-ink sm:px-6"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div class="min-w-0">
        <h2 id="analytics-consent-title" ref="bannerTitle" tabindex="-1" class="font-semibold">Phân tích lượt sử dụng</h2>
        <p class="mt-1 text-muted">
          Cho phép Google Analytics giúp chúng tôi hiểu cách sử dụng Zeno Studio và cải thiện sản phẩm.
          Bạn có thể thay đổi lựa chọn bất cứ lúc nào.
          <a href="https://www.zenocorp.vn/privacy" class="focus-ring rounded underline underline-offset-4 hover:text-brand">Chính sách bảo mật</a>
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <button type="button" class="focus-ring min-h-11 rounded-lg border border-line px-4 font-medium hover:bg-canvas" @click="decide('rejected')">Từ chối</button>
        <button type="button" class="focus-ring min-h-11 rounded-lg bg-brand px-4 font-medium text-white hover:bg-brand-dark" @click="decide('accepted')">Đồng ý</button>
        <button v-if="choice !== 'unknown'" type="button" class="focus-ring min-h-11 rounded-lg px-3 text-muted hover:text-ink" @click="closeSettings">Đóng</button>
      </div>
    </div>
  </section>
  <div v-else-if="settingsVisible" class="px-4 pt-2 pb-[max(8rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
    <button ref="floatingSettingsButton" type="button" class="focus-ring min-h-11 rounded px-2 hover:text-brand" @click="openSettings">Cài đặt phân tích</button>
  </div>
</template>
