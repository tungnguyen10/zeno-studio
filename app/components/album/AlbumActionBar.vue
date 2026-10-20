<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import type { AlbumStatus } from '~~/shared/domain/album-status'
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  status: AlbumStatus
  hasResults: boolean
  canReopen: boolean
  actionAvailable: boolean
  resultsTo: RouteLocationRaw
  busy: boolean
}>()
const emit = defineEmits<{ reopen: [] }>()
defineSlots<{ actions(): any }>()

const menuOpen = shallowRef(false)
const menuRoot = useTemplateRef<HTMLElement>('menuRoot')
const menuTrigger = useTemplateRef<HTMLButtonElement>('menuTrigger')
const menuPanel = useTemplateRef<HTMLElement>('menuPanel')
const menuId = useId()

const primaryResults = computed(() => props.hasResults && props.status !== 'DRAFT' && props.status !== 'PUBLISHED')
const previousResults = computed(() => props.hasResults && props.status === 'PUBLISHED')
const inlineAction = computed(() => props.actionAvailable && (props.status === 'DRAFT' || (props.status === 'PUBLISHED' && !previousResults.value)))
const menuAction = computed(() => props.actionAvailable && !inlineAction.value)
const hasMore = computed(() => props.canReopen || previousResults.value || menuAction.value)

async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    await nextTick()
    menuPanel.value?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus()
  }
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  menuTrigger.value?.focus()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) {
    event.preventDefault()
    closeMenu()
  }
}

function onFocusOut(event: FocusEvent) {
  // A button becoming disabled during an async request can blur to <body> with no related target.
  if (menuOpen.value && event.relatedTarget && !menuRoot.value?.contains(event.relatedTarget as Node)) menuOpen.value = false
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown))
watch(() => props.status, closeMenu)
</script>

<template>
  <div class="mt-6 border-b border-line pb-5 sm:mt-7">
    <div class="items-center gap-2" :class="primaryResults && hasMore ? 'grid grid-cols-[minmax(0,1fr)_auto] lg:flex' : 'flex flex-wrap'">
      <UiButton v-if="primaryResults" :to="resultsTo" class="w-full lg:w-auto">
        <span class="sm:hidden">Xem kết quả</span><span class="hidden sm:inline">Xem kết quả đã chốt</span>
      </UiButton>

      <div v-if="inlineAction" class="min-w-0 max-w-full w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">
        <slot name="actions" />
      </div>

      <div v-if="hasMore" ref="menuRoot" class="relative min-w-0 lg:contents" @focusout="onFocusOut">
        <button
          ref="menuTrigger"
          type="button"
          class="focus-ring inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-line bg-white px-4 text-sm font-semibold text-brand hover:bg-tint lg:hidden"
          :aria-expanded="menuOpen"
          :aria-controls="menuId"
          @click="toggleMenu"
        >
          Thêm <span aria-hidden="true" class="text-base leading-none">⌄</span>
        </button>
        <div v-if="menuOpen" class="fixed inset-0 z-30 bg-black/30 lg:hidden" aria-hidden="true" @click="closeMenu" />
        <div
          :id="menuId"
          ref="menuPanel"
          role="group"
          aria-label="Thao tác album khác"
          class="z-40 gap-2 rounded-2xl border border-line bg-white p-3 shadow-xl lg:static lg:inset-auto lg:z-auto lg:min-w-0 lg:max-w-full lg:flex-1 lg:flex-wrap lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
          :class="menuOpen ? 'fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] flex flex-col lg:flex-row' : 'hidden lg:flex lg:flex-row'"
        >
          <div v-if="menuAction" class="flex flex-wrap items-center gap-2 lg:contents max-lg:[&_button:not([aria-label]):not(dialog_button)]:flex-1 max-lg:[&_button:not([aria-label]):not(dialog_button)]:justify-start">
            <slot name="actions" />
          </div>
          <UiButton v-if="previousResults" :to="resultsTo" variant="secondary" class="w-full justify-start lg:w-auto lg:justify-center">Xem bộ chốt trước</UiButton>
          <UiButton v-if="canReopen" variant="secondary" :loading="busy" class="w-full justify-start lg:w-auto lg:justify-center" @click="emit('reopen')">{{ busy ? 'Đang mở…' : 'Mở vòng chọn mới' }}</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
