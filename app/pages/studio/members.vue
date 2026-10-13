<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

useSeoMeta({ title: 'Thành viên studio — Zeno Studio' })
const route = useRoute()
type Role = 'owner' | 'manager' | 'member' | 'retoucher'
type Member = { userId: string; email: string | null; role: Role }
type Invitation = { id: string; email: string; role: Role; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }
type Studio = { id: string; name: string; role: Role }
const studio = ref<Studio | null>(null)
const members = ref<Member[]>([])
const invitations = ref<Invitation[]>([])
const inviteEmail = ref('')
const inviteRole = ref<'manager' | 'member' | 'retoucher'>('member')
const inviteLink = ref('')
const busy = ref(false)
const feedback = ref('')
const canManage = computed(() => studio.value?.role === 'owner' || studio.value?.role === 'manager')

async function load() {
  busy.value = true
  feedback.value = ''
  try {
    const all = await $fetch<{ studios: Studio[] }>('/api/studio')
    const selected = all.studios.find(item => item.id === route.query.studio) ?? all.studios[0]
    if (!selected) throw new Error('Bạn chưa có studio.')
    studio.value = selected
    if (!canManage.value) throw new Error('Bạn không có quyền quản lý thành viên của studio này.')
    const [memberResult, invitationResult] = await Promise.all([
      $fetch<{ members: Member[] }>(`/api/studio/${selected.id}/members`),
      $fetch<{ invitations: Invitation[] }>(`/api/studio/${selected.id}/invitations`),
    ])
    members.value = memberResult.members
    invitations.value = invitationResult.invitations
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể tải thành viên.' }
  finally { busy.value = false }
}

async function createInvitation() {
  if (!studio.value) return
  busy.value = true
  feedback.value = ''
  inviteLink.value = ''
  try {
    const result = await $fetch<{ invitation: { token: string } }>(`/api/studio/${studio.value.id}/invitations`, {
      method: 'POST', body: { email: inviteEmail.value, role: inviteRole.value },
    })
    inviteLink.value = `${window.location.origin}/studio/invite?token=${encodeURIComponent(result.invitation.token)}`
    inviteEmail.value = ''
    await load()
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể tạo lời mời.' }
  finally { busy.value = false }
}

async function copyInvitation() {
  try { await navigator.clipboard.writeText(inviteLink.value); feedback.value = 'Đã sao chép liên kết mời.' }
  catch { feedback.value = 'Không thể sao chép tự động. Hãy chọn và sao chép liên kết.' }
}

async function changeRole(member: Member, role: 'manager' | 'member' | 'retoucher') {
  if (!studio.value) return
  busy.value = true
  try {
    await $fetch(`/api/studio/${studio.value.id}/members/${encodeURIComponent(member.userId)}`, { method: 'PATCH', body: { role } })
    await load()
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể đổi vai trò.' }
  finally { busy.value = false }
}

async function removeMember(member: Member) {
  if (!studio.value || !window.confirm(`Thu hồi quyền của ${member.email || member.userId}?`)) return
  busy.value = true
  try {
    await $fetch(`/api/studio/${studio.value.id}/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE' })
    await load()
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể thu hồi quyền.' }
  finally { busy.value = false }
}

async function revokeInvitation(invitation: Invitation) {
  if (!studio.value) return
  busy.value = true
  try {
    await $fetch(`/api/studio/${studio.value.id}/invitations/${invitation.id}`, { method: 'DELETE' })
    await load()
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể thu hồi lời mời.' }
  finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <main class="mx-auto min-h-screen max-w-5xl px-5 py-8 text-[#24231f] sm:px-8">
    <NuxtLink to="/studio" class="text-sm font-semibold text-[#496446]">← Studio</NuxtLink>
    <h1 class="mt-8 text-4xl font-semibold tracking-tight">Thành viên studio</h1>
    <p v-if="studio" class="mt-2 text-[#667060]">{{ studio.name }}</p>
    <p v-if="feedback" class="mt-5 rounded-xl bg-[#f1f5ed] p-4 text-sm" role="status">{{ feedback }}</p>
    <div v-if="canManage" class="mt-8 grid gap-7 lg:grid-cols-2">
      <section class="rounded-2xl border border-[#e0e3d8] bg-white p-6">
        <h2 class="text-xl font-semibold">Mời người mới</h2>
        <p class="mt-2 text-sm text-[#667060]">Liên kết chỉ dùng cho email được mời và hết hạn sau 7 ngày.</p>
        <form class="mt-5 space-y-4" @submit.prevent="createInvitation">
          <label class="block text-sm font-semibold">Email người nhận
            <input v-model="inviteEmail" type="email" required class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3" placeholder="artist@studio.vn">
          </label>
          <label class="block text-sm font-semibold">Vai trò
            <select v-model="inviteRole" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3">
              <option v-if="studio?.role === 'owner'" value="manager">Quản lý</option>
              <option value="member">Thành viên</option>
              <option value="retoucher">Retoucher</option>
            </select>
          </label>
          <button :disabled="busy" class="rounded-full bg-[#344732] px-5 py-3 font-semibold text-white disabled:opacity-60">Tạo lời mời</button>
        </form>
        <div v-if="inviteLink" class="mt-5 rounded-xl bg-[#f1f5ed] p-4">
          <label class="block text-sm font-semibold">Liên kết mời — chỉ hiện lần này
            <input :value="inviteLink" readonly class="mt-2 w-full rounded-lg border border-[#cbd4c6] bg-white p-2 text-xs" @focus="($event.target as HTMLInputElement).select()">
          </label>
          <button class="mt-3 text-sm font-semibold text-[#496446] underline" @click="copyInvitation">Sao chép liên kết</button>
        </div>
      </section>
      <section class="rounded-2xl border border-[#e0e3d8] bg-white p-6">
        <h2 class="text-xl font-semibold">Thành viên</h2>
        <p v-if="!members.length" class="mt-5 text-sm text-[#667060]">Chưa có thành viên.</p>
        <ul v-else class="mt-4 divide-y divide-[#e8ebe3]">
          <li v-for="member in members" :key="member.userId" class="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span class="break-all font-medium">{{ member.email || member.userId }}</span>
            <span v-if="member.role === 'owner' || studio?.role !== 'owner'">{{ member.role }}</span>
            <span v-else class="flex items-center gap-3">
              <select :value="member.role" :disabled="busy" :aria-label="`Vai trò của ${member.email || member.userId}`" class="rounded-lg border border-[#d9ddd2] p-2" @change="changeRole(member, ($event.target as HTMLSelectElement).value as 'manager' | 'member' | 'retoucher')">
                <option value="manager">Quản lý</option><option value="member">Thành viên</option><option value="retoucher">Retoucher</option>
              </select>
              <button :disabled="busy" class="text-red-700 underline" @click="removeMember(member)">Thu hồi</button>
            </span>
          </li>
        </ul>
      </section>
      <section class="rounded-2xl border border-[#e0e3d8] bg-white p-6 lg:col-span-2">
        <h2 class="text-xl font-semibold">Lời mời</h2>
        <p v-if="!invitations.length" class="mt-5 text-sm text-[#667060]">Chưa có lời mời.</p>
        <ul v-else class="mt-4 divide-y divide-[#e8ebe3]">
          <li v-for="invitation in invitations" :key="invitation.id" class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span>{{ invitation.email }} · {{ invitation.role }}</span>
            <span v-if="invitation.acceptedAt">Đã tham gia</span>
            <span v-else-if="invitation.revokedAt">Đã thu hồi</span>
            <button v-else :disabled="busy" class="text-red-700 underline" @click="revokeInvitation(invitation)">Thu hồi lời mời</button>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
