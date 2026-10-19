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
  <div class="grid min-h-dvh place-items-center bg-canvas px-4 py-8 text-ink sm:px-5 sm:py-12">
    <main class="w-full max-w-md rounded-3xl border border-line bg-white p-5 shadow-[0_30px_80px_-35px_rgba(39,55,35,.25)] sm:rounded-[2rem] sm:p-10">
      <NuxtLink to="/" class="focus-ring mb-6 flex min-h-11 w-fit items-center gap-3 rounded-lg text-lg font-bold sm:mb-10"><span aria-hidden="true" class="grid size-9 place-items-center rounded-xl bg-brand text-white">Z</span>Zeno Studio</NuxtLink>
      <template v-if="!token">
        <h1 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Liên kết không hợp lệ</h1>
        <p class="mt-4 leading-7 text-pretty text-muted">Liên kết đặt lại mật khẩu thiếu mã xác nhận. Hãy yêu cầu liên kết mới.</p>
        <NuxtLink to="/studio" class="focus-ring mt-6 inline-flex min-h-11 items-center rounded font-semibold text-brand underline underline-offset-4">Về trang đăng nhập</NuxtLink>
      </template>
      <template v-else-if="complete">
        <h1 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Mật khẩu đã được cập nhật</h1>
        <p class="mt-4 leading-7 text-muted">Bạn có thể đăng nhập với mật khẩu mới.</p>
        <UiButton to="/studio" class="mt-6 w-full sm:w-auto">Đăng nhập</UiButton>
      </template>
      <template v-else>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Đặt lại mật khẩu</h1>
        <p class="mt-3 leading-7 text-muted">Chọn mật khẩu mới cho tài khoản studio.</p>
        <form class="mt-6 space-y-4 sm:mt-7" @submit.prevent="submit">
          <label class="block text-sm font-semibold">Mật khẩu mới
            <input v-model="newPassword" required type="password" name="new-password" minlength="8" autocomplete="new-password" :aria-invalid="!!feedback" class="control mt-2 min-h-12 px-4">
          </label>
          <label class="block text-sm font-semibold">Xác nhận mật khẩu
            <input v-model="confirmation" required type="password" name="confirm-password" minlength="8" autocomplete="new-password" :aria-invalid="!!feedback" class="control mt-2 min-h-12 px-4">
          </label>
          <UiButton type="submit" block class="min-h-12" :loading="busy">{{ busy ? 'Đang xử lý…' : 'Lưu mật khẩu mới' }}</UiButton>
        </form>
        <UiNotice v-if="feedback" tone="error" class="mt-4">{{ feedback }}</UiNotice>
      </template>
    </main>
  </div>
</template>
