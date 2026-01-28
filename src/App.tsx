import { NavLink, Navigate, Route, Routes } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { useAnalytics } from '@/lib/analytics/context'
import { ImportPage } from '@/pages/ImportPage'
import { HomePage } from '@/pages/HomePage'
import { ReferralDetailPage } from '@/pages/ReferralDetailPage'
import { WalletLookupPage } from '@/pages/WalletLookupPage'
import { ClientsPage } from '@/pages/ClientsPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { ReferralCodesPage } from '@/pages/ReferralCodesPage'

function RequireIndex({ children }: { children: React.ReactNode }) {
  const { index } = useAnalytics()
  if (!index) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function App() {
  const { index } = useAnalytics()

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Referral Analytics</h1>
            <p className="text-xs text-muted-foreground">
              Decision-first dashboard for referral quality, conversion, and revenue.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={index ? 'default' : 'secondary'}>
              {index ? 'Index ready' : 'Waiting for import'}
            </Badge>
          </div>
        </div>
        <nav className="border-t">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
              }
            >
              Import
            </NavLink>
            <NavLink
              to="/home"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
              }
            >
              Decision board
            </NavLink>
            <NavLink
              to="/groups"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
              }
            >
              Group analysis
            </NavLink>
            <NavLink
              to="/referral"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
              }
            >
              Referral codes
            </NavLink>
            <NavLink
              to="/clients"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
              }
            >
              Clients
            </NavLink>
            <NavLink
              to="/lookup"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
              }
            >
              Wallet lookup
            </NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Routes>
          <Route path="/" element={<ImportPage />} />
          <Route
            path="/home"
            element={
              <RequireIndex>
                <HomePage />
              </RequireIndex>
            }
          />
          <Route
            path="/referral-detail/:code"
            element={
              <RequireIndex>
                <ReferralDetailPage />
              </RequireIndex>
            }
          />
          <Route
            path="/groups"
            element={
              <RequireIndex>
                <GroupsPage />
              </RequireIndex>
            }
          />
          <Route
            path="/referral"
            element={
              <RequireIndex>
                <ReferralCodesPage />
              </RequireIndex>
            }
          />
          <Route
            path="/clients"
            element={
              <RequireIndex>
                <ClientsPage />
              </RequireIndex>
            }
          />
          <Route
            path="/lookup"
            element={
              <RequireIndex>
                <WalletLookupPage />
              </RequireIndex>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
