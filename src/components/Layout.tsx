import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { UndoToastProvider } from '../contexts/UndoToastContext'
import { payPeriodInclusiveLastDay } from '../lib/payPeriod'
import { GlobalExperience } from './GlobalExperience'
import { ThemeSync } from './ThemeSync'
import { useFinanceStore } from '../store/financeStore'
import { useCadenceHealth } from '../hooks/useCadenceHealth'
import { CashflowStandingBadge } from './CashflowStandingBadge'
import { HydrationRibbon } from './HydrationRibbon'
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { ScrollRestoration } from './ScrollRestoration'
import { PwaUpdateBanner } from './PwaUpdateBanner'
import type { ThemePreference } from '../types'

/** Monarch-style: filled pill on small screens; sidebar uses subtle tint on lg+ */
const pill = (active: boolean) =>
  [
    'inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold leading-none transition-all duration-200 sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-xs',
    active
      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/15 dark:bg-emerald-600 dark:shadow-emerald-950/40'
      : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
  ].join(' ')

const iconPill = (active: boolean) =>
  [
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 sm:h-9 sm:w-9 sm:rounded-xl',
    active
      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/15 ring-1 ring-emerald-500/30 dark:shadow-emerald-950/40 dark:ring-emerald-400/20'
      : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
  ].join(' ')

function sidebarNavClass(active: boolean) {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    active
      ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200',
  ].join(' ')
}

function IconCog({ className = 'size-[1.05rem]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.43 12.98c.04-.32.06-.66.06-.98s-.02-.66-.06-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0014 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
    </svg>
  )
}

function IconHome({ className = 'size-[1.05rem]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
    </svg>
  )
}

function IconLayoutGrid({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  )
}

function IconCalendar({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function IconClock({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconBarsYear({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M4 19V5M8 19V9M12 19v-6M16 19v-3M20 19v-8" />
    </svg>
  )
}

function IconReceipt({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function IconScale({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  )
}

function IconRepeat({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function IconArrowUpTray({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

function IconBell({ className = 'size-[1.15rem] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

const PRIMARY_NAV_ITEMS = [
  { to: '/', label: 'Summary', icon: IconLayoutGrid },
  { to: '/calendar', label: 'Calendar', icon: IconCalendar },
  { to: '/upcoming', label: 'Upcoming', icon: IconClock },
] as const

const TOOL_NAV_ITEMS = [
  { to: '/year', label: 'Year', icon: IconBarsYear },
  { to: '/bills', label: 'Bills', icon: IconReceipt },
  { to: '/debt', label: 'Debt', icon: IconScale },
  { to: '/subscriptions', label: 'Recurring audit', icon: IconRepeat },
  { to: '/import', label: 'Bank import', icon: IconArrowUpTray },
] as const

const ALERTS_NAV_ITEM = { to: '/settings#alerts', label: 'Alerts', icon: IconBell } as const

const ROUTE_TITLE_LOOKUP = new Map<string, string>([
  ...PRIMARY_NAV_ITEMS.map(({ to, label }) => [to, label] as const),
  ...TOOL_NAV_ITEMS.map(({ to, label }) => [to, label] as const),
  ['/settings', 'Settings'],
])

const TOOL_PATHS = new Set<string>(TOOL_NAV_ITEMS.map(({ to }) => to))
const TOOLS_MENU_ITEMS = [...TOOL_NAV_ITEMS, ALERTS_NAV_ITEM] as const

function isToolsSection(pathname: string, hash: string): boolean {
  return TOOL_PATHS.has(pathname) || (pathname === '/settings' && hash === '#alerts')
}

function isSettingsMain(pathname: string, hash: string): boolean {
  return pathname === '/settings' && hash !== '#alerts'
}

function isAlertsActive(pathname: string, hash: string): boolean {
  return pathname === '/settings' && hash === '#alerts'
}

const MENU_MIN_WIDTH = 200

function ThemeField({
  theme,
  onThemeChange,
  labelClassName,
}: {
  theme: ThemePreference
  onThemeChange: (theme: ThemePreference) => void
  labelClassName: string
}) {
  return (
    <label className={labelClassName}>
      Theme
      <select
        value={theme}
        onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
        className="select-field w-full min-h-9 !py-1.5 text-xs"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}

function MobileRouteContext() {
  const { pathname } = useLocation()
  const { period, paySettings } = useCadenceHealth()
  if (pathname === '/') return null
  const title =
    ROUTE_TITLE_LOOKUP.get(pathname) ??
    (pathname.startsWith('/settings') ? 'Settings' : pathname.replace(/^\//, ''))
  let sub: string | null = null
  if (paySettings && period && pathname !== '/settings') {
    sub = `${format(period.intervalStart, 'MMM d')} – ${format(payPeriodInclusiveLastDay(period), 'MMM d')}`
  }
  return (
    <p className="mb-1.5 truncate px-1 text-center text-[11px] leading-tight text-slate-500 dark:text-slate-500 lg:hidden">
      <span className="font-semibold text-slate-700 dark:text-slate-300">{title}</span>
      {sub ? (
        <>
          {' '}
          <span className="text-slate-400 dark:text-slate-500">·</span> pay period {sub}
        </>
      ) : null}
    </p>
  )
}

export function Layout() {
  const location = useLocation()
  const { pathname, hash } = location
  const theme = useFinanceStore((s) => s.preferences.theme)
  const setPreferences = useFinanceStore((s) => s.setPreferences)
  const { standing } = useCadenceHealth()

  const [toolsOpen, setToolsOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const toolsButtonRef = useRef<HTMLButtonElement>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)

  const updateMenuPos = useCallback(() => {
    const btn = toolsButtonRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    let left = r.left
    const maxLeft = window.innerWidth - MENU_MIN_WIDTH - 8
    if (left > maxLeft) left = Math.max(8, maxLeft)
    setMenuPos({ top: r.bottom + 4, left })
  }, [])

  useLayoutEffect(() => {
    if (!toolsOpen) {
      setMenuPos(null)
      return
    }
    updateMenuPos()
    const ro = new ResizeObserver(() => updateMenuPos())
    ro.observe(document.documentElement)
    window.addEventListener('resize', updateMenuPos)
    window.addEventListener('scroll', updateMenuPos, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateMenuPos)
      window.removeEventListener('scroll', updateMenuPos, true)
    }
  }, [toolsOpen, updateMenuPos])

  useEffect(() => {
    if (!toolsOpen) return
    const close = () => setToolsOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (toolsButtonRef.current?.contains(t)) return
      if (toolsMenuRef.current?.contains(t)) return
      close()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
    }
  }, [toolsOpen])

  useEffect(() => {
    const id = window.setTimeout(() => setToolsOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [location.pathname, location.hash])

  const toolsActive = isToolsSection(pathname, hash)
  const settingsActive = isSettingsMain(pathname, hash)
  const summaryActive = pathname === '/'

  const toolsMenu =
    toolsOpen && menuPos
      ? createPortal(
          <div
            ref={toolsMenuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 200,
            }}
            className="max-h-[min(70vh,24rem)] min-w-[12.5rem] overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white py-1 shadow-xl shadow-slate-900/25 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/60"
          >
            {TOOLS_MENU_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                role="menuitem"
                className="block px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                onClick={() => setToolsOpen(false)}
              >
                {label}
              </NavLink>
            ))}
            <div
              className="border-t border-slate-200/80 px-3 py-2 dark:border-white/10"
              role="none"
            >
              <ThemeField
                theme={theme}
                onThemeChange={(nextTheme) => setPreferences({ theme: nextTheme })}
                labelClassName="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400"
              />
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <UndoToastProvider>
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[#f4f6f8] dark:bg-zinc-950 lg:flex-row">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[#f4f6f8] dark:bg-zinc-950"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 -z-10 lg:left-56" aria-hidden>
        <div className="absolute -left-32 top-0 h-[20rem] w-[20rem] rounded-full bg-emerald-400/10 blur-[90px] dark:bg-emerald-600/6" />
        <div className="absolute -right-16 top-24 h-[16rem] w-[16rem] rounded-full bg-slate-300/20 blur-[80px] dark:bg-zinc-700/12" />
      </div>

      <ThemeSync />
      <GlobalExperience />
      <HydrationRibbon />
      <KeyboardShortcuts />
      <ScrollRestoration />
      <PwaUpdateBanner />

      {/* Monarch-style desktop sidebar */}
      <aside className="relative z-50 hidden w-56 shrink-0 flex-col border-r border-slate-200/90 bg-white pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-white/[0.08] dark:bg-zinc-900 lg:flex">
        <div className="flex flex-col gap-2 px-3 pb-2">
          <Link
            to="/"
            className="rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          >
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-500">
              Cadence
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-slate-900 dark:text-slate-100">
              Budget
            </span>
          </Link>
          <CashflowStandingBadge standing={standing} className="w-full justify-center text-center" />
          <p className="text-center text-[0.65rem] leading-snug text-slate-400 dark:text-slate-500">
            Press <kbd className="rounded border border-slate-300 px-0.5 font-mono dark:border-slate-600">?</kbd> for shortcuts
          </p>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3" aria-label="Main navigation">
          {PRIMARY_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={() => sidebarNavClass(pathname === to)}
            >
              <Icon />
              {label}
            </NavLink>
          ))}

          <p className="mb-0.5 mt-4 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Planning
          </p>
          {TOOL_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={() => sidebarNavClass(pathname === to)}>
              <Icon />
              {label}
            </NavLink>
          ))}

          <div className="flex-1 min-h-2" aria-hidden />

          <NavLink
            to="/settings#alerts"
            className={() => sidebarNavClass(isAlertsActive(pathname, hash))}
          >
            <IconBell />
            Alerts
          </NavLink>
          <NavLink to="/settings" className={() => sidebarNavClass(settingsActive)}>
            <IconCog className="size-[1.15rem] shrink-0" />
            Settings
          </NavLink>
        </nav>

        <div className="border-t border-slate-200/80 px-3 py-3 dark:border-white/[0.08]">
          <ThemeField
            theme={theme}
            onThemeChange={(nextTheme) => setPreferences({ theme: nextTheme })}
            labelClassName="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400"
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-50 isolate print:hidden shrink-0 border-b border-slate-200/80 bg-white px-3 pb-2 pt-[max(0.35rem,env(safe-area-inset-top))] shadow-sm shadow-slate-900/[0.03] dark:border-white/[0.08] dark:bg-zinc-900 lg:hidden sm:px-4 sm:pb-2.5 sm:pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="mx-auto w-full max-w-3xl">
            <h1 className="sr-only">Cadence budget</h1>
            <MobileRouteContext />
            <nav
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-100/95 px-1 py-0.5 dark:bg-black/25 sm:rounded-xl sm:px-1.5 sm:py-1"
              aria-label="Main navigation"
            >
              <div className="inline-flex min-h-0 min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden">
                {PRIMARY_NAV_ITEMS.map(({ to, label }) => (
                  <NavLink key={to} to={to} end={to === '/'} className={() => pill(pathname === to)}>
                    {label}
                  </NavLink>
                ))}
                <button
                  ref={toolsButtonRef}
                  type="button"
                  className={pill(toolsActive)}
                  aria-expanded={toolsOpen}
                  aria-haspopup="menu"
                  onClick={() => setToolsOpen((o) => !o)}
                >
                  Tools
                  <span className="ml-0.5 text-[0.65em] opacity-80" aria-hidden>
                    {toolsOpen ? '▾' : '▸'}
                  </span>
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <NavLink
                  to="/settings"
                  className={() => iconPill(settingsActive)}
                  aria-label="Settings"
                  title="Settings"
                >
                  <IconCog />
                </NavLink>
                <Link
                  to="/"
                  className={iconPill(summaryActive)}
                  aria-label="Home — Summary"
                  title="Home (Summary)"
                >
                  <IconHome />
                </Link>
              </div>
            </nav>
            <div className="mt-2 flex flex-col items-center gap-1 px-1">
              <CashflowStandingBadge standing={standing} />
              <p className="text-center text-[0.65rem] text-slate-400 dark:text-slate-500">
                <kbd className="rounded border border-slate-300 px-0.5 font-mono dark:border-slate-600">?</kbd> shortcuts
              </p>
            </div>
          </div>
        </header>

        {toolsMenu}

        <a
          href="#app-main"
          className="fixed left-4 top-[max(0.5rem,env(safe-area-inset-top))] z-[600] -translate-y-[220%] rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-800 shadow-lg ring-2 ring-emerald-500 transition-transform focus:translate-y-0 focus:outline-none dark:bg-zinc-900 dark:text-emerald-200 print:hidden"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('app-main')?.focus()
          }}
        >
          Skip to content
        </a>
        <main
          id="app-main"
          tabIndex={-1}
          className="relative z-0 mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-y-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 outline-none sm:px-4 sm:pb-6 sm:pt-3 lg:max-w-5xl lg:px-8 lg:pb-8 lg:pt-6 print:max-w-none print:h-auto print:overflow-visible print:pb-4"
        >
          <Outlet />
        </main>
      </div>
    </div>
    </UndoToastProvider>
  )
}
