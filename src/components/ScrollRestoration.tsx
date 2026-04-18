import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const keyFor = (pathname: string) => `cadence:v1:scroll:${pathname}`

/** Remember vertical scroll per route in sessionStorage (browser back/forward friendly). */
export function ScrollRestoration() {
  const pathname = useLocation().pathname

  useEffect(() => {
    const main = document.getElementById('app-main')
    if (!main) return

    const raw = sessionStorage.getItem(keyFor(pathname))
    if (raw !== null) {
      const y = Number(raw)
      if (!Number.isNaN(y) && y >= 0) {
        requestAnimationFrame(() => {
          main.scrollTop = y
        })
      }
    } else {
      main.scrollTop = 0
    }
  }, [pathname])

  useEffect(() => {
    const main = document.getElementById('app-main')
    if (!main) return

    let debounceTimer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        sessionStorage.setItem(keyFor(pathname), String(main.scrollTop))
      }, 120)
    }

    main.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(debounceTimer)
      sessionStorage.setItem(keyFor(pathname), String(main.scrollTop))
      main.removeEventListener('scroll', onScroll)
    }
  }, [pathname])

  return null
}
