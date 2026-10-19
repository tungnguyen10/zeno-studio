<script setup lang="ts">
import { computed } from 'vue'
import { PRODUCTION_STATUS_LABELS } from '~~/shared/domain/album-status'
import type { ProductionItem } from '~/lib/album-results'

const props = defineProps<{ items: ProductionItem[]; retouched: number; activeTaskId: string | null }>()
defineEmits<{ move: [id: string, status: 'RETOUCHING' | 'WAITING_REVIEW'] }>()
const filter = defineModel<string>('filter', { required: true })

const visible = computed(() => props.items.filter(item => filter.value === 'all' || item.status === filter.value))
const remaining = computed(() => props.items.length - props.retouched)

const STATUS_TONES: Record<string, string> = {
  PENDING: 'bg-skeleton text-muted',
  RETOUCHING: 'bg-warn-soft text-warn',
  WAITING_REVIEW: 'bg-tint text-brand',
  REVISION_REQUESTED: 'bg-danger-soft text-danger',
  APPROVED: 'bg-brand-soft/25 text-brand',
  DELIVERED: 'bg-brand text-white',
}

function nextAction(status: string) {
  if (status === 'PENDING' || status === 'REVISION_REQUESTED') return { to: 'RETOUCHING' as const, label: 'Bắt đầu chỉnh' }
  if (status === 'RETOUCHING') return { to: 'WAITING_REVIEW' as const, label: 'Ảnh đã chỉnh' }
  return null
}
</script>

<template>
  <section id="production" aria-labelledby="production-heading" class="mt-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <h2 id="production-heading" class="text-xl font-semibold sm:text-2xl">Tiến độ hậu kỳ</h2>
        <p class="mt-1 text-sm text-pretty text-muted">Cập nhật từng ảnh trước khi gửi khách duyệt.</p>
      </div>
      <UiField v-slot="{ id }" label="Trạng thái" class="sm:w-52">
        <select :id="id" v-model="filter" name="production-status" class="control">
          <option value="all">Tất cả</option>
          <option v-for="(label, value) in PRODUCTION_STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </UiField>
    </div>
    <div v-if="items.length" class="surface mt-5 p-4 sm:p-5">
      <div class="flex items-baseline justify-between gap-3 text-sm tabular-nums">
        <span class="font-semibold text-ink">{{ retouched }}/{{ items.length }} ảnh đã chỉnh</span>
        <span class="text-muted">{{ remaining }} ảnh còn lại</span>
      </div>
      <progress class="mt-3 h-2 w-full overflow-hidden rounded-full bg-tint accent-brand" :value="retouched" :max="items.length" aria-label="Tiến độ chỉnh ảnh" />
    </div>
    <ul v-if="visible.length" class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Công việc hậu kỳ">
      <li v-for="task in visible" :key="task.id" class="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-white p-2.5 pl-3 text-sm [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold" translate="no" :title="task.filename">{{ task.filename }}</p>
          <p class="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" :class="STATUS_TONES[task.status] ?? 'bg-tint text-muted'">{{ PRODUCTION_STATUS_LABELS[task.status] ?? task.status }}</p>
        </div>
        <UiButton
          v-if="nextAction(task.status)"
          variant="outline"
          size="sm"
          class="shrink-0"
          :disabled="activeTaskId !== null"
          :loading="activeTaskId === task.id"
          @click="$emit('move', task.id, nextAction(task.status)!.to)"
        >{{ activeTaskId === task.id ? 'Đang lưu…' : nextAction(task.status)!.label }}</UiButton>
      </li>
    </ul>
    <p v-else class="surface mt-4 p-5 text-sm text-muted">{{ items.length ? 'Không có ảnh ở trạng thái này.' : 'Chưa có công việc hậu kỳ.' }}</p>
  </section>
</template>
