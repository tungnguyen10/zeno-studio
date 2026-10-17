<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { STUDIO_ROLE_LABELS, useStudioStore, type StudioRole } from '~/stores/studio'

useSeoMeta({ title: 'Thành viên studio — Zeno Studio' })
const route = useRoute()
const store = useStudioStore()
type InviteRole = 'manager' | 'member' | 'retoucher'
type Member = { userId: string; email: string | null; role: StudioRole }
type Invitation = { id: string; email: string; role: StudioRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }
type Pending = { kind: 'member'; member: Member } | { kind: 'invitation'; invitation: Invitation }
const members = ref<Member[]>([])
const invitations = ref<Invitation[]>([])
const inviteEmail = ref('')
const inviteRole = ref<InviteRole>('member')
const inviteLink = ref('')
const busy = ref(false)
const loaded = ref(false)
const feedback = ref('')
const pending = ref<Pending | null>(null)
const confirmOpen = ref(false)
const confirmCopy = computed(() => pending.value?.kind === 'invitation'
  ? { title: 'Thu hồi lời mời?', text: `Liên kết mời gửi tới ${pending.value.invitation.email} sẽ không còn dùng được.`, action: 'Thu hồi lời mời' }
  : { title: 'Thu hồi quyền thành viên?', text: `${pending.value?.kind === 'member' ? pending.value.member.email || pending.value.member.userId : ''} sẽ không còn truy cập studio này.`, action: 'Thu hồi' })

async function load() {
  busy.value = true
  feedback.value = ''
  try {
    await store.ensureStudios(typeof route.query.studio === 'string' ? route.query.studio : null)
    if (store.error) throw new Error(store.error)
    const selected = store.studio
    if (!selected) throw new Error('Bạn chưa có studio.')
    if (!store.canManage) throw new Error('Bạn không có quyền quản lý thành viên của studio này.')
    const [memberResult, invitationResult] = await Promise.all([
      $fetch<{ members: Member[] }>(`/api/studio/${selected.id}/members`),
      $fetch<{ invitations: Invitation[] }>(`/api/studio/${selected.id}/invitations`),
    ])
    members.value = memberResult.members
    invitations.value = invitationResult.invitations
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể tải thành viên.' }
  finally { busy.value = false; loaded.value = true }
}

async function createInvitation() {
  const studio = store.studio
  if (!studio) return
  busy.value = true
  feedback.value = ''
  inviteLink.value = ''
  try {
    const result = await $fetch<{ invitation: { token: string } }>(`/api/studio/${studio.id}/invitations`, {
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

async function changeRole(member: Member, role: InviteRole) {
  const studio = store.studio
  if (!studio) return
  busy.value = true
  try {
    await $fetch(`/api/studio/${studio.id}/members/${encodeURIComponent(member.userId)}`, { method: 'PATCH', body: { role } })
    await load()
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Không thể đổi vai trò.' }
  finally { busy.value = false }
}

function askRemoveMember(member: Member) {
  pending.value = { kind: 'member', member }
  confirmOpen.value = true
}

function askRevokeInvitation(invitation: Invitation) {
  pending.value = { kind: 'invitation', invitation }
  confirmOpen.value = true
}

async function confirmPending() {
  const studio = store.studio
  const action = pending.value
  confirmOpen.value = false
  if (!studio || !action) return
  busy.value = true
  try {
    if (action.kind === 'member') await $fetch(`/api/studio/${studio.id}/members/${encodeURIComponent(action.member.userId)}`, { method: 'DELETE' })
    else await $fetch(`/api/studio/${studio.id}/invitations/${action.invitation.id}`, { method: 'DELETE' })
    await load()
  } catch (error) { feedback.value = error instanceof Error ? error.message : action.kind === 'member' ? 'Không thể thu hồi quyền.' : 'Không thể thu hồi lời mời.' }
  finally { busy.value = false }
}

function invitationState(invitation: Invitation): string {
  if (invitation.acceptedAt) return 'Đã tham gia'
  if (invitation.revokedAt) return 'Đã thu hồi'
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return 'Đã hết hạn'
  return `Hết hạn ${new Date(invitation.expiresAt).toLocaleDateString('vi-VN')}`
}

const isPending = (invitation: Invitation) => !invitation.acceptedAt && !invitation.revokedAt

watch(() => store.studio?.id, (id, previous) => { if (loaded.value && id !== previous) void load() })
onMounted(() => {
  void store.checkSession()
  void load()
})

const field = 'mt-2 min-h-11 w-full rounded-xl border border-[#d9ddd2] px-4 py-2.5 font-normal focus-visible:border-brand-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-soft'
const dangerButton = 'min-h-11 rounded-full px-4 text-sm font-semibold text-red-700 hover:bg-[#fbeceb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50'
</script>

<template>
  <div class="min-h-screen bg-canvas text-ink">
    <StudioHeader v-if="store.studiosLoaded" />
    <main class="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <h1 class="text-3xl font-semibold tracking-tight">Thành viên studio</h1>
      <p v-if="store.studio && store.canManage" class="mt-1 text-sm text-muted">Mời người mới và quản lý vai trò truy cập studio.</p>

      <div v-if="!loaded" role="status" aria-busy="true" aria-label="Đang tải thành viên" class="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section class="rounded-2xl border border-line bg-white p-6">
          <UiSkeleton class="h-6 w-40" />
          <UiSkeleton class="mt-3 h-4 w-full" />
          <UiSkeleton class="mt-6 h-[4.5rem] w-full rounded-xl" />
          <UiSkeleton class="mt-4 h-[4.5rem] w-full rounded-xl" />
          <UiSkeleton class="mt-4 h-12 w-36 rounded-full" />
        </section>
        <div class="space-y-6">
          <section v-for="n in 2" :key="n" class="rounded-2xl border border-line bg-white p-6">
            <UiSkeleton class="h-6 w-32" />
            <div class="mt-5 space-y-3">
              <div v-for="row in 3" :key="row" class="flex items-center justify-between gap-3">
                <UiSkeleton class="h-4 w-1/2" />
                <UiSkeleton class="h-9 w-28 rounded-full" />
              </div>
            </div>
          </section>
        </div>
        <span class="sr-only">Đang tải thành viên…</span>
      </div>

      <div v-if="feedback" role="status" class="mt-6 rounded-xl bg-tint p-4 text-sm">
        <p>{{ feedback }}</p>
        <NuxtLink v-if="loaded && !store.canManage" to="/studio" class="mt-2 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">Về trang studio</NuxtLink>
      </div>

      <div v-if="store.canManage && loaded" class="mt-8 grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
        <section class="rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-28">
          <h2 class="text-xl font-semibold">Mời người mới</h2>
          <p class="mt-2 text-sm text-muted">Liên kết chỉ dùng cho email được mời và hết hạn sau 7 ngày.</p>
          <form class="mt-5 space-y-4" @submit.prevent="createInvitation">
            <label class="block text-sm font-semibold">Email người nhận
              <input v-model="inviteEmail" type="email" required :class="field" placeholder="artist@studio.vn">
            </label>
            <label class="block text-sm font-semibold">Vai trò
              <select v-model="inviteRole" :class="field">
                <option v-if="store.studio?.role === 'owner'" value="manager">Quản lý</option>
                <option value="member">Thành viên</option>
                <option value="retoucher">Retoucher</option>
              </select>
            </label>
            <button :disabled="busy" class="min-h-11 rounded-full bg-brand px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60">Tạo lời mời</button>
          </form>
          <div v-if="inviteLink" class="mt-5 rounded-xl bg-tint p-4">
            <label class="block text-sm font-semibold">Liên kết mời — chỉ hiện lần này
              <input :value="inviteLink" readonly class="mt-2 w-full rounded-lg border border-[#cbd4c6] bg-white p-2 text-xs" @focus="($event.target as HTMLInputElement).select()">
            </label>
            <button type="button" class="mt-2 min-h-11 text-sm font-semibold text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="copyInvitation">Sao chép liên kết</button>
          </div>
        </section>

        <div class="space-y-6">
          <section class="rounded-2xl border border-line bg-white p-6">
            <h2 class="text-xl font-semibold">Thành viên <span class="text-base font-normal text-muted">({{ members.length }})</span></h2>
            <p v-if="!members.length" class="mt-5 text-sm text-muted">Chưa có thành viên.</p>
            <ul v-else class="mt-3 divide-y divide-[#e8ebe3]">
              <li v-for="member in members" :key="member.userId" class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span class="min-w-0 break-all font-medium">{{ member.email || member.userId }}</span>
                <span v-if="member.role === 'owner' || store.studio?.role !== 'owner'" class="rounded-full bg-tint px-3 py-1 text-xs font-semibold text-[#4f5d4b]">{{ STUDIO_ROLE_LABELS[member.role] }}</span>
                <span v-else class="flex flex-wrap items-center gap-2">
                  <select :value="member.role" :disabled="busy" :aria-label="`Vai trò của ${member.email || member.userId}`" class="min-h-11 rounded-lg border border-[#d9ddd2] bg-white px-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand" @change="changeRole(member, ($event.target as HTMLSelectElement).value as InviteRole)">
                    <option value="manager">Quản lý</option><option value="member">Thành viên</option><option value="retoucher">Retoucher</option>
                  </select>
                  <button type="button" :disabled="busy" :class="dangerButton" @click="askRemoveMember(member)">Thu hồi</button>
                </span>
              </li>
            </ul>
          </section>

          <section class="rounded-2xl border border-line bg-white p-6">
            <h2 class="text-xl font-semibold">Lời mời</h2>
            <p v-if="!invitations.length" class="mt-5 text-sm text-muted">Chưa có lời mời.</p>
            <ul v-else class="mt-3 divide-y divide-[#e8ebe3]">
              <li v-for="invitation in invitations" :key="invitation.id" class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span class="min-w-0"><span class="break-all font-medium">{{ invitation.email }}</span><span class="block text-xs text-muted">{{ STUDIO_ROLE_LABELS[invitation.role] }} · {{ invitationState(invitation) }}</span></span>
                <button v-if="isPending(invitation)" type="button" :disabled="busy" :class="dangerButton" @click="askRevokeInvitation(invitation)">Thu hồi lời mời</button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>

    <UiModal v-model:open="confirmOpen" :title="confirmCopy.title" :description="confirmCopy.text">
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="confirmOpen = false">Hủy</button>
        <button type="button" class="min-h-11 rounded-full bg-red-700 px-6 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700" @click="confirmPending">{{ confirmCopy.action }}</button>
      </div>
    </UiModal>
  </div>
</template>
