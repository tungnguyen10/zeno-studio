<script setup lang="ts" generic="T extends string | number | undefined">
withDefaults(defineProps<{
  type?: 'text' | 'search' | 'email' | 'url' | 'password' | 'number'
  invalid?: boolean
}>(), { type: 'text' })

const model = defineModel<T>({ required: true })

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  model.value = (input.type === 'number' && input.value !== '' ? input.valueAsNumber : input.value) as T
}
</script>

<template>
  <input :type="type" :value="model" :aria-invalid="invalid || undefined" class="control" @input="onInput">
</template>
