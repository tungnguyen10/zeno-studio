<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authClient } from '~/lib/auth-client'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'

useSeoMeta({ title: 'Studio — Zeno Studio' })

type Mode = 'login' | 'register' | 'recovery'
const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const busy = ref(false)
const feedback = ref('')
const hydrated = ref(false)
const currentUser = ref<{ name: string; email: string } | null>(null)
const studio = ref<{ id: string; name: string; role: string } | null>(null)
const studios = ref<Array<{ id: string; name: string; role: string }>>([])
const albums = ref<Array<{ id: string; title: string; status: string; expiresAt: string; photoCount: number }>>([])
const newAlbumTitle = ref('')
const folderUrl = ref('')
const albumLimit = ref(30)
const albumDays = ref<15 | 30>(15)
const albumBusy = ref(false)
const albumFeedback = ref('')
const albumFeedbackIsError = ref(false)
const publishedLink = ref('')
const route = useRoute()
const next = computed(() => {
  const candidate = route.query.next
  return typeof candidate === 'string' && candidate.startsWith('/studio/') && !candidate.startsWith('//') ? candidate : '/studio'
})
const heading = computed(() => mode.value === 'login' ? 'Chào mừng trở lại' : mode.value === 'register' ? 'Bắt đầu với studio của bạn' : 'Lấy lại mật khẩu')

async function loadStudio() {
  try {
    const result = await $fetch<{ studios: Array<{ id: string; name: string; role: string }> }>('/api/studio')
    studios.value = result.studios
    if (!studios.value.length) {
      const created = await $fetch<{ studio: { id: string; name: string; role: string } }>('/api/studio/bootstrap', { method: 'POST' })
      studios.value = [created.studio]
    }
    studio.value = studios.value[0] ?? null
    if (studio.value) await loadAlbums()
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Không thể tải studio. Vui lòng thử lại.'
  }
}

async function loadAlbums() {
  if (!studio.value) return
  try { albums.value = (await $fetch<{ albums: typeof albums.value }>(`/api/studio/${studio.value.id}/albums`)).albums }
  catch (error) { albumFeedbackIsError.value = true; albumFeedback.value = error instanceof Error ? error.message : 'Không tải được album' }
}

async function createNewAlbum() {
  if (!studio.value) return
  albumBusy.value = true
  albumFeedback.value = ''
  albumFeedbackIsError.value = false
  try {
    await $fetch(`/api/studio/${studio.value.id}/albums`, {
      method: 'POST',
      body: { title: newAlbumTitle.value, folderUrl: folderUrl.value, expiresInDays: albumDays.value, limit: { kind: 'maximum', count: albumLimit.value } },
    })
    newAlbumTitle.value = ''
    folderUrl.value = ''
    await loadAlbums()
    albumFeedbackIsError.value = false
    albumFeedback.value = 'Đã tạo album nháp.'
  } catch (error) { albumFeedbackIsError.value = true; albumFeedback.value = studioAlbumErrorMessage(error) }
  finally { albumBusy.value = false }
}

async function publish(id: string) {
  if (!studio.value) return
  albumBusy.value = true
  albumFeedback.value = ''
  albumFeedbackIsError.value = false
  try {
    const result = await $fetch<{ customerToken: string }>(`/api/studio/${studio.value.id}/albums/${id}/publish`, { method: 'POST' })
    publishedLink.value = `${location.origin}/album/${id}?token=${result.customerToken}`
    albumFeedback.value = 'Đã xuất bản. Hãy lưu và gửi link khách bên dưới.'
    await loadAlbums()
    albumFeedbackIsError.value = false
  } catch (error) { albumFeedbackIsError.value = true; albumFeedback.value = error instanceof Error ? error.message : 'Không thể xuất bản' }
  finally { albumBusy.value = false }
}

async function copyPublishedLink() {
  await navigator.clipboard.writeText(publishedLink.value)
  albumFeedback.value = 'Đã copy link khách hàng.'
}

onMounted(async () => {
  hydrated.value = true
  try {
    const { data } = await authClient.getSession()
    currentUser.value = data?.user ? { name: data.user.name, email: data.user.email } : null
    if (currentUser.value && next.value !== '/studio') await navigateTo(next.value)
    else if (currentUser.value) await loadStudio()
  } catch { /* Login form remains available when auth is not configured yet. */ }
})

async function submit() {
  busy.value = true
  feedback.value = ''
  try {
    if (mode.value === 'register') {
      const result = await authClient.signUp.email({ name: name.value.trim(), email: email.value.trim(), password: password.value, callbackURL: next.value })
      if (result.error) throw new Error(result.error.message)
      feedback.value = 'Nếu email này có tài khoản chưa xác minh, bạn sẽ nhận được liên kết xác minh.'
    } else if (mode.value === 'recovery') {
      const result = await authClient.requestPasswordReset({ email: email.value.trim(), redirectTo: '/studio/reset-password' })
      if (result.error) throw new Error(result.error.message)
      feedback.value = 'Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu.'
    } else {
      const result = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
      if (result.error) throw new Error(result.error.message)
      const session = await authClient.getSession()
      currentUser.value = session.data?.user ? { name: session.data.user.name, email: session.data.user.email } : null
      if (currentUser.value && next.value !== '/studio') await navigateTo(next.value)
      else if (currentUser.value) await loadStudio()
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
    const result = await authClient.sendVerificationEmail({ email: email.value.trim(), callbackURL: next.value })
    if (result.error) throw new Error(result.error.message)
    feedback.value = 'Nếu email này có tài khoản chưa xác minh, bạn sẽ nhận được liên kết xác minh. Hãy kiểm tra cả thư spam.'
  } catch {
    feedback.value = 'Không gửi được email xác minh. Vui lòng thử lại sau.'
  } finally { busy.value = false }
}

async function signOut() {
  await authClient.signOut()
  currentUser.value = null
  studio.value = null
  studios.value = []
  albums.value = []
}
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
      <NuxtLink to="/" class="flex items-center gap-3 text-lg font-bold"><span class="grid size-9 place-items-center rounded-xl bg-[#344732] text-white">Z</span>Zeno Studio</NuxtLink>
      <NuxtLink to="/tools/file-filter" class="text-sm font-semibold text-[#496446]">Lọc file trên máy ↗</NuxtLink>
    </header>

    <main class="mx-auto grid max-w-7xl items-start gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-2 lg:pt-28">
      <div class="max-w-xl">
        <p class="text-xs font-bold uppercase tracking-[.2em] text-[#718a66]">Không gian làm việc cho studio</p>
        <h1 class="mt-4 text-5xl font-semibold leading-[1.1] tracking-[-.045em]">Mỗi bộ ảnh có một hành trình. <em class="font-serif font-normal text-[#78916e]">Quản lý trọn vẹn.</em></h1>
        <p class="mt-6 text-lg leading-8 text-[#74766e]">Theo dõi album, lựa chọn của khách, ghi chú hậu kỳ và các vòng duyệt ở cùng một nơi.</p>
        <div class="mt-10 space-y-3 text-sm text-[#5f695a]"><p>✓ Link khách và link quản trị tách biệt</p><p>✓ Tên file và yêu cầu chỉnh sửa luôn đi cùng ảnh</p><p>✓ Lịch sử chốt và duyệt được lưu rõ ràng</p></div>
      </div>

      <section class="w-full max-w-lg rounded-[2rem] border border-[#e0e3d8] bg-white p-7 shadow-[0_30px_80px_-35px_rgba(39,55,35,.25)] sm:p-10">
        <div v-if="currentUser">
          <p class="text-sm font-semibold text-[#708967]">Đã đăng nhập</p>
          <h2 class="mt-2 text-3xl font-semibold">Xin chào, {{ currentUser.name }}</h2>
          <p class="mt-3 text-[#72766c]">{{ currentUser.email }}</p>
          <div v-if="studio" class="mt-7 space-y-3">
            <div v-for="item in studios" :key="item.id" class="rounded-2xl bg-[#f1f5ed] p-5 text-sm leading-6 text-[#526b4e]">
              <p class="font-semibold">{{ item.name }}</p>
              <p class="mt-1">Vai trò: {{ item.role === 'owner' ? 'Chủ studio' : item.role }}</p>
              <NuxtLink v-if="item.role === 'owner' || item.role === 'manager'" :to="`/studio/members?studio=${item.id}`" class="mt-3 inline-block font-semibold underline underline-offset-4">Quản lý thành viên</NuxtLink>
            </div>
          </div>
          <p v-else class="mt-7 rounded-2xl bg-[#f1f5ed] p-5 text-sm leading-6 text-[#526b4e]">Đang tải không gian studio…</p>
          <div v-if="studio" class="mt-8 border-t border-[#e0e4d9] pt-7">
            <h3 class="text-xl font-semibold">Album của studio</h3>
            <p class="mt-2 text-sm text-[#687264]">Nguồn Google Drive cần được kiểm chứng trước khi tạo hoặc xuất bản album thật.</p>
            <div v-if="albums.length" class="mt-4 space-y-2">
              <div v-for="album in albums" :key="album.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e0e4d9] p-4 text-sm">
                <div><p class="font-semibold">{{ album.title }}</p><p class="mt-1 text-[#687264]">{{ album.photoCount }} ảnh · {{ album.status }}</p></div>
                <div class="flex gap-3">
                  <NuxtLink :to="`/studio/albums/${album.id}?studio=${studio.id}`" class="font-semibold text-[#344732] underline">Chi tiết</NuxtLink>
                  <button v-if="album.status === 'DRAFT' && (studio.role === 'owner' || studio.role === 'manager')" :disabled="albumBusy" class="font-semibold text-[#344732] underline" @click="publish(album.id)">Xuất bản</button>
                  <NuxtLink v-if="album.status === 'FINALIZED' || album.status === 'DELIVERED'" :to="`/studio/albums/${album.id}/results?studio=${studio.id}`" class="font-semibold text-[#344732] underline">Kết quả</NuxtLink>
                </div>
              </div>
            </div>
            <p v-else class="mt-4 text-sm text-[#687264]">Chưa có album.</p>
            <form v-if="studio.role === 'owner' || studio.role === 'manager'" class="mt-6 space-y-3" @submit.prevent="createNewAlbum">
              <h4 class="font-semibold">Tạo album từ Google Drive</h4>
              <label class="block text-sm">Tên album<input v-model="newAlbumTitle" required maxlength="150" class="mt-1 w-full rounded-xl border p-3" placeholder="Mai & Quang"></label>
              <label class="block text-sm">Link folder Drive<input v-model="folderUrl" required type="url" class="mt-1 w-full rounded-xl border p-3" placeholder="https://drive.google.com/drive/folders/..."></label>
              <div class="grid grid-cols-2 gap-3">
                <label class="text-sm">Tối đa ảnh chọn<input v-model.number="albumLimit" required type="number" min="0" class="mt-1 w-full rounded-xl border p-3"></label>
                <label class="text-sm">Hạn album<select v-model.number="albumDays" class="mt-1 w-full rounded-xl border p-3"><option :value="15">15 ngày</option><option :value="30">30 ngày</option></select></label>
              </div>
              <button :disabled="albumBusy" class="rounded-full bg-[#344732] px-5 py-3 font-semibold text-white disabled:opacity-50">Tạo album nháp</button>
            </form>
            <p v-if="albumFeedback" :role="albumFeedbackIsError ? 'alert' : 'status'" class="mt-3 text-sm" :class="albumFeedbackIsError ? 'text-red-700' : 'text-[#526b4e]'">{{ albumFeedback }}</p>
            <div v-if="publishedLink" class="mt-3 rounded-xl bg-[#f1f5ed] p-4 text-sm"><p class="font-semibold">Link khách hàng</p><a :href="publishedLink" class="mt-2 block break-all text-[#344732] underline">{{ publishedLink }}</a><button class="mt-2 font-semibold underline" @click="copyPublishedLink">Copy link</button></div>
          </div>
          <p v-if="feedback" class="mt-4 text-sm text-red-700" role="alert">{{ feedback }}</p>
          <button type="button" class="mt-6 rounded-full border border-[#cbd4c6] px-5 py-2.5 font-semibold" @click="signOut">Đăng xuất</button>
        </div>

        <div v-else>
          <div class="flex rounded-full bg-[#f1f3ed] p-1 text-sm font-semibold">
            <button type="button" :disabled="!hydrated" class="flex-1 rounded-full px-4 py-2.5" :class="mode === 'login' ? 'bg-white text-[#344732] shadow-sm' : 'text-[#858980]'" @click="mode = 'login'; feedback = ''">Đăng nhập</button>
            <button type="button" :disabled="!hydrated" class="flex-1 rounded-full px-4 py-2.5" :class="mode === 'register' ? 'bg-white text-[#344732] shadow-sm' : 'text-[#858980]'" @click="mode = 'register'; feedback = ''">Tạo tài khoản</button>
          </div>
          <h2 class="mt-8 text-3xl font-semibold tracking-tight">{{ heading }}</h2>
          <p class="mt-2 text-sm leading-6 text-[#777a71]">{{ mode === 'recovery' ? 'Nhập email để nhận liên kết đặt lại mật khẩu.' : 'Dùng email của bạn để tiếp tục công việc với Zeno Studio.' }}</p>
          <form class="mt-7 space-y-4" @submit.prevent="submit">
            <label v-if="mode === 'register'" class="block text-sm font-semibold">Tên studio hoặc tên của bạn
              <input v-model="name" required autocomplete="name" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal outline-none focus:border-[#78916e]" placeholder="Studio An Nhiên">
            </label>
            <label class="block text-sm font-semibold">Email
              <input v-model="email" required type="email" autocomplete="email" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal outline-none focus:border-[#78916e]" placeholder="you@studio.vn">
            </label>
            <label v-if="mode !== 'recovery'" class="block text-sm font-semibold">Mật khẩu
              <input v-model="password" required type="password" minlength="8" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal outline-none focus:border-[#78916e]" placeholder="Tối thiểu 8 ký tự">
            </label>
            <button type="submit" :disabled="busy || !hydrated" class="w-full rounded-full bg-[#344732] px-5 py-3.5 font-semibold text-white disabled:opacity-60">{{ busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Gửi liên kết' }}</button>
          </form>
          <p v-if="feedback" class="mt-4 rounded-xl bg-[#f1f5ed] p-4 text-sm text-[#51654e]" role="status">{{ feedback }}</p>
          <button v-if="mode !== 'recovery'" type="button" :disabled="busy || !email.trim()" class="mt-4 block text-sm font-medium text-[#64815e] underline underline-offset-4 disabled:opacity-60" @click="resendVerification">Gửi lại email xác minh</button>
          <button type="button" class="mt-5 text-sm font-medium text-[#64815e] underline underline-offset-4" @click="mode = mode === 'recovery' ? 'login' : 'recovery'; feedback = ''">{{ mode === 'recovery' ? 'Quay lại đăng nhập' : 'Quên mật khẩu?' }}</button>
        </div>
      </section>
    </main>
  </div>
</template>
