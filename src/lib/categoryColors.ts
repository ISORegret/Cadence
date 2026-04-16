/** Stable Tailwind chip classes per category name (calendar + lists). */
const PALETTE = [
  'border border-green-500/35 bg-green-500/18 text-green-950 dark:border-green-400/30 dark:bg-green-400/12 dark:text-green-50',
  'border border-teal-500/35 bg-teal-500/18 text-teal-950 dark:border-teal-400/30 dark:bg-teal-400/12 dark:text-teal-50',
  'border border-sky-500/35 bg-sky-500/18 text-sky-950 dark:border-sky-400/30 dark:bg-sky-400/12 dark:text-sky-50',
  'border border-violet-500/35 bg-violet-500/18 text-violet-950 dark:border-violet-400/30 dark:bg-violet-400/12 dark:text-violet-50',
  'border border-fuchsia-500/35 bg-fuchsia-500/18 text-fuchsia-950 dark:border-fuchsia-400/30 dark:bg-fuchsia-400/12 dark:text-fuchsia-50',
  'border border-rose-500/35 bg-rose-500/18 text-rose-950 dark:border-rose-400/30 dark:bg-rose-400/12 dark:text-rose-50',
  'border border-amber-500/40 bg-amber-500/20 text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/14 dark:text-amber-50',
  'border border-lime-500/40 bg-lime-500/18 text-lime-950 dark:border-lime-400/35 dark:bg-lime-400/12 dark:text-lime-50',
  'border border-emerald-500/35 bg-emerald-500/18 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-400/12 dark:text-emerald-50',
  'border border-indigo-500/35 bg-indigo-500/18 text-indigo-950 dark:border-indigo-400/30 dark:bg-indigo-400/12 dark:text-indigo-50',
  'border border-orange-500/40 bg-orange-500/18 text-orange-950 dark:border-orange-400/35 dark:bg-orange-400/12 dark:text-orange-50',
  'border border-slate-400/50 bg-slate-400/15 text-slate-900 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-100',
] as const

function paletteIndex(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (Math.imul(31, h) + label.charCodeAt(i)) | 0
  }
  return Math.abs(h) % PALETTE.length
}

export function categoryChipClasses(category: string | undefined): string {
  const key = (category || '').trim() || 'Uncategorized'
  return PALETTE[paletteIndex(key)]
}

/** Small dot for list rows (same index as chip). */
export function categoryDotClass(category: string | undefined): string {
  const key = (category || '').trim() || 'Uncategorized'
  const dots = [
    'bg-green-500',
    'bg-teal-500',
    'bg-sky-500',
    'bg-violet-500',
    'bg-fuchsia-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-lime-500',
    'bg-emerald-500',
    'bg-indigo-500',
    'bg-orange-500',
    'bg-slate-400',
  ] as const
  return dots[paletteIndex(key)]
}

/** Solid fill for SVG / canvas (same palette order as chips and dots). */
const FILL_HEX = [
  '#22c55e',
  '#14b8a8',
  '#0ea5e9',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#6366f1',
  '#f97316',
  '#94a3b8',
] as const

export function categoryFillHex(category: string | undefined): string {
  const key = (category || '').trim() || 'Uncategorized'
  return FILL_HEX[paletteIndex(key)]
}
