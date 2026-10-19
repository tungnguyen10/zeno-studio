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

const STEPS = [
  { title: 'Chọn ảnh dễ hơn', body: 'Khách chọn và ghi chú trên từng ảnh ngay từ điện thoại, không cần tạo tài khoản.' },
  { title: 'Hậu kỳ chính xác', body: 'Studio nhận tên file và yêu cầu chỉnh sửa, sau đó lọc RAW/JPEG ngay trên máy.' },
  { title: 'Duyệt rõ ràng', body: 'Mỗi vòng review được lưu lại để cả hai bên biết ảnh nào cần sửa và khi nào hoàn tất.' },
]

const AUDIENCES = [
  {
    title: 'Cho studio',
    points: [
      'Tạo album từ folder Google Drive, ảnh gốc vẫn nằm trong Drive của bạn.',
      'Nhận danh sách tên file kèm ghi chú chỉnh sửa, không cần đối chiếu qua tin nhắn.',
      'Lọc RAW/JPEG đã chọn ngay trên máy và theo dõi từng vòng duyệt.',
    ],
  },
  {
    title: 'Cho khách hàng',
    points: [
      'Mở link là xem được, không cần tạo tài khoản.',
      'Chọn ảnh yêu thích và ghi chú mong muốn ngay trên điện thoại.',
      'Xem lại thành phẩm và phản hồi trước khi nhận bàn giao.',
    ],
  },
]

const FAQS = [
  { q: 'Khách có cần tạo tài khoản không?', a: 'Không. Khách chỉ cần mở link album studio gửi để xem, chọn và ghi chú ảnh.' },
  { q: 'Ảnh được lưu ở đâu?', a: 'Ảnh gốc vẫn nằm trong folder Google Drive của bạn. Zeno Studio chỉ đọc ảnh từ folder đã chia sẻ bằng đường liên kết.' },
  { q: 'Tạo album nhanh khác gì không gian studio?', a: 'Tạo album nhanh không cần đăng nhập và album có hạn 15 hoặc 30 ngày. Không gian studio dành cho đội ngũ cần quản lý nhiều album, thành viên và các vòng duyệt.' },
  { q: 'Công cụ lọc file có tải ảnh lên máy chủ không?', a: 'Không. Công cụ chạy ngay trong trình duyệt, chỉ copy file sang thư mục đích và không xóa file nguồn.' },
]

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
    <SiteHeader>
      <nav aria-label="Điều hướng chính" class="flex items-center gap-2 sm:gap-3">
        <NuxtLink to="/tools/file-filter" class="focus-ring hidden min-h-11 items-center rounded-full border border-line-strong px-4 transition-colors hover:border-brand sm:inline-flex">Lọc file trên máy</NuxtLink>
        <NuxtLink to="/studio" class="focus-ring inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-white transition-colors hover:bg-brand-dark">Vào studio</NuxtLink>
      </nav>
    </SiteHeader>

    <main>
      <section class="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-8 sm:px-8 sm:pt-14 lg:grid-cols-[1.1fr_.9fr] lg:pb-28 lg:pt-20">
        <div>
          <p class="mb-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-tint px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-brand sm:mb-5 sm:px-4 sm:py-2 sm:text-xs">Quy trình ảnh liền mạch</p>
          <h1 class="max-w-3xl text-[2.5rem] font-semibold leading-[1.08] tracking-[-.04em] text-balance sm:text-6xl lg:text-[5.1rem]">Từ bộ ảnh đầu tiên đến lời <em class="font-serif font-normal text-brand-soft">“ưng rồi”.</em></h1>
          <p class="mt-5 max-w-xl text-base leading-7 text-pretty text-muted sm:mt-7 sm:text-lg sm:leading-8">Một nơi để khách chọn ảnh, ghi chú mong muốn chỉnh sửa và duyệt thành phẩm. Studio theo dõi từng bước, tìm đúng file và bàn giao gọn gàng.</p>
          <div class="mt-7 grid gap-2.5 sm:mt-9 sm:flex sm:flex-wrap sm:gap-3">
            <NuxtLink to="/create" class="focus-ring inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 font-semibold text-white shadow-lg shadow-brand/15 transition-colors hover:bg-brand-dark">Tạo album nhanh <span aria-hidden="true">&nbsp;↗</span></NuxtLink>
            <NuxtLink to="/studio" class="focus-ring inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-white px-6 font-semibold transition-colors hover:border-brand-soft">Mở studio</NuxtLink>
          </div>
          <p class="mt-6 text-sm text-muted sm:mt-8">Khách không cần tạo tài khoản · Hoạt động tốt trên điện thoại</p>
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

      <section aria-labelledby="how-title" class="bg-tint py-14 sm:py-20">
        <div class="mx-auto max-w-7xl px-4 sm:px-8">
          <p class="text-xs font-semibold uppercase tracking-[.2em] text-brand-soft sm:text-sm">Cách hoạt động</p>
          <h2 id="how-title" class="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl">Một workflow, trọn hành trình</h2>
          <ol class="mt-8 grid gap-3 sm:gap-4 md:grid-cols-3">
            <li v-for="(step, index) in STEPS" :key="step.title" class="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
              <span class="text-sm font-semibold text-brand-soft tabular-nums">0{{ index + 1 }}</span>
              <h3 class="mt-4 text-xl font-semibold tracking-tight sm:mt-8 sm:text-2xl">{{ step.title }}</h3>
              <p class="mt-2 leading-7 text-pretty text-muted sm:mt-3">{{ step.body }}</p>
            </li>
          </ol>
        </div>
      </section>

      <section aria-labelledby="audience-title" class="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
        <p class="text-xs font-semibold uppercase tracking-[.2em] text-brand-soft sm:text-sm">Dành cho ai</p>
        <h2 id="audience-title" class="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl">Gọn cho studio, dễ cho khách</h2>
        <div class="mt-8 grid gap-3 sm:gap-4 md:grid-cols-2">
          <article v-for="group in AUDIENCES" :key="group.title" class="surface p-5 sm:p-8">
            <h3 class="text-lg font-semibold sm:text-xl">{{ group.title }}</h3>
            <ul class="mt-4 space-y-3">
              <li v-for="point in group.points" :key="point" class="flex gap-3 leading-7 text-pretty text-muted">
                <span aria-hidden="true" class="mt-1.5 grid size-5 shrink-0 place-items-center rounded-full bg-tint text-xs font-bold text-brand">✓</span>
                <span>{{ point }}</span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section aria-labelledby="faq-title" class="border-t border-line">
        <div class="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[.2em] text-brand-soft sm:text-sm">Hỏi nhanh</p>
            <h2 id="faq-title" class="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-4xl">Câu hỏi thường gặp</h2>
          </div>
          <div class="divide-y divide-line border-y border-line">
            <details v-for="item in FAQS" :key="item.q" class="group">
              <summary class="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 font-semibold [&::-webkit-details-marker]:hidden">
                {{ item.q }}
                <span aria-hidden="true" class="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-brand transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p class="pb-5 pr-12 leading-7 text-pretty text-muted">{{ item.a }}</p>
            </details>
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-title" class="px-4 pb-14 sm:px-8 sm:pb-20">
        <div class="mx-auto flex max-w-7xl flex-col items-start gap-6 rounded-3xl bg-brand px-6 py-10 text-white sm:rounded-4xl sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="cta-title" class="text-2xl font-semibold tracking-tight text-balance sm:text-4xl">Gửi album đầu tiên trong vài phút</h2>
            <p class="mt-3 max-w-xl leading-7 text-pretty text-white/75">Dán link Google Drive, nhận link cho khách chọn ảnh. Không cần đăng nhập.</p>
          </div>
          <NuxtLink to="/create" class="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-white px-6 font-semibold text-brand transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Tạo album nhanh <span aria-hidden="true">&nbsp;↗</span></NuxtLink>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>
