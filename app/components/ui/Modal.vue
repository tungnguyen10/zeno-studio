<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue'

defineProps<{ title: string; description?: string }>()
const open = defineModel<boolean>('open', { required: true })
const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  else if (!value && el.open) el.close()
}

watch(open, sync, { flush: 'post' })
onMounted(() => sync(open.value))

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}
</script>

<template>
  <!-- Preflight zeroes dialog margins, so the sheet/modal placement is explicit. -->
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="fixed inset-x-0 bottom-0 top-auto max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-black/40 sm:inset-y-0 sm:mx-auto sm:my-auto sm:h-fit sm:max-w-lg sm:rounded-3xl"
    @close="open = false"
    @click="onBackdropClick"
  >
    <div class="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 :id="titleId" class="text-xl font-semibold tracking-tight">{{ title }}</h2>
          <p v-if="description" class="mt-1 text-sm leading-6 text-muted">{{ description }}</p>
        </div>
        <button type="button" aria-label="Đóng" class="focus-ring -mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-tint" @click="open = false">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div class="mt-5">
        <slot />
      </div>
    </div>
  </dialog>
</template>
