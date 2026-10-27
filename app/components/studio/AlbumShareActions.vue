<script setup lang="ts">
import { trackAnalyticsEvent } from '~/lib/analytics-events'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import type { AlbumStatus } from '~~/shared/domain/album-status'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'

const props = defineProps<{
  studioId: string
  albumId: string
  status: AlbumStatus
  canPublish: boolean
  canShare: boolean
  primary?: boolean
  // List rows/cards: keep the link and QR in a dialog instead of growing inline.
  compact?: boolean
  albumTitle?: string
}>()
const emit = defineEmits<{ published: [] }>()

// Tokens are stored hashed server-side and can't be re-read, so cache the resolved link here
// to avoid minting a new customer token every time the studio reopens this page.
const storageKey = `zeno-studio:album-link:${props.albumId}`

const link = ref('')
onMounted(() => { link.value = localStorage.getItem(storageKey) ?? '' })
const copied = ref(false)
const qrDataUrl = ref('')
const qrError = ref(false)
// Regenerate lazily if the link ever changes, instead of showing a stale code.
watch(link, () => { qrDataUrl.value = ''; qrError.value = false })

async function generateQr() {
  if (qrDataUrl.value || !link.value) return
  try { qrDataUrl.value = await QRCode.toDataURL(link.value, { margin: 1, width: 200 }) }
  catch { qrError.value = true }
}

function toggleQr(event: Event) {
  if ((event.target as HTMLDetailsElement).open) void generateQr()
}

const panelOpen = ref(false)
watch([panelOpen, link], ([open]) => { if (open) void generateQr() })
const busy = ref<'publish' | 'share' | null>(null)
// `quiet` messages are announced to screen readers only; the button label already shows them.
const message = ref<{ text: string; tone: 'info' | 'quiet' | 'error' } | null>(null)
const publishedNow = ref(false)

const status = computed(() => publishedNow.value ? 'PUBLISHED' : props.status)
const showPublish = computed(() => status.value === 'DRAFT' && props.canPublish)
const showShare = computed(() => ['PUBLISHED', 'FINALIZED', 'DELIVERED'].includes(status.value) && props.canShare)

const base = 'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-50 sm:px-5'
const buttonClass = computed(() => [base, props.primary ? 'bg-brand text-white hover:bg-brand-dark' : 'border border-line bg-white text-brand hover:bg-tint'])

async function request(action: 'publish' | 'share') {
  busy.value = action
  message.value = null
  const pending = $fetch<{ customerToken: string }>(`/api/studio/${props.studioId}/albums/${props.albumId}/${action}`, { method: 'POST' })
    .then(result => `${location.origin}/album/${props.albumId}?token=${result.customerToken}`)
  // Start the clipboard write inside the click so Safari keeps the user activation.
  const copying = copy(pending)
  try {
    link.value = await pending
    if (action === 'publish') trackAnalyticsEvent({ name: 'album_published', creation_flow: 'studio' })
    localStorage.setItem(storageKey, link.value)
    const ok = await copying
    if (action === 'publish') {
      publishedNow.value = true
      if (ok) message.value = { text: 'Đã xuất bản và sao chép link khách hàng. Dán để gửi cho khách.', tone: 'info' }
      emit('published')
    }
  } catch (error) {
    message.value = { text: studioAlbumErrorMessage(error), tone: 'error' }
  } finally { busy.value = null }
}

async function share() {
  if (link.value) await copy(link.value)
  else await request('share')
}

async function openPanel() {
  if (!link.value) {
    busy.value = 'share'
    message.value = null
    try {
      const result = await $fetch<{ customerToken: string }>(`/api/studio/${props.studioId}/albums/${props.albumId}/share`, { method: 'POST' })
      link.value = `${location.origin}/album/${props.albumId}?token=${result.customerToken}`
      localStorage.setItem(storageKey, link.value)
    } catch (error) {
      message.value = { text: studioAlbumErrorMessage(error), tone: 'error' }
      return
    } finally { busy.value = null }
  }
  panelOpen.value = true
}

let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))

async function copy(source: string | Promise<string>) {
  try {
    if (typeof source !== 'string' && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': source.then(text => new Blob([text], { type: 'text/plain' })) })])
    } else {
      await navigator.clipboard.writeText(await source)
    }
    message.value = { text: 'Đã sao chép link khách hàng.', tone: 'quiet' }
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2500)
    return true
  } catch {
    // A failed link request is reported by `request`; only report clipboard failures here.
    if (await Promise.resolve(source).then(() => true, () => false)) {
      message.value = { text: 'Không sao chép được tự động. Mở link bên dưới hoặc chọn và sao chép trực tiếp.', tone: 'error' }
    }
    return false
  }
}
</script>

<template>
  <div class="contents">
    <button v-if="showPublish" type="button" :disabled="busy !== null" :aria-busy="busy === 'publish'" :class="buttonClass" @click="request('publish')">{{ busy === 'publish' ? 'Đang xuất bản…' : 'Xuất bản' }}</button>
    <button v-if="showShare" type="button" :disabled="busy !== null" :aria-busy="busy === 'share'" :class="buttonClass" @click="share">
      <svg v-if="copied" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clip-rule="evenodd" /></svg>
      <svg v-else aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="size-4"><path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24L10 5.76" /><path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l1-1" /></svg>
      {{ busy === 'share' ? 'Đang lấy link…' : copied ? 'Đã sao chép' : 'Sao chép link khách' }}
    </button>
    <template v-if="compact">
      <button v-if="showShare" type="button" aria-label="Link và mã QR" title="Link và mã QR" :disabled="busy !== null" class="focus-ring grid size-11 shrink-0 place-items-center rounded-full border border-line bg-white text-brand transition-colors hover:bg-tint disabled:opacity-50" @click="openPanel">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><rect x="3" y="3" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1" /><path d="M11.5 11.5h2v2h-2zM15 15h2v2h-2zM15 11.5h2M11.5 15v2" /></svg>
      </button>
      <UiModal v-model:open="panelOpen" :title="albumTitle ? `Chia sẻ ${albumTitle}` : 'Chia sẻ album'" description="Gửi link hoặc cho khách quét mã QR để mở album.">
        <div v-if="link" class="space-y-4">
          <StudioAlbumShareLink :link="link" @copy="copy(link)" />
          <div class="flex justify-center rounded-2xl border border-line bg-canvas p-4">
            <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`Mã QR mở album cho khách: ${link}`" width="200" height="200" class="rounded-lg">
            <p v-else-if="qrError" role="alert" class="text-sm text-danger">Không tạo được mã QR.</p>
            <p v-else class="grid size-[200px] place-items-center text-sm text-muted">Đang tạo mã QR…</p>
          </div>
          <p class="text-sm" :class="copied ? 'text-brand' : 'text-muted'" aria-hidden="true">{{ copied ? 'Đã sao chép link khách hàng.' : 'Khách mở link hoặc quét mã để chọn ảnh.' }}</p>
        </div>
      </UiModal>
    </template>
    <div v-else-if="link" class="w-full min-w-0">
      <StudioAlbumShareLink :link="link" @copy="copy(link)" />
      <details class="group mt-2 rounded-xl border border-line bg-canvas px-3 text-sm" @toggle="toggleQr">
        <summary class="focus-ring -mx-1 flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 font-semibold text-brand [&::-webkit-details-marker]:hidden">
          <span>Mã QR cho khách quét</span>
          <span aria-hidden="true" class="text-muted transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div class="flex justify-center pb-3 pt-1">
          <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`Mã QR mở album cho khách: ${link}`" width="160" height="160" class="rounded-lg">
          <p v-else-if="qrError" role="alert" class="text-sm text-danger">Không tạo được mã QR.</p>
          <p v-else class="text-sm text-muted">Đang tạo mã QR…</p>
        </div>
      </details>
    </div>
    <p v-if="message?.tone === 'error'" role="alert" class="w-full text-sm text-danger">{{ message.text }}</p>
    <p v-else role="status" :class="message?.tone === 'info' ? 'w-full text-sm text-brand' : 'sr-only'">{{ message?.text }}</p>
  </div>
</template>
