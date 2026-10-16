<script setup lang="ts">
defineProps<{ heart?: boolean }>()
</script>

<template>
  <div aria-hidden="true" class="photo-placeholder rounded-2xl p-3" data-loading>
    <span v-if="heart" class="grid size-8 place-items-center rounded-full bg-white/90 text-[#bd6263]">♥</span>
  </div>
</template>
