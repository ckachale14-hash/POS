import React, { useState, useEffect } from 'react'
import { db, seedIfEmpty, getSetting } from './lib/db'
import { INITIAL_INVENTORY, INITIAL_USERS } from './data/initial-inventory'
import { SessionProvider } from './context/SessionContext'
import { startAutoSync, stopAutoSync } from './lib/sync'
import Login from './pages/Login.jsx'
import POS from './pages/POS.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import SalesHistory from './pages/SalesHistory.jsx'
import Customers from './pages/Customers.jsx'
import ChangeCredit from './pages/ChangeCredit.jsx'
import Sync from './pages/Sync.jsx'
import Settings from './pages/Settings.jsx'
import AppShell from './components/AppShell.jsx'
import SetupWizard from './components/SetupWizard.jsx'

const DEFAULT_SETTINGS = {
  vat_enabled:                   false,
  vat_rate:                      0.15,
  printer_type:                  'sunmi',
  paper_width:                   '58mm',
  default_quote_validity_days:   7,
  shop_name:                     'PortionSpot Motors',
  shop_tagline:                  'Wholesale Motor Spares & Accessories',
  shop_address:                  '35 Kaguvi Street, Shop Letter V, Harare',
  shop_phones:                   '0778 241 070,0718 177 836,0775 625 113',
  shop_logo:                     '',
  shop_email:                    '',
  shop_website:                  '',
  discount_threshold:            5,
  low_stock_threshold:           5,
  rawbt_server_address:          '127.0.0.1:9100',
  auto_convert_stock:            true,
  margin_formula:                'gross',
  float_cart_pages:              ['pos','dashboard','inventory','sales','customers','changeCredit','sync','settings'],
  float_cart_action:             'navigate',
  receipt_same_template:         true,
  receipt_show_logo:             true,
  receipt_show_cashier:          true,
  receipt_show_vat:              true,
  receipt_show_payment:          true,
  receipt_show_change:           true,
  receipt_show_email:            true,
  receipt_show_website:          true,
  receipt_show_footer:           true,
  receipt_footer_text:           'Thank you for shopping with us!\nGoods sold are not returnable.',
  whatsapp_show_logo:            false,
  whatsapp_show_cashier:         true,
}

function Loader() {
  return (
    <div className="h-full flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-14 h-14 border-[3px] border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
        <p className="text-gray-500 text-sm font-medium">Starting PortionSpot POS…</p>
        <p className="text-gray-300 text-xs mt-1">Loading inventory & settings</p>
      </div>
    </div>
  )
}

// ── Session storage keys ──────────────────────────────────────────────────
// localStorage  keeps the user across refreshes (same tab or new tab).
// sessionStorage 'pos_session_alive' is set on login and cleared when the
// browser/WebView is fully closed (RawBT closed = new WebView session).
// On load: both must be present to auto-restore login.
// On logout or close: sessionStorage is gone → login screen on next open.
const STORAGE_USER    = 'pos_user'
const STORAGE_SESSION = 'pos_session_alive'

export default function App() {
  const [ready, setReady]           = useState(false)
  const [user, setUser]             = useState(null)
  const [online, setOnline]         = useState(navigator.onLine)
  const [page, setPage]             = useState('pos')
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    ;(async () => {
      await seedIfEmpty(INITIAL_INVENTORY, INITIAL_USERS, DEFAULT_SETTINGS)

      // Restore session: only if the current WebView/browser session is still
      // alive (sessionStorage flag) AND a saved user exists in localStorage.
      try {
        const alive   = sessionStorage.getItem(STORAGE_SESSION)
        const saved   = localStorage.getItem(STORAGE_USER)
        if (alive && saved) {
          const restored = JSON.parse(saved)
          if (restored?.id) setUser(restored)
        }
      } catch {}

      // Show setup wizard on first launch
      const setupDone = await getSetting('setup_complete', false)
      if (!setupDone) setShowWizard(true)

      setReady(true)
    })()

    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Start auto-sync (Option B: every 2 minutes)
    startAutoSync()

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      stopAutoSync()
    }
  }, [])

  if (!ready) return <Loader />

  const navigate = (p) => setPage(p)

  // Save user to localStorage + mark session alive so login persists across
  // page refreshes, but is cleared when RawBT (WebView) is fully closed.
  const handleLogin = (u) => {
    try {
      localStorage.setItem(STORAGE_USER, JSON.stringify(u))
      sessionStorage.setItem(STORAGE_SESSION, '1')
    } catch {}
    setUser(u)
  }

  const handleLogout = () => {
    try {
      localStorage.removeItem(STORAGE_USER)
      sessionStorage.removeItem(STORAGE_SESSION)
    } catch {}
    setUser(null)
    setPage('pos')
  }
  const handleWizardComplete = () => {
    setShowWizard(false)
    // Refresh to pick up new data
    window.location.reload()
  }

  return (
    <>
      {/* Setup wizard — shown on first launch, sits on top of everything */}
      {showWizard && (
        <SetupWizard online={online} onComplete={handleWizardComplete} />
      )}

      {!user ? (
        <Login onLogin={handleLogin} online={online} />
      ) : (
        <SessionProvider>
          <AppShell user={user} online={online} page={page} navigate={navigate} onLogout={handleLogout}>
            {page === 'pos'          && <POS          user={user} online={online} navigate={navigate} />}
            {page === 'dashboard'    && <Dashboard    user={user} navigate={navigate} />}
            {page === 'inventory'    && <Inventory    user={user} />}
            {page === 'sales'        && <SalesHistory user={user} />}
            {page === 'customers'    && <Customers    user={user} navigate={navigate} />}
            {page === 'changeCredit' && <ChangeCredit user={user} />}
            {page === 'sync'         && <Sync         user={user} online={online} />}
            {page === 'settings'     && <Settings     user={user} />}
          </AppShell>
        </SessionProvider>
      )}
    </>
  )
}
