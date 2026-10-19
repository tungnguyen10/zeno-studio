<script setup lang="ts">
defineProps<{ open?: boolean; afterCreate?: string }>()

const STEPS = [
  'Mở Google Drive, chuột phải vào folder ảnh → Chia sẻ → Chia sẻ.',
  'Ở mục “Quyền truy cập chung”, đổi “Bị hạn chế” thành “Bất kỳ ai có đường liên kết”, vai trò “Người xem”.',
  'Bấm “Sao chép đường liên kết” rồi dán vào ô Link folder Drive bên dưới.',
]
</script>

<template>
  <details class="group rounded-2xl border border-line bg-canvas px-4 text-sm" :open="open">
    <summary class="focus-ring -mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 font-semibold text-brand [&::-webkit-details-marker]:hidden">
      <span>Hướng dẫn chia sẻ folder Drive</span>
      <span aria-hidden="true" class="text-muted transition-transform group-open:rotate-180">▾</span>
    </summary>
    <div class="pb-4">
      <ol class="space-y-2">
        <li v-for="(text, index) in STEPS" :key="index" class="flex gap-3 text-pretty">
          <span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full bg-tint text-xs font-bold text-brand tabular-nums">{{ index + 1 }}</span>
          <span class="pt-0.5">{{ text }}</span>
        </li>
      </ol>
      <ul class="mt-3 list-disc space-y-1 pl-5 text-pretty text-muted marker:text-brand-soft">
        <li>Link đúng có dạng <code translate="no" class="break-all font-mono text-ink">drive.google.com/drive/folders/…</code></li>
        <li>Đặt ảnh trực tiếp trong folder — ảnh trong folder con sẽ không được lấy.</li>
        <li>Ảnh gốc vẫn nằm trong Drive của bạn; khách chỉ xem, không sửa hay xóa được.</li>
        <li>Hết hạn album, link khách sẽ bị khóa.</li>
        <li v-if="afterCreate">{{ afterCreate }}</li>
      </ul>
    </div>
  </details>
</template>
