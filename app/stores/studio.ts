import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authClient } from '~/lib/auth-client'

export type StudioRole = 'owner' | 'manager' | 'member' | 'retoucher'
export interface StudioInfo { id: string; name: string; role: StudioRole }
export interface StudioUser { name: string; email: string }

export const STUDIO_ROLE_LABELS: Record<StudioRole, string> = {
  owner: 'Chủ studio',
  manager: 'Quản lý',
  member: 'Thành viên',
  retoucher: 'Retoucher',
}

export const useStudioStore = defineStore('studio', () => {
  const user = ref<StudioUser | null>(null)
  const sessionChecked = ref(false)
  const studios = ref<StudioInfo[]>([])
  const studiosLoaded = ref(false)
  const studiosLoading = ref(false)
  const error = ref('')
  const selectedId = ref<string | null>(null)

  const studio = computed(() => studios.value.find(item => item.id === selectedId.value) ?? studios.value[0] ?? null)
  const canManage = computed(() => studio.value?.role === 'owner' || studio.value?.role === 'manager')
  const canShare = computed(() => canManage.value || studio.value?.role === 'member')

  async function checkSession() {
    try {
      const { data } = await authClient.getSession()
      user.value = data?.user ? { name: data.user.name, email: data.user.email } : null
    } catch { /* The login form stays available when auth is not configured yet. */ }
    finally { sessionChecked.value = true }
  }

  function select(id: string | null | undefined) {
    if (id && studios.value.some(item => item.id === id)) selectedId.value = id
  }

  // Creates the first studio on demand, so a new account always lands in a usable workspace.
  async function loadStudios(preferredId?: string | null) {
    studiosLoading.value = true
    error.value = ''
    try {
      const result = await $fetch<{ studios: StudioInfo[] }>('/api/studio')
      studios.value = result.studios
      if (!studios.value.length) {
        const created = await $fetch<{ studio: StudioInfo }>('/api/studio/bootstrap', { method: 'POST' })
        studios.value = [created.studio]
      }
      studiosLoaded.value = true
      select(preferredId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Không thể tải studio. Vui lòng thử lại.'
    } finally { studiosLoading.value = false }
  }

  async function ensureStudios(preferredId?: string | null) {
    if (studiosLoaded.value) select(preferredId)
    else await loadStudios(preferredId)
  }

  async function signOut() {
    await authClient.signOut()
    user.value = null
    studios.value = []
    studiosLoaded.value = false
    selectedId.value = null
    error.value = ''
  }

  return { user, sessionChecked, studios, studiosLoaded, studiosLoading, error, studio, canManage, canShare, checkSession, select, loadStudios, ensureStudios, signOut }
})
