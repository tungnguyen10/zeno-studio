<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{ value: T }>()
const model = defineModel<T>({ required: true })

function onChange(event: Event) {
  if ((event.target as HTMLInputElement).checked) model.value = props.value
}
</script>

<template>
  <input type="radio" :value="value" :checked="model === value" class="focus-ring size-5 accent-brand" @change="onChange">
</template>
