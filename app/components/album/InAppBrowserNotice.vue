<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ platform: 'android' | 'ios'; app: string; link: string }>()
defineEmits<{ continue: []; retry: [] }>()

const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.link)
    copyState.value = 'copied'
  } catch { copyState.value = 'failed' }
}
</script>

<template>
  <section class="surface mx-auto max-w-md p-5 shadow-sm sm:p-6" aria-labelledby="in-app-title">
    <h1 id="in-app-title" class="text-xl font-semibold tracking-tight text-balance">Mở album bằng trình duyệt để chọn và tải ảnh ổn định</h1>
    <p class="mt-2 text-sm leading-6 text-muted">Trình duyệt trong {{ app }} có thể không lưu được lựa chọn hoặc ảnh gốc.</p>
    <ol class="mt-4 space-y-2 text-sm leading-6">
      <template v-if="platform === 'ios'">
        <li>1. Bấm nút <strong aria-label="ba chấm">⋯</strong> ở góc màn hình.</li>
        <li>2. Chọn <strong>Mở bằng Safari</strong> (hoặc Mở trong trình duyệt).</li>
      </template>
      <template v-else>
        <li>1. Bấm nút <strong aria-label="ba chấm">⋮</strong> ở góc màn hình.</li>
        <li>2. Chọn <strong>Mở bằng trình duyệt</strong> (Chrome).</li>
      </template>
    </ol>
    <div class="mt-5 flex flex-col gap-2">
      <UiButton v-if="platform === 'android'" block @click="$emit('retry')">Thử mở lại trình duyệt</UiButton>
      <UiButton :variant="platform === 'android' ? 'secondary' : 'primary'" block @click="copyLink">{{ copyState === 'copied' ? 'Đã sao chép link' : 'Sao chép link' }}</UiButton>
      <UiButton variant="ghost" block @click="$emit('continue')">Tiếp tục ở đây</UiButton>
    </div>
    <p v-if="copyState === 'failed'" role="alert" class="mt-3 text-sm text-danger">
      Không sao chép được tự động. Nhấn giữ link dưới đây để sao chép:
      <span class="mt-1 block break-all select-all text-ink" translate="no">{{ link }}</span>
    </p>
    <p v-else role="status" :class="copyState === 'copied' ? 'mt-3 text-sm text-brand' : 'sr-only'">{{ copyState === 'copied' ? 'Đã sao chép link. Dán vào Safari/Chrome để mở album.' : '' }}</p>
  </section>
</template>
