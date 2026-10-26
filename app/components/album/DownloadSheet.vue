<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DownloadCapabilities } from '~~/shared/domain/download-policy'
import type { ClientDownloadPlan, DownloadMode } from '~/composables/useAlbumDownload'

const props = defineProps<{
  mode: DownloadMode; basketCount: number; selectedCount: number; capabilities: DownloadCapabilities;
  plan: ClientDownloadPlan | null; busy: boolean; error: string
}>()
const emit = defineEmits<{ close: []; mode: [mode: DownloadMode]; clear: []; prepare: [] }>()
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let returnFocus: HTMLElement | null = null
onMounted(async () => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  closeButton.value?.focus()
})
onBeforeUnmount(() => { returnFocus?.focus({ preventScroll: true }) })
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled)')]
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
const prepareLabel = computed(() => props.mode === 'basket'
  ? `Chuẩn bị tải ${props.basketCount} ảnh`
  : props.mode === 'all' ? 'Chuẩn bị tải toàn album' : `Chuẩn bị tải ${props.selectedCount} ảnh`)
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" @click.self="emit('close')">
    <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="download-sheet-title" class="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-xl sm:rounded-3xl sm:p-6" @keydown.stop="onKeydown">
      <div class="flex items-start justify-between gap-3">
        <div><h2 id="download-sheet-title" class="text-xl font-semibold">Tải ảnh gốc</h2><p class="mt-1 text-sm text-muted">Ảnh bạn chọn để tải chỉ giữ trong trang này; tải lại trang sẽ xóa giỏ.</p></div>
        <button ref="closeButton" type="button" class="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-tint" aria-label="Đóng tải ảnh" @click="emit('close')">✕</button>
      </div>
      <div class="mt-5 grid gap-2">
        <button v-if="capabilities.canSelected && capabilities.selectedCount" type="button" class="focus-ring min-h-12 rounded-xl border px-4 text-left text-sm font-semibold" :class="mode === 'selected' ? 'border-brand bg-tint text-brand' : 'border-line hover:bg-tint'" @click="emit('mode', 'selected')">{{ capabilities.selectedSource === 'snapshot' ? 'Tải bộ ảnh đã chốt' : 'Tải ảnh đang chọn' }} · {{ capabilities.selectedCount }} ảnh</button>
        <button v-if="capabilities.canSelected" type="button" class="focus-ring min-h-12 rounded-xl border px-4 text-left text-sm font-semibold" :class="mode === 'basket' ? 'border-brand bg-tint text-brand' : 'border-line hover:bg-tint'" @click="emit('mode', 'basket'); emit('close')">Chọn ảnh khác để tải · {{ basketCount }} ảnh</button>
        <button v-if="capabilities.canAll" type="button" class="focus-ring min-h-12 rounded-xl border px-4 text-left text-sm font-semibold" :class="mode === 'all' ? 'border-brand bg-tint text-brand' : 'border-line hover:bg-tint'" @click="emit('mode', 'all')">Tải toàn album</button>
      </div>
      <p v-if="capabilities.reason === 'waiting_for_finalize'" class="mt-3 text-sm text-muted">Studio sẽ mở quyền tải sau khi chốt vòng chọn hiện tại.</p>
      <div v-if="mode === 'basket'" class="mt-4 flex items-center justify-between gap-3">
        <p class="text-sm text-muted">{{ basketCount }} ảnh trong giỏ tải</p>
        <button type="button" class="focus-ring min-h-11 rounded-lg px-2 text-sm font-semibold text-brand disabled:opacity-50" :disabled="basketCount === 0" @click="emit('clear')">Hủy chọn ảnh tải</button>
      </div>
      <p v-if="error" role="alert" class="mt-3 text-sm text-danger">{{ error }}</p>
      <button type="button" class="focus-ring mt-4 min-h-12 w-full rounded-full bg-brand px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="busy || (mode === 'basket' && (!capabilities.canSelected || basketCount === 0)) || (mode === 'selected' && (!capabilities.canSelected || selectedCount === 0)) || (mode === 'all' && !capabilities.canAll)" @click="emit('prepare')">{{ busy ? 'Đang lập kế hoạch…' : prepareLabel }}</button>
      <section v-if="plan" class="mt-5 border-t border-line pt-4" aria-label="Kế hoạch tải ảnh">
        <h3 class="font-semibold">{{ plan.totalFiles }} ảnh · {{ plan.parts.length }} phần</h3>
        <p class="mt-1 text-xs text-muted">Mỗi phần tải riêng để tránh ZIP quá lớn.</p>
        <ol class="mt-3 space-y-2"><li v-for="part in plan.parts" :key="part.index" class="rounded-xl border border-line bg-canvas px-3 py-2 text-sm"><span class="break-all font-medium">Phần {{ part.index + 1 }}: {{ part.filename }}</span><span class="block text-muted">{{ part.count }} ảnh · {{ (part.byteLength / 1048576).toFixed(1) }} MB</span></li></ol>
        <p v-if="plan.unavailable.length" class="mt-3 text-sm text-danger">{{ plan.unavailable.length }} ảnh không khả dụng trên Drive.</p>
      </section>
    </section>
  </div>
</template>
