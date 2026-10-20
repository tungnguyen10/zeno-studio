<script setup lang="ts">
const model = defineModel<boolean>({ required: true })

function onChange(event: Event) {
  model.value = (event.target as HTMLInputElement).checked
}
</script>

<template>
  <input type="checkbox" :checked="model" class="focus-ring size-5 accent-brand" @change="onChange">
</template>
