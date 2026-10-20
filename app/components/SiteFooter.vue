<script setup lang="ts">
import { pageContainerClass, type PageWidth } from '~/lib/page-container'

const props = withDefaults(defineProps<{ width?: PageWidth }>(), { width: '7xl' })
const containerClass = pageContainerClass[props.width]
const linkClass = 'focus-ring inline-flex min-h-11 items-center rounded hover:text-brand'
</script>

<template>
  <footer class="border-t border-line text-sm text-muted">
    <div class="mx-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]" :class="containerClass">
      <div class="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <NuxtLink to="/" aria-label="Zeno Studio – Trang chủ" class="focus-ring -ml-1 flex min-h-11 items-center rounded-lg px-1 text-ink">
            <BrandLogo />
          </NuxtLink>
          <p>Sản phẩm của <a href="https://www.zenocorp.vn/" class="focus-ring rounded font-medium text-ink hover:text-brand">Zeno Corp</a></p>
        </div>
        <nav aria-label="Liên kết cuối trang">
          <ul class="flex flex-wrap gap-x-5">
            <li><NuxtLink to="/create" :class="linkClass">Tạo album</NuxtLink></li>
            <li><NuxtLink to="/studio" :class="linkClass">Studio</NuxtLink></li>
            <li><NuxtLink to="/tools/file-filter" :class="linkClass">Lọc file</NuxtLink></li>
            <li><a href="mailto:info@zenocorp.vn" :class="linkClass">info@zenocorp.vn</a></li>
            <li><a href="tel:0782788880" :class="linkClass">078 278 8880</a></li>
          </ul>
        </nav>
      </div>
      <div class="flex flex-col gap-1 border-t border-line pt-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p class="py-2">© 2026 Công ty TNHH Zeno Corporation · MST 0319455594</p>
        <ul class="flex gap-x-5">
          <li><a href="https://www.zenocorp.vn/privacy" :class="linkClass">Bảo mật</a></li>
          <li><a href="https://www.zenocorp.vn/terms" :class="linkClass">Điều khoản</a></li>
        </ul>
      </div>
    </div>
  </footer>
</template>
