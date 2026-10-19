<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { AlbumStatus } from '~~/shared/domain/album-status'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'

const props = defineProps<{
  studioId: string
  albumId: string
  status: AlbumStatus
  canPublish: boolean
  canShare: boolean
  primary?: boolean
}>()
const emit = defineEmits<{ published: [] }>()

const link = ref('')
const copied = ref(false)
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
    <div v-if="link" class="flex w-full min-w-0 items-center gap-1 rounded-xl border border-line bg-tint py-1 pl-3 pr-1 text-sm">
      <a :href="link" target="_blank" rel="noopener noreferrer" :title="link" translate="no" class="focus-ring min-w-0 flex-1 truncate rounded py-2 text-muted underline-offset-4 hover:text-brand hover:underline">{{ link }}</a>
      <button type="button" aria-label="Sao chép lại link" title="Sao chép lại link" class="focus-ring grid size-11 shrink-0 place-items-center rounded-lg text-brand hover:bg-white" @click="copy(link)">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="size-4"><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></svg>
      </button>
    </div>
    <p v-if="message?.tone === 'error'" role="alert" class="w-full text-sm text-danger">{{ message.text }}</p>
    <p v-else role="status" :class="message?.tone === 'info' ? 'w-full text-sm text-brand' : 'sr-only'">{{ message?.text }}</p>
  </div>
</template>
