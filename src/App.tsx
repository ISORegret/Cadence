import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

/** Supports GitHub Pages subpath (`VITE_BASE=/repo/app/`) and Capacitor `./`. */
function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL
  if (raw === './' || raw === '.' || raw === '') return undefined
  const t = raw.endsWith('/') ? raw.slice(0, -1) : raw
  return t === '' ? undefined : t
}
import { BillsPage } from './pages/BillsPage'
import { CalendarPage } from './pages/CalendarPage'
import { DebtTool } from './pages/DebtTool'
import { SettingsPage } from './pages/SettingsPage'
import { Summary } from './pages/Summary'
import { UpcomingPage } from './pages/UpcomingPage'
import { YearPage } from './pages/YearPage'

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <div className="flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Summary />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="upcoming" element={<UpcomingPage />} />
            <Route path="year" element={<YearPage />} />
            <Route path="bills" element={<BillsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="debt" element={<DebtTool />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  )
}
