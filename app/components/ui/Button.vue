<script setup lang="ts">
import { computed, resolveComponent } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: 'md' | 'sm'
  to?: RouteLocationRaw
  href?: string
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
  block?: boolean
}>(), { variant: 'primary', size: 'md', type: 'button' })

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'border border-line bg-white text-brand hover:bg-tint',
  outline: 'border border-brand bg-white text-brand hover:bg-tint',
  danger: 'border border-danger/30 bg-white text-danger hover:bg-danger-soft',
  ghost: 'text-brand hover:bg-tint',
}

const NuxtLink = resolveComponent('NuxtLink')
const inactive = computed(() => props.disabled || props.loading)
const inactiveLink = computed(() => inactive.value && !!(props.to || props.href))
const tag = computed(() => inactiveLink.value ? 'span' : props.to ? NuxtLink : props.href ? 'a' : 'button')
const classes = computed(() => [
  'focus-ring inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-full text-center font-semibold transition-colors disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  props.size === 'sm' ? 'px-4 text-sm' : 'px-5 text-sm sm:text-base',
  props.block ? 'w-full' : '',
  VARIANTS[props.variant],
])
</script>

<template>
  <component
    :is="tag"
    :to="inactiveLink ? undefined : to"
    :href="inactiveLink || to ? undefined : href"
    :type="to || href ? undefined : type"
    :disabled="to || href ? undefined : inactive"
    :role="inactiveLink ? 'link' : undefined"
    :aria-disabled="inactiveLink ? 'true' : undefined"
    :aria-busy="loading || undefined"
    :class="classes"
  >
    <span v-if="loading" aria-hidden="true" class="size-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
    <slot />
  </component>
</template>
