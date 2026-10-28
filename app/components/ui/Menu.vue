<script setup lang="ts" generic="K extends string">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

defineProps<{ label: string; items: ReadonlyArray<{ key: K; label: string }>; iconOnly?: boolean }>()
const emit = defineEmits<{ select: [key: K] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelId = useId()
const panelStyle = ref<Record<string, string>>({})

// Fixed coords escape ancestors with overflow (e.g. the album table wrapper) that would clip an absolute panel.
function placePanel() {
  if (!window.matchMedia('(min-width: 640px)').matches || !trigger.value || !panel.value) { panelStyle.value = {}; return }
  const rect = trigger.value.getBoundingClientRect()
  const height = panel.value.offsetHeight
  const below = rect.bottom + 8 + height <= window.innerHeight || rect.top - 8 - height < 0
  panelStyle.value = {
    right: `${Math.max(8, window.innerWidth - rect.right)}px`,
    top: `${below ? rect.bottom + 8 : rect.top - 8 - height}px`,
  }
}

function onViewportChange() { close(false) }

function itemButtons() {
  return Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button[data-menu-item]') ?? [])
}

function close(returnFocus = true) {
  if (!open.value) return
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function choose(key: K) {
  close()
  emit('select', key)
}

function onDocumentPointer(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close(false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const buttons = itemButtons()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
  buttons[next]?.focus()
}

function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) close(false)
}

watch(open, async value => {
  if (value) {
    document.addEventListener('pointerdown', onDocumentPointer)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    await nextTick()
    placePanel()
    itemButtons()[0]?.focus({ preventScroll: true })
  } else {
    document.removeEventListener('pointerdown', onDocumentPointer)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onViewportChange, true)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div ref="root" class="relative" @keydown="onKeydown" @focusout="onFocusOut">
    <button
      v-if="iconOnly"
      ref="trigger"
      type="button"
      class="focus-ring grid size-11 place-items-center rounded-full border border-line bg-white text-brand transition-colors hover:bg-tint"
      :aria-label="label"
      :title="label"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <svg viewBox="0 0 20 20" class="size-5" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="15.5" cy="10" r="1.5" /></svg>
    </button>
    <button
      v-else
      ref="trigger"
      type="button"
      class="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-semibold text-brand transition-colors hover:bg-tint"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      {{ label }}
      <svg viewBox="0 0 20 20" class="size-4 transition-transform motion-reduce:transition-none" :class="open ? 'rotate-180' : ''" fill="currentColor" aria-hidden="true"><path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" /></svg>
    </button>
    <div v-if="open" aria-hidden="true" class="fixed inset-0 z-30 bg-black/30 sm:hidden" @click="close(false)" />
    <ul
      v-show="open"
      :id="panelId"
      ref="panel"
      :style="panelStyle"
      class="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 overscroll-contain rounded-2xl border border-line bg-white p-2 shadow-xl sm:inset-x-auto sm:bottom-auto sm:min-w-48"
    >
      <li v-for="item in items" :key="item.key">
        <button type="button" data-menu-item class="focus-ring flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-tint" @click="choose(item.key)">{{ item.label }}</button>
      </li>
    </ul>
  </div>
</template>
