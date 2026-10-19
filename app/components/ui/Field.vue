<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{ label: string; hint?: string; error?: string }>()
defineSlots<{ default(props: { id: string; describedby: string | undefined; invalid: boolean }): unknown }>()

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`
const describedby = computed(() => [props.hint ? hintId : '', props.error ? errorId : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="min-w-0">
    <label :for="id" class="block text-sm font-semibold text-ink">{{ label }}</label>
    <div class="mt-1.5">
      <slot :id="id" :describedby="describedby" :invalid="!!error" />
    </div>
    <p v-if="hint" :id="hintId" class="mt-1.5 text-xs text-muted">{{ hint }}</p>
    <p v-if="error" :id="errorId" role="alert" class="mt-1.5 text-sm text-danger">{{ error }}</p>
  </div>
</template>
