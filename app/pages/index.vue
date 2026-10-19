<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'

useSeoMeta({
  title: 'Zeno Studio — Photo Workflow',
  description: 'Từ lựa chọn ảnh đến bàn giao, một luồng làm việc rõ ràng cho studio và khách hàng.',
})

const HERO_PHOTOS = [
  { src: '/images/hero/bride.jpg', width: 480, height: 720, aspect: 'aspect-[.88]', position: 'object-[50%_20%]', heart: true },
  { src: '/images/hero/bouquet.jpg', width: 480, height: 720, aspect: 'aspect-[.88]', position: 'object-[50%_60%]', heart: true },
  { src: '/images/hero/couple.jpg', width: 720, height: 478, aspect: 'aspect-[1.35]', position: 'object-left', heart: false },
  { src: '/images/hero/hands.jpg', width: 720, height: 480, aspect: 'aspect-[1.35]', position: 'object-center', heart: false },
]
const heroLoaded = ref(HERO_PHOTOS.map(() => false))
const heroImages = useTemplateRef<HTMLImageElement[]>('heroImages')

// SSR images can finish loading before hydration attaches @load.
onMounted(() => {
  heroImages.value?.forEach(img => {
    const index = HERO_PHOTOS.findIndex(photo => img.src.endsWith(photo.src))
    if (index >= 0 && img.complete && img.naturalWidth) heroLoaded.value[index] = true
  })
})
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <header class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
      <NuxtLink to="/" class="focus-ring flex min-h-11 items-center gap-3 rounded-lg text-lg font-bold tracking-tight">
        <span aria-hidden="true" class="grid size-9 place-items-center rounded-xl bg-brand text-lg text-white">Z</span>
        Zeno Studio
      </NuxtLink>
      <nav aria-label="Điều hướng chính" class="flex items-center gap-2 text-sm font-medium sm:gap-3">
        <NuxtLink to="/tools/file-filter" class="focus-ring hidden min-h-11 items-center rounded-full border border-line-strong px-4 transition-colors hover:border-brand sm:inline-flex">Lọc file trên máy</NuxtLink>
        <NuxtLink to="/studio" class="focus-ring inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-white transition-colors hover:bg-brand-dark">Vào studio</NuxtLink>
      </nav>
    </header>

    <main>
      <section class="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-6 sm:px-8 sm:pt-14 lg:grid-cols-[1.1fr_.9fr] lg:pb-28 lg:pt-24">
        <div>
          <p class="mb-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-tint px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-brand sm:mb-5 sm:px-4 sm:py-2 sm:text-xs">Quy trình ảnh liền mạch</p>
          <h1 class="max-w-3xl text-[2.5rem] font-semibold leading-[1.08] tracking-[-.04em] text-balance sm:text-6xl lg:text-[5.1rem]">Từ bộ ảnh đầu tiên đến lời <em class="font-serif font-normal text-brand-soft">“ưng rồi”.</em></h1>
          <p class="mt-5 max-w-xl text-base leading-7 text-pretty text-muted sm:mt-7 sm:text-lg sm:leading-8">Một nơi để khách chọn ảnh, ghi chú mong muốn chỉnh sửa và duyệt thành phẩm. Studio theo dõi từng bước, tìm đúng file và bàn giao gọn gàng.</p>
          <div class="mt-7 grid gap-2.5 sm:mt-9 sm:flex sm:flex-wrap sm:gap-3">
            <NuxtLink to="/create" class="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 font-semibold text-white shadow-lg shadow-brand/15 transition-colors hover:bg-brand-dark">Tạo album nhanh <span aria-hidden="true">&nbsp;↗</span></NuxtLink>
            <NuxtLink to="/studio" class="focus-ring inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-white px-6 font-semibold transition-colors hover:border-brand-soft">Mở studio</NuxtLink>
            <NuxtLink to="/tools/file-filter" class="focus-ring inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-white px-6 font-semibold transition-colors hover:border-brand-soft">Dùng công cụ lọc file</NuxtLink>
          </div>
          <ol class="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6 text-sm sm:mt-12 sm:gap-6">
            <li><strong class="block text-2xl text-brand">01</strong><span class="text-muted">Gửi album</span></li>
            <li><strong class="block text-2xl text-brand">02</strong><span class="text-muted">Khách chọn & ghi chú</span></li>
            <li><strong class="block text-2xl text-brand">03</strong><span class="text-muted">Duyệt & bàn giao</span></li>
          </ol>
        </div>

        <div aria-hidden="true" class="relative mx-auto w-full max-w-[520px]">
          <div class="absolute -left-6 -top-8 size-36 rounded-full bg-[#dce8d0] blur-3xl" />
          <div class="relative rounded-3xl border border-line bg-white p-3 shadow-[0_35px_90px_-35px_rgba(39,55,35,.34)] sm:rounded-[2rem] sm:p-5">
            <div class="flex items-center justify-between gap-2 px-2 pb-3 text-xs text-muted sm:pb-4"><span class="truncate font-semibold text-brand">Album · Mai & Quang</span><span class="shrink-0">124 ảnh · Đang chọn</span></div>
            <div class="grid grid-cols-2 gap-2 sm:gap-3">
              <div v-for="(photo, index) in HERO_PHOTOS" :key="photo.src" class="photo-placeholder rounded-2xl" :class="photo.aspect" :data-loading="heroLoaded[index] ? undefined : ''">
                <img ref="heroImages" :src="photo.src" alt="" :width="photo.width" :height="photo.height" :fetchpriority="index === 0 ? 'high' : undefined" decoding="async" class="size-full object-cover transition-opacity duration-500" :class="[photo.position, heroLoaded[index] ? 'opacity-100' : 'opacity-0']" @load="heroLoaded[index] = true">
                <span v-if="photo.heart" class="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-white/90 text-heart shadow-sm">♥</span>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between rounded-2xl bg-tint px-4 py-3 text-sm sm:mt-4"><span><strong class="text-brand">18 ảnh</strong> đã chọn</span><span class="font-semibold text-brand">Xem lựa chọn →</span></div>
          </div>
          <div class="absolute -bottom-7 left-2 rounded-2xl border border-line bg-white px-4 py-3 shadow-xl sm:-left-12"><span class="block text-xs text-muted">Ghi chú ảnh #024</span><span class="mt-1 block text-sm font-medium">“Chỉnh sáng nhẹ giúp mình nhé”</span></div>
        </div>
      </section>

      <section class="bg-tint py-12 sm:py-16">
        <div class="mx-auto max-w-7xl px-4 sm:px-8">
          <p class="text-sm font-semibold uppercase tracking-[.2em] text-brand-soft">Một workflow, trọn hành trình</p>
          <div class="mt-6 grid gap-3 sm:mt-7 sm:gap-4 md:grid-cols-3">
            <article v-for="item in [
              ['01', 'Chọn ảnh dễ hơn', 'Khách chọn và ghi chú trên từng ảnh ngay từ điện thoại, không cần tạo tài khoản.'],
              ['02', 'Hậu kỳ chính xác', 'Studio nhận tên file và yêu cầu chỉnh sửa, sau đó lọc RAW/JPEG ngay trên máy.'],
              ['03', 'Duyệt rõ ràng', 'Mỗi vòng review được lưu lại để cả hai bên biết ảnh nào cần sửa và khi nào hoàn tất.'],
            ]" :key="item[0]" class="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
              <span class="text-sm font-semibold text-brand-soft">{{ item[0] }}</span>
              <h2 class="mt-4 text-xl font-semibold tracking-tight sm:mt-8 sm:text-2xl">{{ item[1] }}</h2>
              <p class="mt-2 leading-7 text-pretty text-muted sm:mt-3">{{ item[2] }}</p>
            </article>
          </div>
        </div>
      </section>
    </main>
    <footer class="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-muted sm:px-8"><span>© Zeno Studio</span><span>Cho những bức ảnh đáng giữ lại.</span></footer>
  </div>
</template>
