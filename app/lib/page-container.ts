export type PageWidth = '6xl' | '7xl'

export const pageContainerClass: Record<PageWidth, string> = {
  '6xl': 'max-w-6xl px-4 sm:px-6 lg:px-8',
  '7xl': 'max-w-7xl px-4 sm:px-8',
}
