<script setup lang="ts">
import { REVIEW_STATUS_LABELS } from '~~/shared/domain/album-status'

defineProps<{
  review: { roundNumber: number; driveUrl: string | null; deliveryUrl: string | null; status: string }
  canRespond: boolean
  busy: boolean
}>()
defineEmits<{ respond: [decision: 'approve' | 'request_revision'] }>()
const revisionText = defineModel<string>('revisionText', { required: true })
</script>

<template>
  <section aria-labelledby="review-heading" class="surface mt-6 max-w-2xl p-4 sm:mt-7 sm:p-5">
    <h2 id="review-heading" class="text-lg font-semibold text-balance sm:text-xl">Duyệt ảnh đã chỉnh · Vòng {{ review.roundNumber }}</h2>
    <p class="mt-2 text-sm text-muted">Trạng thái: <span class="font-semibold text-ink">{{ REVIEW_STATUS_LABELS[review.status] ?? review.status }}</span></p>
    <div class="mt-3 flex flex-col items-start gap-1">
      <a v-if="review.driveUrl" :href="review.driveUrl" target="_blank" rel="noopener noreferrer" class="focus-ring inline-flex min-h-11 items-center rounded font-semibold text-brand underline underline-offset-4">Mở ảnh đã chỉnh trên Google Drive <span aria-hidden="true">&nbsp;↗</span></a>
      <a v-if="review.deliveryUrl" :href="review.deliveryUrl" target="_blank" rel="noopener noreferrer" class="focus-ring inline-flex min-h-11 items-center rounded font-semibold text-brand underline underline-offset-4">Mở album thành phẩm đã bàn giao <span aria-hidden="true">&nbsp;↗</span></a>
    </div>
    <div v-if="canRespond" class="mt-4 space-y-3">
      <label class="block text-sm font-semibold">Yêu cầu sửa (nếu có)<textarea v-model="revisionText" maxlength="5000" rows="3" name="revision-note" class="control mt-2 py-3"></textarea></label>
      <div class="grid gap-2 sm:flex sm:flex-wrap">
        <UiButton :disabled="busy" @click="$emit('respond', 'approve')">Duyệt thành phẩm</UiButton>
        <UiButton variant="secondary" :disabled="busy || !revisionText.trim()" @click="$emit('respond', 'request_revision')">Yêu cầu sửa</UiButton>
      </div>
    </div>
  </section>
</template>
