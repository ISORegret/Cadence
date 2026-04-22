import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Layout } from './components/Layout'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { BankImportPage } from './pages/BankImportPage'
import { BillsPage } from './pages/BillsPage'
import { CalendarPage } from './pages/CalendarPage'
import { DebtTool } from './pages/DebtTool'
import { SubscriptionsPage } from './pages/SubscriptionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { UpcomingPage } from './pages/UpcomingPage'
import { YearPage } from './pages/YearPage'

type AppRoute = {
  path: string
  render: () => ReactNode
}

/** Supports GitHub Pages subpath (`VITE_BASE=/repo/app/`) and Capacitor `./`. */
function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL
  if (raw === './' || raw === '.' || raw === '') return undefined
  const t = raw.endsWith('/') ? raw.slice(0, -1) : raw
  return t === '' ? undefined : t
}

const APP_ROUTES: AppRoute[] = [
  { path: 'calendar', render: () => <CalendarPage /> },
  { path: 'upcoming', render: () => <UpcomingPage /> },
  { path: 'year', render: () => <YearPage /> },
  { path: 'bills', render: () => <BillsPage /> },
  {
    path: 'settings',
    render: () => (
      <RouteErrorBoundary>
        <SettingsPage />
      </RouteErrorBoundary>
    ),
  },
  { path: 'debt', render: () => <DebtTool /> },
  { path: 'subscriptions', render: () => <SubscriptionsPage /> },
  { path: 'import', render: () => <BankImportPage /> },
]

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <div className="flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/upcoming" replace />} />
            {APP_ROUTES.map(({ path, render }) => (
              <Route key={path} path={path} element={render()} />
            ))}
            <Route path="*" element={<Navigate to="/upcoming" replace />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  )
}
