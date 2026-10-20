<script setup lang="ts" generic="T extends string | number | undefined">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

export interface SelectOption<Value extends string | number | undefined> {
  value: Value
  label: string
  disabled?: boolean
}

const props = defineProps<{
  label: string
  options: ReadonlyArray<SelectOption<T>>
  name?: string
  disabled?: boolean
  invalid?: boolean
}>()
const model = defineModel<T>({ required: true })
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const active = ref(0)
const listId = useId()
let typed = ''
let typedAt = 0

const selectedIndex = computed(() => props.options.findIndex(option => option.value === model.value))
const selected = computed(() => props.options[selectedIndex.value])
const enabled = computed(() => props.options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0))
const activeId = computed(() => open.value && active.value >= 0 ? `${listId}-${active.value}` : undefined)

function setOpen(value: boolean) {
  if (props.disabled || !enabled.value.length) return
  open.value = value
  if (value) {
    active.value = selectedIndex.value >= 0 && !props.options[selectedIndex.value]?.disabled ? selectedIndex.value : enabled.value[0]!
    void nextTick(() => document.getElementById(activeId.value ?? '')?.scrollIntoView({ block: 'nearest' }))
  }
}

function close() { open.value = false; typed = '' }

function choose(index: number) {
  const option = props.options[index]
  if (!option || option.disabled) return
  model.value = option.value
  close()
  trigger.value?.focus()
}

function move(direction: 1 | -1) {
  const choices = enabled.value
  const position = choices.indexOf(active.value)
  active.value = choices[(position + direction + choices.length) % choices.length]!
  void nextTick(() => document.getElementById(activeId.value ?? '')?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled || !enabled.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) setOpen(true)
    move(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    if (!open.value) setOpen(true)
    active.value = event.key === 'Home' ? enabled.value[0]! : enabled.value.at(-1)!
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (open.value) choose(active.value)
    else setOpen(true)
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') close()
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const now = Date.now()
    typed = now - typedAt > 500 ? event.key.toLocaleLowerCase() : typed + event.key.toLocaleLowerCase()
    typedAt = now
    if (!open.value) setOpen(true)
    const match = enabled.value.find(index => props.options[index]!.label.toLocaleLowerCase().startsWith(typed))
    if (match !== undefined) active.value = match
  }
}

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}

function onFocusIn(event: FocusEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}

watch(open, value => {
  if (value) {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('focusin', onFocusIn)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('focusin', onFocusIn)
})
</script>

<template>
  <div ref="root" class="relative min-w-0">
    <input v-if="name" type="hidden" :name="name" :value="model" :disabled="disabled">
    <button
      ref="trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-controls="listId"
      :aria-expanded="open"
      :aria-activedescendant="activeId"
      :aria-invalid="invalid || undefined"
      :disabled="disabled"
      class="control focus-ring flex items-center justify-between gap-2 text-left"
      @click="setOpen(!open)"
      @keydown="onKeydown"
    >
      <span class="min-w-0 truncate">{{ selected?.label ?? 'Chọn…' }}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none" :class="open && 'rotate-180'"><path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" /></svg>
    </button>
    <ul v-if="open" :id="listId" role="listbox" :aria-label="label" class="absolute inset-x-0 top-full z-50 mt-1 max-h-64 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-line-strong bg-white p-1 shadow-xl">
      <li
        v-for="(option, index) in options"
        :id="`${listId}-${index}`"
        :key="option.value"
        role="option"
        :aria-selected="model === option.value"
        :aria-disabled="option.disabled || undefined"
        class="flex min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm break-all"
        :class="[active === index ? 'bg-tint text-brand' : 'text-ink', option.disabled && 'cursor-not-allowed opacity-50']"
        @pointerenter="!option.disabled && (active = index)"
        @pointerdown.prevent
        @click="choose(index)"
      >{{ option.label }}</li>
    </ul>
  </div>
</template>
