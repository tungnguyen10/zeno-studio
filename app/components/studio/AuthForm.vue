<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authClient } from '~/lib/auth-client'

type Mode = 'login' | 'register' | 'recovery'
const props = defineProps<{ next: string }>()
const emit = defineEmits<{ signedIn: [] }>()

const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const busy = ref(false)
const feedback = ref('')
const hydrated = ref(false)
const heading = computed(() => mode.value === 'login' ? 'Chào mừng trở lại' : mode.value === 'register' ? 'Bắt đầu với studio của bạn' : 'Lấy lại mật khẩu')

onMounted(() => { hydrated.value = true })

function switchMode(value: Mode) {
  mode.value = value
  feedback.value = ''
}

async function submit() {
  busy.value = true
  feedback.value = ''
  try {
    if (mode.value === 'register') {
      const result = await authClient.signUp.email({ name: name.value.trim(), email: email.value.trim(), password: password.value, callbackURL: props.next })
      if (result.error) throw new Error(result.error.message)
      feedback.value = 'Nếu email này có tài khoản chưa xác minh, bạn sẽ nhận được liên kết xác minh.'
    } else if (mode.value === 'recovery') {
      const result = await authClient.requestPasswordReset({ email: email.value.trim(), redirectTo: '/studio/reset-password' })
      if (result.error) throw new Error(result.error.message)
      feedback.value = 'Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu.'
    } else {
      const result = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
      if (result.error) throw new Error(result.error.message)
      emit('signedIn')
    }
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Không thể hoàn tất. Vui lòng thử lại.'
  } finally { busy.value = false }
}

async function resendVerification() {
  if (busy.value || !email.value.trim()) return
  busy.value = true
  feedback.value = ''
  try {
    const result = await authClient.sendVerificationEmail({ email: email.value.trim(), callbackURL: props.next })
    if (result.error) throw new Error(result.error.message)
    feedback.value = 'Nếu email này có tài khoản chưa xác minh, bạn sẽ nhận được liên kết xác minh. Hãy kiểm tra cả thư spam.'
  } catch {
    feedback.value = 'Không gửi được email xác minh. Vui lòng thử lại sau.'
  } finally { busy.value = false }
}

const input = 'control mt-2 min-h-12 px-4'
const tab = 'focus-ring min-h-11 flex-1 rounded-full px-4 py-2.5 transition-colors'
const textButton = 'focus-ring min-h-11 rounded text-sm font-medium text-brand underline underline-offset-4 disabled:opacity-60'
</script>

<template>
  <div>
    <div role="group" aria-label="Chế độ tài khoản" class="flex rounded-full bg-tint p-1 text-sm font-semibold">
      <button type="button" :disabled="!hydrated" :aria-pressed="mode === 'login'" :class="[tab, mode === 'login' ? 'bg-white text-brand shadow-sm' : 'text-muted']" @click="switchMode('login')">Đăng nhập</button>
      <button type="button" :disabled="!hydrated" :aria-pressed="mode === 'register'" :class="[tab, mode === 'register' ? 'bg-white text-brand shadow-sm' : 'text-muted']" @click="switchMode('register')">Tạo tài khoản</button>
    </div>
    <h2 class="mt-6 text-2xl font-semibold tracking-tight text-balance sm:mt-8 sm:text-3xl">{{ heading }}</h2>
    <p class="mt-2 text-sm leading-6 text-pretty text-muted">{{ mode === 'recovery' ? 'Nhập email để nhận liên kết đặt lại mật khẩu.' : 'Dùng email của bạn để tiếp tục công việc với Zeno Studio.' }}</p>
    <form class="mt-6 space-y-4 sm:mt-7" @submit.prevent="submit">
      <label v-if="mode === 'register'" class="block text-sm font-semibold">Tên studio hoặc tên của bạn
        <input v-model="name" required name="name" autocomplete="name" :class="input" placeholder="Studio An Nhiên…">
      </label>
      <label class="block text-sm font-semibold">Email
        <input v-model="email" required type="email" name="email" autocomplete="email" spellcheck="false" autocapitalize="off" :class="input" placeholder="you@studio.vn">
      </label>
      <label v-if="mode !== 'recovery'" class="block text-sm font-semibold">Mật khẩu
        <input v-model="password" required type="password" name="password" minlength="8" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :class="input" placeholder="Tối thiểu 8 ký tự">
      </label>
      <UiButton type="submit" block class="min-h-12" :disabled="!hydrated" :loading="busy">{{ busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Gửi liên kết' }}</UiButton>
    </form>
    <p v-if="feedback" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand" role="status">{{ feedback }}</p>
    <div class="mt-3 flex flex-col items-start">
      <button v-if="mode !== 'recovery'" type="button" :disabled="busy || !email.trim()" :class="textButton" @click="resendVerification">Gửi lại email xác minh</button>
      <button type="button" :class="textButton" @click="switchMode(mode === 'recovery' ? 'login' : 'recovery')">{{ mode === 'recovery' ? 'Quay lại đăng nhập' : 'Quên mật khẩu?' }}</button>
    </div>
  </div>
</template>
