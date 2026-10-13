<script setup lang="ts">
import { computed, ref } from 'vue'
import { authClient } from '~/lib/auth-client'

useSeoMeta({ title: 'Đặt lại mật khẩu — Zeno Studio' })

const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const newPassword = ref('')
const confirmation = ref('')
const busy = ref(false)
const complete = ref(false)
const feedback = ref('')

async function submit() {
  if (!token.value || busy.value) return
  feedback.value = ''
  if (newPassword.value !== confirmation.value) {
    feedback.value = 'Hai mật khẩu chưa trùng nhau.'
    return
  }
  busy.value = true
  try {
    const result = await authClient.resetPassword({ token: token.value, newPassword: newPassword.value })
    if (result.error) throw new Error(result.error.message)
    complete.value = true
    newPassword.value = ''
    confirmation.value = ''
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-[#f8f7f3] px-5 py-12 text-[#24231f]">
    <main class="w-full max-w-md rounded-[2rem] border border-[#e0e3d8] bg-white p-7 shadow-[0_30px_80px_-35px_rgba(39,55,35,.25)] sm:p-10">
      <NuxtLink to="/" class="mb-10 flex items-center gap-3 text-lg font-bold"><span class="grid size-9 place-items-center rounded-xl bg-[#344732] text-white">Z</span>Zeno Studio</NuxtLink>
      <template v-if="!token">
        <h1 class="text-3xl font-semibold">Liên kết không hợp lệ</h1>
        <p class="mt-4 leading-7 text-[#72766c]">Liên kết đặt lại mật khẩu thiếu mã xác nhận. Hãy yêu cầu liên kết mới.</p>
        <NuxtLink to="/studio" class="mt-7 inline-block font-semibold text-[#496446] underline underline-offset-4">Về trang đăng nhập</NuxtLink>
      </template>
      <template v-else-if="complete">
        <h1 class="text-3xl font-semibold">Mật khẩu đã được cập nhật</h1>
        <p class="mt-4 leading-7 text-[#72766c]">Bạn có thể đăng nhập với mật khẩu mới.</p>
        <NuxtLink to="/studio" class="mt-7 inline-block font-semibold text-[#496446] underline underline-offset-4">Đăng nhập</NuxtLink>
      </template>
      <template v-else>
        <h1 class="text-3xl font-semibold">Đặt lại mật khẩu</h1>
        <p class="mt-3 leading-7 text-[#72766c]">Chọn mật khẩu mới cho tài khoản studio.</p>
        <form class="mt-7 space-y-4" @submit.prevent="submit">
          <label class="block text-sm font-semibold">Mật khẩu mới
            <input v-model="newPassword" required type="password" minlength="8" autocomplete="new-password" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal outline-none focus:border-[#78916e]">
          </label>
          <label class="block text-sm font-semibold">Xác nhận mật khẩu
            <input v-model="confirmation" required type="password" minlength="8" autocomplete="new-password" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal outline-none focus:border-[#78916e]">
          </label>
          <button type="submit" :disabled="busy" class="w-full rounded-full bg-[#344732] px-5 py-3.5 font-semibold text-white disabled:opacity-60">{{ busy ? 'Đang xử lý…' : 'Lưu mật khẩu mới' }}</button>
        </form>
        <p v-if="feedback" class="mt-4 rounded-xl bg-[#fff3ee] p-4 text-sm text-[#934732]" role="alert">{{ feedback }}</p>
      </template>
    </main>
  </div>
</template>
