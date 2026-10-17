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

const input = 'mt-2 min-h-12 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal focus-visible:border-brand-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-soft'
const tab = 'min-h-11 flex-1 rounded-full px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand'
const textButton = 'min-h-11 text-sm font-medium text-[#4f6a49] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60'
</script>

<template>
  <div>
    <div class="flex rounded-full bg-[#f1f3ed] p-1 text-sm font-semibold">
      <button type="button" :disabled="!hydrated" :class="[tab, mode === 'login' ? 'bg-white text-brand shadow-sm' : 'text-[#6f7369]']" @click="switchMode('login')">Đăng nhập</button>
      <button type="button" :disabled="!hydrated" :class="[tab, mode === 'register' ? 'bg-white text-brand shadow-sm' : 'text-[#6f7369]']" @click="switchMode('register')">Tạo tài khoản</button>
    </div>
    <h2 class="mt-8 text-3xl font-semibold tracking-tight">{{ heading }}</h2>
    <p class="mt-2 text-sm leading-6 text-muted">{{ mode === 'recovery' ? 'Nhập email để nhận liên kết đặt lại mật khẩu.' : 'Dùng email của bạn để tiếp tục công việc với Zeno Studio.' }}</p>
    <form class="mt-7 space-y-4" @submit.prevent="submit">
      <label v-if="mode === 'register'" class="block text-sm font-semibold">Tên studio hoặc tên của bạn
        <input v-model="name" required autocomplete="name" :class="input" placeholder="Studio An Nhiên">
      </label>
      <label class="block text-sm font-semibold">Email
        <input v-model="email" required type="email" autocomplete="email" :class="input" placeholder="you@studio.vn">
      </label>
      <label v-if="mode !== 'recovery'" class="block text-sm font-semibold">Mật khẩu
        <input v-model="password" required type="password" minlength="8" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :class="input" placeholder="Tối thiểu 8 ký tự">
      </label>
      <button type="submit" :disabled="busy || !hydrated" :aria-busy="busy" class="min-h-12 w-full rounded-full bg-brand px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60">{{ busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Gửi liên kết' }}</button>
    </form>
    <p v-if="feedback" class="mt-4 rounded-xl bg-tint p-4 text-sm text-[#51654e]" role="status">{{ feedback }}</p>
    <div class="mt-3 flex flex-col items-start">
      <button v-if="mode !== 'recovery'" type="button" :disabled="busy || !email.trim()" :class="textButton" @click="resendVerification">Gửi lại email xác minh</button>
      <button type="button" :class="textButton" @click="switchMode(mode === 'recovery' ? 'login' : 'recovery')">{{ mode === 'recovery' ? 'Quay lại đăng nhập' : 'Quên mật khẩu?' }}</button>
    </div>
  </div>
</template>
