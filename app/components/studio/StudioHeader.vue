<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { STUDIO_ROLE_LABELS, useStudioStore } from '~/stores/studio'

const store = useStudioStore()
const route = useRoute()
const router = useRouter()

const withStudio = computed(() => store.studio ? { studio: store.studio.id } : {})
const onAlbums = computed(() => route.path === '/studio')
const onMembers = computed(() => route.path.startsWith('/studio/members'))

function switchStudio(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  store.select(id)
  void router.replace({ query: { ...route.query, studio: id } })
}

const menuOpen = ref(false)
const signingOut = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
const menuButton = ref<HTMLButtonElement | null>(null)
const initial = computed(() => (store.user?.email?.trim()[0] ?? '?').toUpperCase())

function closeMenu(restoreFocus = false) {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (restoreFocus) menuButton.value?.focus()
}

function onDocumentPointer(event: PointerEvent) {
  if (menuRoot.value && !menuRoot.value.contains(event.target as Node)) closeMenu()
}

function onDocumentKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu(true)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
  document.addEventListener('keydown', onDocumentKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onDocumentKey)
})
watch(() => route.fullPath, () => closeMenu())

async function signOut() {
  signingOut.value = true
  try {
    await store.signOut()
    menuOpen.value = false
    await navigateTo('/studio')
  } finally {
    signingOut.value = false
  }
}

const focusRing = 'focus-ring'
const tabClass = 'focus-ring inline-flex min-h-11 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors sm:px-4'
const tabIdle = 'text-muted hover:bg-white/70 hover:text-ink'
const tabActive = 'bg-brand text-white shadow-sm'
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
    <div class="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:flex-nowrap lg:gap-x-6 lg:px-8">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <NuxtLink to="/" aria-label="Zeno Studio – Trang chủ" :class="['-ml-1 flex min-h-11 shrink-0 items-center rounded-lg px-1', focusRing]">
          <BrandLogo compact />
        </NuxtLink>

        <template v-if="store.studio">
          <span aria-hidden="true" class="hidden h-7 w-px shrink-0 bg-line sm:block" />
          <div class="min-w-0 text-sm">
            <select v-if="store.studios.length > 1" aria-label="Chọn studio" :value="store.studio.id" :class="['min-h-11 w-full max-w-56 truncate rounded-xl border border-line bg-white pl-3 pr-8 font-semibold', focusRing]" @change="switchStudio">
              <option v-for="item in store.studios" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
            <div v-else class="min-w-0 leading-tight">
              <p class="truncate font-semibold" :title="store.studio.name">{{ store.studio.name }}</p>
              <p class="truncate text-xs text-muted">{{ STUDIO_ROLE_LABELS[store.studio.role] }}</p>
            </div>
          </div>
        </template>
      </div>

      <nav aria-label="Điều hướng studio" class="order-last w-full lg:order-none lg:w-auto">
        <ul class="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-tint p-1 sm:flex sm:w-fit">
          <li>
            <NuxtLink :to="{ path: '/studio', query: withStudio }" :class="[tabClass, 'w-full', onAlbums ? tabActive : tabIdle]" :aria-current="onAlbums ? 'page' : undefined">Album</NuxtLink>
          </li>
          <li v-if="store.canManage">
            <NuxtLink :to="{ path: '/studio/members', query: withStudio }" :class="[tabClass, 'w-full', onMembers ? tabActive : tabIdle]" :aria-current="onMembers ? 'page' : undefined">Thành viên</NuxtLink>
          </li>
          <li>
            <NuxtLink to="/tools/file-filter" :class="[tabClass, 'w-full', tabIdle]">
              <span>Lọc file<span class="hidden sm:inline"> trên máy</span></span>
              <span aria-hidden="true" class="text-xs">↗</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div ref="menuRoot" class="relative shrink-0 lg:ml-auto">
        <button
          ref="menuButton"
          type="button"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          aria-controls="studio-account-menu"
          :class="['flex min-h-11 items-center gap-2 rounded-full border border-line bg-white p-1 pr-2 text-sm font-semibold hover:bg-tint md:pr-3', focusRing]"
          @click="menuOpen = !menuOpen"
        >
          <span aria-hidden="true" class="grid size-9 place-items-center rounded-full bg-brand-soft text-white">{{ initial }}</span>
          <span v-if="store.user" class="hidden max-w-44 truncate font-medium text-muted md:inline">{{ store.user.email }}</span>
          <span class="sr-only">Tài khoản</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" :class="['size-4 text-muted transition-transform motion-reduce:transition-none', menuOpen && 'rotate-180']">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clip-rule="evenodd" />
          </svg>
        </button>

        <div
          v-show="menuOpen"
          id="studio-account-menu"
          class="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-2 shadow-lg"
        >
          <div class="border-b border-line px-3 pb-3 pt-2">
            <p class="text-xs text-muted">Đăng nhập với</p>
            <p class="break-all text-sm font-semibold">{{ store.user?.email ?? '—' }}</p>
            <p v-if="store.studio" class="mt-1 truncate text-xs text-muted">{{ store.studio.name }} · {{ STUDIO_ROLE_LABELS[store.studio.role] }}</p>
          </div>
          <button
            type="button"
            :disabled="signingOut"
            :aria-busy="signingOut"
            :class="['mt-1 flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60', focusRing]"
            @click="signOut"
          >
            {{ signingOut ? 'Đang đăng xuất…' : 'Đăng xuất' }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
