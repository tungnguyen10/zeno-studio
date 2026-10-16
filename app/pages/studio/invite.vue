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
  <main class="mx-auto flex min-h-screen max-w-lg items-center px-5 py-10 text-[#24231f]">
    <section class="w-full rounded-2xl border border-[#e0e3d8] bg-white p-8 shadow-sm">
      <NuxtLink to="/" class="text-sm font-semibold text-[#496446]">Zeno Studio</NuxtLink>
      <h1 class="mt-6 text-3xl font-semibold">Lời mời vào studio</h1>
      <div v-if="state === 'loading'" role="status" aria-busy="true" aria-label="Đang kiểm tra lời mời" class="mt-4">
        <UiSkeleton class="h-4 w-full" />
        <UiSkeleton class="mt-2 h-4 w-3/4" />
        <UiSkeleton class="mt-6 h-12 w-48 rounded-full" />
        <span class="sr-only">Đang kiểm tra lời mời…</span>
      </div>
      <template v-else-if="state === 'login'">
        <p class="mt-4 text-[#667060]">Đăng nhập hoặc tạo tài khoản bằng đúng email được mời để tiếp tục.</p>
        <NuxtLink :to="{ path: '/studio', query: { next: route.fullPath } }" class="mt-6 inline-block rounded-full bg-[#344732] px-5 py-3 font-semibold text-white">Đăng nhập / tạo tài khoản</NuxtLink>
      </template>
      <template v-else-if="state === 'accepted'">
        <p class="mt-4 text-[#667060]">Bạn đã tham gia {{ studioName }}.</p>
        <NuxtLink to="/studio" class="mt-6 inline-block rounded-full bg-[#344732] px-5 py-3 font-semibold text-white">Vào studio</NuxtLink>
      </template>
      <p v-else class="mt-4 text-red-700" role="alert">{{ message }}</p>
    </section>
  </main>
</template>
