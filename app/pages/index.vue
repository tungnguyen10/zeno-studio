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
      <section aria-labelledby="hero-title" class="grid items-center gap-10 pb-16 pt-10 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(0,350px)] min-[761px]:gap-5 min-[761px]:pt-14 min-[1101px]:gap-12 lg:pb-24 lg:pt-20" :class="CONTAINER">
        <div class="@container">
          <p class="text-xs font-semibold uppercase tracking-[.16em] text-brand-soft sm:text-sm">Dành cho photographers</p>
          <h1 id="hero-title" class="mt-4 text-[min(11cqw,5.5rem)] font-semibold leading-[1.04] tracking-[-.04em]">
            <span class="block whitespace-nowrap">Khách chọn nhanh.</span>
            <span class="block whitespace-nowrap text-brand">Bạn nhẹ việc.</span>
          </h1>
          <p class="mt-5 text-base leading-7 text-muted sm:mt-6 sm:text-lg sm:leading-8">Gửi album từ Google Drive.<br>Nhận rõ ảnh khách chọn.</p>
          <NuxtLink to="/create" class="focus-ring mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-7 font-semibold text-white shadow-lg shadow-brand/15 transition-colors hover:bg-brand-dark sm:mt-8 sm:w-auto">Tạo album miễn phí</NuxtLink>
          <p class="mt-4 text-sm text-muted">Khách không cần tài khoản.</p>
        </div>
        <SelectionDemo />
      </section>

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
