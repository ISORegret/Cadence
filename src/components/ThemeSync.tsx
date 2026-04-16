import { useEffect } from 'react'
import { useFinanceStore } from '../store/financeStore'

export function ThemeSync() {
  const theme = useFinanceStore((s) => s.preferences.theme)

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      if (theme === 'dark') {
        root.classList.add('dark')
        return
      }
      if (theme === 'light') {
        root.classList.remove('dark')
        return
      }
      root.classList.toggle(
        'dark',
        window.matchMedia('(prefers-color-scheme: dark)').matches,
      )
    }
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => apply()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return null
}
