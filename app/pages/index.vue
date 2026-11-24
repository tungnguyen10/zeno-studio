<script setup lang="ts">
import SelectionDemo from '~/components/home/SelectionDemo.vue'
import { FAQS, ORGANIZATION, SITE_DESCRIPTION, SITE_NAME, WORKFLOW_STEPS as STEPS, publicPage } from '~~/shared/site'

// Homepage container from the V4 spec: 48px sides above 1100px, 32px from 761px, 24px below, 16px under 350px.
const CONTAINER = 'mx-auto w-full max-w-7xl px-6 max-[349px]:px-4 min-[761px]:px-8 min-[1101px]:px-12'

const page = publicPage('/')
useSeoMeta({
  title: page.title,
  description: page.description,
  ogTitle: page.title,
  ogDescription: page.description,
})

const siteUrl = useSiteUrl()
const organizationId = `${siteUrl}/#organization`
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': organizationId,
          name: ORGANIZATION.name,
          legalName: ORGANIZATION.legalName,
          url: ORGANIZATION.url,
          logo: `${siteUrl}/icons/icon-512.png`,
          email: ORGANIZATION.email,
          telephone: ORGANIZATION.telephone,
          taxID: ORGANIZATION.taxId,
          address: { '@type': 'PostalAddress', ...ORGANIZATION.address },
        },
        {
          '@type': 'WebSite',
          '@id': `${siteUrl}/#website`,
          name: SITE_NAME,
          url: `${siteUrl}/`,
          inLanguage: 'vi-VN',
          publisher: { '@id': organizationId },
        },
        {
          '@type': 'WebApplication',
          name: SITE_NAME,
          url: `${siteUrl}/`,
          description: SITE_DESCRIPTION,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          inLanguage: 'vi-VN',
          featureList: STEPS.map(step => `${step.title}: ${step.body}`),
          publisher: { '@id': organizationId },
        },
        {
          '@type': 'FAQPage',
          mainEntity: FAQS.map(item => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        },
      ],
    }),
  }],
})

// Decorative hearts and sparkles around the hero phone; positions are relative to the phone column.
const HERO_HEARTS = [
  { left: '-11%', top: '34%', size: 20, delay: '0s', duration: '6.5s' },
  { left: '-15%', top: '60%', size: 14, delay: '2.4s', duration: '7.5s' },
  { left: '-8%', top: '82%', size: 12, delay: '4.8s', duration: '6s' },
  { left: '104%', top: '28%', size: 16, delay: '1.2s', duration: '7s' },
  { left: '107%', top: '54%', size: 24, delay: '3.6s', duration: '8s' },
  { left: '103%', top: '76%', size: 12, delay: '5.4s', duration: '6.5s' },
]
const HERO_SPARKS = [
  { left: '-7%', top: '12%', size: 18, delay: '0s' },
  { left: '106%', top: '10%', size: 12, delay: '1.4s' },
  { left: '110%', top: '90%', size: 16, delay: '2.6s' },
]

const AUDIENCES = [
  {
    title: 'Cho studio',
    points: [
      'Tạo album từ folder Google Drive, ảnh gốc vẫn nằm trong Drive của bạn.',
      'Nhận danh sách tên file kèm ghi chú chỉnh sửa, không cần đối chiếu qua tin nhắn.',
      'Lọc và copy RAW/JPEG theo bộ ảnh đã chốt ngay trên máy.',
    ],
  },
  {
    title: 'Cho khách hàng',
    points: [
      'Mở link là xem được, không cần tạo tài khoản.',
      'Chọn ảnh yêu thích và ghi chú mong muốn ngay trên điện thoại.',
      'Có thể sửa lựa chọn và ghi chú trước khi người quản trị chốt bộ ảnh.',
    ],
  },
]
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <SiteHeader>
      <nav aria-label="Điều hướng chính" class="flex items-center gap-2 sm:gap-3">
        <a href="#zeno-demo" class="focus-ring hidden min-h-11 items-center rounded-full px-3 text-muted transition-colors hover:text-brand sm:inline-flex">Trải nghiệm chọn ảnh</a>
        <NuxtLink to="/studio" class="focus-ring inline-flex min-h-11 items-center rounded-full border border-line-strong bg-white px-4 transition-colors hover:border-brand">Đăng nhập</NuxtLink>
      </nav>
    </SiteHeader>

    <main>
      <div class="relative isolate overflow-x-clip">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
          <div class="absolute inset-0 opacity-70 bg-[radial-gradient(var(--color-line-strong)_1px,transparent_1.5px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_75%_65%_at_70%_45%,black,transparent)]" />
          <div class="absolute -right-40 -top-48 size-152 rounded-full bg-radial from-gold/20 to-transparent to-70% motion-safe:animate-hero-drift" />
          <div class="absolute -bottom-40 -left-48 size-136 rounded-full bg-radial from-brand-soft/20 to-transparent to-70% motion-safe:animate-hero-drift [animation-direction:alternate-reverse]" />
        </div>

        <!-- Two-column phone shrinks (288–350px) so the whole device fits under the header on short laptop screens. -->
        <section
          aria-labelledby="hero-title"
          class="grid items-center gap-10 pb-16 pt-10 min-[761px]:grid-cols-[minmax(0,1fr)_auto] min-[761px]:items-start min-[761px]:gap-5 min-[1101px]:gap-12 lg:pb-24 [--hero-phone-w:clamp(288px,calc((100svh-207px)*0.5417+16px),350px)] [--hero-phone-h:calc((var(--hero-phone-w)-16px)*720/390+16px)]"
          :class="CONTAINER"
        >
          <!-- Centre the copy on the device itself (62px mode switch above it), not on the taller figure with controls. -->
          <div class="@container min-[761px]:mt-[calc(62px+var(--hero-phone-h)/2)] min-[761px]:-translate-y-1/2">
            <p class="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 py-1.5 pl-2.5 pr-3.5 text-xs font-semibold uppercase tracking-[.16em] text-brand-soft shadow-sm backdrop-blur motion-safe:animate-hero-rise">
              <span aria-hidden="true" class="relative flex size-2">
                <span class="absolute inline-flex size-full rounded-full bg-gold opacity-70 motion-safe:animate-ping" />
                <span class="relative inline-flex size-2 rounded-full bg-gold" />
              </span>
              Dành cho photographers
            </p>
            <!-- Underline offsets are em-based so the swoosh tracks "nhẹ việc" at every headline size. -->
            <h1 id="hero-title" class="mt-5 text-[min(11cqw,5.5rem)] font-semibold leading-[1.04] tracking-[-.04em]">
              <span class="block whitespace-nowrap motion-safe:animate-hero-rise" style="animation-delay: 60ms">Khách chọn nhanh.</span>
              <span class="relative block w-fit whitespace-nowrap text-brand motion-safe:animate-hero-rise" style="animation-delay: 140ms">Bạn nhẹ việc.<svg aria-hidden="true" viewBox="0 0 200 12" preserveAspectRatio="none" fill="none" class="absolute bottom-[-0.2em] left-[1.84em] h-[.16em] w-[calc(100%-2.2em)] text-gold"><path d="M3 8.5C45 3.5 120 1.5 197 5.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" class="motion-safe:animate-hero-draw" /></svg></span>
            </h1>
            <ul class="mt-7 space-y-3 text-base text-muted sm:text-lg">
              <li class="flex items-center gap-3 motion-safe:animate-hero-rise" style="animation-delay: 240ms">
                <span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-full bg-tint text-brand">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" class="size-4.5"><path d="M2.75 6.25a1.5 1.5 0 0 1 1.5-1.5h3.4l1.6 1.75h6.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5Z" /></svg>
                </span>
                Gửi album từ Google Drive.
              </li>
              <li class="flex items-center gap-3 motion-safe:animate-hero-rise" style="animation-delay: 320ms">
                <span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-full bg-heart-soft text-heart">
                  <svg viewBox="0 0 20 20" fill="currentColor" class="size-4.5"><path d="M10 17.3 8.8 16.2C4.6 12.4 2 10 2 7.1 2 4.7 3.9 2.8 6.3 2.8c1.4 0 2.7.6 3.7 1.7 1-1.1 2.3-1.7 3.7-1.7C16.1 2.8 18 4.7 18 7.1c0 2.9-2.6 5.3-6.8 9.1L10 17.3Z" /></svg>
                </span>
                Nhận rõ ảnh khách chọn.
              </li>
            </ul>
            <div class="mt-8 flex flex-col gap-4 motion-safe:animate-hero-rise @md:flex-row @md:items-center @md:gap-5" style="animation-delay: 420ms">
              <NuxtLink to="/create" class="focus-ring group inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand px-7 font-semibold text-white shadow-lg shadow-brand/20 transition-[background-color,box-shadow] hover:bg-brand-dark hover:shadow-xl hover:shadow-brand/25 @md:w-auto">
                Tạo album miễn phí
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"><path d="M4 10h11M11 5.5 15.5 10 11 14.5" /></svg>
              </NuxtLink>
              <p class="inline-flex items-center justify-center gap-2 text-sm text-muted @md:justify-start">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-brand-soft"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
                Khách không cần tài khoản.
              </p>
            </div>
          </div>

          <div class="relative isolate mx-auto w-full max-w-87.5 motion-safe:animate-hero-pop min-[761px]:w-(--hero-phone-w)" style="animation-delay: 150ms">
            <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
              <div class="absolute left-1/2 top-1/2 aspect-square w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-radial from-gold/15 via-tint/70 to-transparent to-70%" />
              <div class="absolute left-1/2 top-1/2 aspect-square w-[155%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-strong/50" />
              <div class="absolute left-1/2 top-1/2 aspect-square w-[122%] -translate-x-1/2 -translate-y-1/2">
                <div class="relative size-full rounded-full border border-dashed border-line-strong motion-safe:animate-hero-spin">
                  <span class="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_0_4px_rgb(232_172_34/0.18)]" />
                  <span class="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-heart/70" />
                </div>
              </div>
              <svg
                v-for="(heart, index) in HERO_HEARTS"
                :key="`heart-${index}`"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="absolute text-heart opacity-40 motion-safe:animate-hero-heart"
                :style="{ left: heart.left, top: heart.top, width: `${heart.size}px`, height: `${heart.size}px`, animationDelay: heart.delay, animationDuration: heart.duration }"
              >
                <path d="M10 17.3 8.8 16.2C4.6 12.4 2 10 2 7.1 2 4.7 3.9 2.8 6.3 2.8c1.4 0 2.7.6 3.7 1.7 1-1.1 2.3-1.7 3.7-1.7C16.1 2.8 18 4.7 18 7.1c0 2.9-2.6 5.3-6.8 9.1L10 17.3Z" />
              </svg>
              <svg
                v-for="(spark, index) in HERO_SPARKS"
                :key="`spark-${index}`"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="absolute text-gold motion-safe:animate-hero-twinkle"
                :style="{ left: spark.left, top: spark.top, width: `${spark.size}px`, height: `${spark.size}px`, animationDelay: spark.delay }"
              >
                <path d="M10 0c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10Z" />
              </svg>
            </div>
            <SelectionDemo />
          </div>
        </section>
      </div>

      <section id="quy-trinh" aria-labelledby="workflow-title" class="bg-tint py-14 sm:py-20">
        <div :class="CONTAINER">
          <h2 id="workflow-title" class="max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl">Từ album đến bộ ảnh cần làm.</h2>
          <ol class="mt-8 grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
            <li v-for="(step, index) in STEPS" :key="step.title" class="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
              <span class="text-xs font-semibold uppercase tracking-[.12em] text-brand-soft tabular-nums">0{{ index + 1 }} / {{ step.label }}</span>
              <h3 class="mt-4 text-xl font-semibold tracking-tight sm:mt-6">{{ step.title }}</h3>
              <p class="mt-2 leading-7 text-pretty text-muted">{{ step.body }}</p>
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
