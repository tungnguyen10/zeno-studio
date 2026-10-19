<script setup lang="ts">
import { onMounted, ref } from 'vue'

useSeoMeta({ title: 'Tham gia studio — Zeno Studio' })
const route = useRoute()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const state = ref<'loading' | 'login' | 'accepted' | 'error'>('loading')
const message = ref('')
const studioName = ref('')

onMounted(async () => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { state.value = 'error'; message.value = 'Liên kết mời không hợp lệ.'; return }
  try {
    const session = await $fetch<{ user?: { id: string } }>('/api/auth/get-session')
    if (!session?.user) { state.value = 'login'; return }
    const result = await $fetch<{ studio: { name: string } }>('/api/studio/invitations/accept', {
      method: 'POST', body: { token },
    })
    studioName.value = result.studio.name
    state.value = 'accepted'
  } catch (error) {
    state.value = 'error'
    message.value = error instanceof Error ? error.message : 'Không thể nhận lời mời.'
  }
})
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-8 text-ink sm:px-5 sm:py-10">
    <section class="surface w-full p-5 shadow-sm sm:p-8">
      <NuxtLink to="/" class="focus-ring inline-flex min-h-11 items-center rounded text-sm font-semibold text-brand">Zeno Studio</NuxtLink>
      <h1 class="mt-4 text-2xl font-semibold tracking-tight text-balance sm:mt-6 sm:text-3xl">Lời mời vào studio</h1>
      <div v-if="state === 'loading'" role="status" aria-busy="true" aria-label="Đang kiểm tra lời mời" class="mt-4">
        <UiSkeleton class="h-4 w-full" />
        <UiSkeleton class="mt-2 h-4 w-3/4" />
        <UiSkeleton class="mt-6 h-12 w-48 rounded-full" />
        <span class="sr-only">Đang kiểm tra lời mời…</span>
      </div>
      <template v-else-if="state === 'login'">
        <p class="mt-4 text-pretty text-muted">Đăng nhập hoặc tạo tài khoản bằng đúng email được mời để tiếp tục.</p>
        <UiButton :to="{ path: '/studio', query: { next: route.fullPath } }" class="mt-6 w-full sm:w-auto">Đăng nhập / tạo tài khoản</UiButton>
      </template>
      <template v-else-if="state === 'accepted'">
        <p class="mt-4 text-muted">Bạn đã tham gia {{ studioName }}.</p>
        <UiButton to="/studio" class="mt-6 w-full sm:w-auto">Vào studio</UiButton>
      </template>
      <p v-else class="mt-4 text-danger" role="alert">{{ message }}</p>
    </section>
  </main>
</template>
