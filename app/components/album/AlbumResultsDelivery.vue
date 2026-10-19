<script setup lang="ts">
import type { ProductionPage } from '~/lib/album-results'

defineProps<{
  production: ProductionPage
  canOpenReview: boolean
  canSubmitDelivery: boolean
  delivered: boolean
  remaining: number
  submittingReview: boolean
  submittingDelivery: boolean
  reviewError: string
  deliveryError: string
}>()
defineEmits<{ sendReview: []; deliver: [] }>()
const editedUrl = defineModel<string>('editedUrl', { required: true })
const deliveryUrl = defineModel<string>('deliveryUrl', { required: true })
</script>

<template>
  <section id="delivery" aria-labelledby="delivery-heading" class="mt-6">
    <h2 id="delivery-heading" class="text-xl font-semibold sm:text-2xl">Duyệt & bàn giao</h2>
    <p class="mt-1 text-sm text-pretty text-muted">Gửi ảnh đã chỉnh, theo dõi phản hồi và bàn giao thành phẩm.</p>
    <ol class="mt-5 grid gap-4 lg:grid-cols-2">
      <li class="surface p-4 sm:p-6">
        <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bước 1</p>
        <h3 class="mt-2 text-lg font-semibold text-balance">Gửi ảnh đã chỉnh để khách duyệt</h3>
        <form v-if="canOpenReview" class="mt-4" @submit.prevent="$emit('sendReview')">
          <UiField v-slot="{ id, describedby, invalid }" label="Link folder Google Drive" :error="reviewError">
            <input :id="id" v-model="editedUrl" required type="url" inputmode="url" name="edited-drive-url" autocomplete="off" spellcheck="false" class="control" :aria-describedby="describedby" :aria-invalid="invalid" placeholder="https://drive.google.com/drive/folders/…">
          </UiField>
          <UiButton type="submit" class="mt-4 w-full sm:w-auto" :loading="submittingReview">{{ submittingReview ? 'Đang mở vòng duyệt…' : 'Mở vòng duyệt' }}</UiButton>
        </form>
        <p v-else-if="production.review?.status === 'WAITING_REVIEW'" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand">Đang chờ khách duyệt vòng {{ production.review.roundNumber }}. Gửi link album khách để khách xem ảnh đã chỉnh.</p>
        <p v-else-if="production.review?.status === 'APPROVED' || delivered" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand">Khách đã duyệt ảnh thành phẩm.</p>
        <p v-else-if="!production.items.length" class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Chưa có ảnh để gửi duyệt.</p>
        <p v-else class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Cần đánh dấu {{ remaining }}/{{ production.items.length }} ảnh đã chỉnh trước khi mở vòng duyệt.</p>
      </li>
      <li class="surface p-4 sm:p-6">
        <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bước 2</p>
        <h3 class="mt-2 text-lg font-semibold text-balance">Bàn giao thành phẩm</h3>
        <form v-if="canSubmitDelivery" class="mt-4" @submit.prevent="$emit('deliver')">
          <UiField v-slot="{ id, describedby, invalid }" label="Link Drive thành phẩm" :error="deliveryError">
            <input :id="id" v-model="deliveryUrl" required type="url" inputmode="url" name="delivery-drive-url" autocomplete="off" spellcheck="false" class="control" :aria-describedby="describedby" :aria-invalid="invalid" placeholder="https://drive.google.com/drive/folders/…">
          </UiField>
          <UiButton type="submit" variant="outline" class="mt-4 w-full sm:w-auto" :loading="submittingDelivery">{{ submittingDelivery ? 'Đang bàn giao…' : 'Đánh dấu hoàn tất' }}</UiButton>
        </form>
        <p v-else-if="delivered" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand">Album đã bàn giao.</p>
        <p v-else-if="production.review?.status === 'APPROVED'" class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Khách đã duyệt; tài khoản này chưa có quyền bàn giao.</p>
        <p v-else class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Mở sau khi khách duyệt tất cả ảnh đã chỉnh.</p>
      </li>
    </ol>
  </section>
</template>
