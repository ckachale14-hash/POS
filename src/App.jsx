import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { db, seedIfEmpty, getSetting } from './lib/db'
import { INITIAL_INVENTORY, INITIAL_USERS } from './data/initial-inventory'
import { SessionProvider } from './context/SessionContext'
import { startAutoSync, stopAutoSync } from './lib/sync'
import { loadAndApplyTheme } from './lib/theme'
import Login from './pages/Login.jsx'
import POS from './pages/POS.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import SalesHistory from './pages/SalesHistory.jsx'
import Customers from './pages/Customers.jsx'
import ChangeCredit from './pages/ChangeCredit.jsx'
import Sync from './pages/Sync.jsx'
import Settings from './pages/Settings.jsx'
import Receipts from './pages/Receipts.jsx'
import Suppliers from './pages/Suppliers.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Expenses from './pages/Expenses.jsx'
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
  receipt_char_w:                1,
  receipt_char_h:                1,
  receipt_feed_lines:            1,
  receipt_bold_headers:          true,
  receipt_bold_totals:           true,
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
  theme_accent:                  'red',
  theme_accent_hex:              '#ff3830',
  theme_background:              'cloud',
  theme_sidebar:                 'dark',
}

// ── Lock screen ───────────────────────────────────────────────────────────
function LockScreen({ user, onUnlock }) {
  const [pin, setPin]       = useState('')
  const [err, setErr]       = useState(false)
  const [shake, setShake]   = useState(false)

  const press = (d) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      if (next === String(user.pin)) {
        onUnlock()
      } else {
        setErr(true)
        setShake(true)
        setTimeout(() => { setPin(''); setErr(false); setShake(false) }, 900)
      }
    }
  }

  const KEYS = [1,2,3,4,5,6,7,8,9,null,0,'⌫']
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--surface-0)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24, padding: 32,
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,56,48,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 22 }}>🔒</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>Session locked</div>
        <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 4 }}>Enter your PIN to continue as <strong>{user.name}</strong></div>
      </div>

      <div style={{ display: 'flex', gap: 10, animation: shake ? 'shake 0.4s ease' : 'none' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: pin.length > i ? (err ? '#ef4444' : 'var(--brand-600)') : 'var(--surface-3)',
            transition: 'background 150ms',
          }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%', maxWidth: 260 }}>
        {KEYS.map((k, i) => k === null ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            onClick={() => k === '⌫' ? setPin(p => p.slice(0,-1)) : press(String(k))}
            style={{
              height: 60, borderRadius: 16, fontSize: k === '⌫' ? 18 : 22, fontWeight: 700,
              background: 'var(--surface-1)', border: '1px solid var(--surface-border)',
              color: 'var(--ink-primary)', cursor: 'pointer',
              transition: 'transform 80ms, background 80ms',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onTouchStart={e => e.currentTarget.style.transform = 'scale(0.94)'}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
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
  const [pageHistory, setPageHistory] = useState([])
  const [showWizard, setShowWizard] = useState(false)
  const [locked, setLocked]         = useState(false)
  const [lockMins, setLockMins]     = useState(30)
  const idleTimer = useRef(null)
  const appStartTime = useRef(new Date().toISOString())

  useEffect(() => {
    ;(async () => {
      await seedIfEmpty(INITIAL_INVENTORY, INITIAL_USERS, DEFAULT_SETTINGS)

      // Apply the saved appearance theme (accent + background) before first paint
      await loadAndApplyTheme()

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

      getSetting('session_timeout_mins', 30).then(v => setLockMins(Number(v) || 0))

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

  // Force-lock polling — check every 30s if an admin forced a lock from another device
  useEffect(() => {
    if (!user) return
    const check = async () => {
      const forcedAt = await getSetting('force_lock_at', '')
      if (forcedAt && forcedAt > appStartTime.current) {
        appStartTime.current = new Date().toISOString() // reset so we don't re-lock after unlock
        setLocked(true)
      }
    }
    check()
    const poll = setInterval(check, 30_000)
    return () => clearInterval(poll)
  }, [user])

  // Idle timer — lock when user is inactive for lockMins
  useEffect(() => {
    if (!user || lockMins <= 0) return
    const reset = () => {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setLocked(true), lockMins * 60 * 1000)
    }
    const events = ['click', 'keydown', 'touchstart', 'mousemove']
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(idleTimer.current)
      events.forEach(ev => window.removeEventListener(ev, reset))
    }
  }, [user, lockMins])

  // ── Register native back-button handler ─────────────────────────────────
  // The Android back key calls window.__ps_back() via evaluateJavascript.
  // When logged in: pop the navigation history (never close the Activity).
  // When on login screen: do nothing (user must use the Logout button or
  // the system recents to leave).
  useEffect(() => {
    if (!user) {
      window.__ps_back = null
      return
    }
    window.__ps_back = () => {
      // Let open modals (dialogs, drawers) intercept the back button first
      if (typeof window.__ps_back_overlay === 'function') {
        window.__ps_back_overlay()
        return
      }
      // Functional update so this closure never goes stale
      setPageHistory(prev => {
        if (prev.length === 0) return prev // at root page — stay, don't close
        const target = prev[prev.length - 1]
        setPage(target)
        return prev.slice(0, -1)
      })
    }
    return () => { window.__ps_back = null }
  }, [user]) // re-registers whenever login state changes

  if (!ready) return <Loader />

  // Navigate with history tracking so the back button can undo each jump
  const navigate = (p) => {
    if (p === page) return
    setPageHistory(prev => [...prev, page])
    setPage(p)
  }

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
    setPageHistory([]) // clear stack so back can't resurface the last page
  }
  const handleWizardComplete = () => {
    setShowWizard(false)
    // Refresh to pick up new data
    window.location.reload()
  }

  return (
    <>
      {/* Lock screen — sits above everything including the wizard */}
      {locked && user && <LockScreen user={user} onUnlock={() => setLocked(false)} />}

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
            {page === 'receipts'     && <Receipts     user={user} />}
            {page === 'customers'    && <Customers    user={user} navigate={navigate} />}
            {page === 'changeCredit' && <ChangeCredit user={user} />}
            {page === 'suppliers'    && <Suppliers      user={user} />}
            {page === 'purchasing'   && <PurchaseOrders user={user} />}
            {page === 'expenses'     && <Expenses       user={user} />}
            {page === 'sync'         && <Sync         user={user} online={online} />}
            {page === 'settings'     && <Settings     user={user} />}
          </AppShell>
        </SessionProvider>
      )}
    </>
  )
}
