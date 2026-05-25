import React, { useState, useEffect } from 'react'
import {
  ShoppingCart, LayoutDashboard, Package, ReceiptText,
  Users, Settings, LogOut, Wifi, WifiOff, Menu, X, ChevronRight,
  RefreshCw, CreditCard, MoreHorizontal, ChevronUp, Truck, Receipt, ClipboardList, History
} from 'lucide-react'
import { useSession } from '../context/SessionContext'
import { getSetting } from '../lib/db'
import SessionHUD from './SessionHUD'

const NAV = [
  { id: 'pos',          icon: ShoppingCart,    label: 'Point of Sale',   short: 'POS',       roles: ['admin','manager','cashier'] },
  { id: 'dashboard',    icon: LayoutDashboard, label: 'Dashboard',       short: 'Dashboard', roles: ['admin','manager','cashier'] },
  { id: 'inventory',    icon: Package,         label: 'Inventory',       short: 'Inventory', roles: ['admin','manager','cashier'] },
  { id: 'sales',        icon: ReceiptText,     label: 'Sales & Reports', short: 'Sales',     roles: ['admin','manager','cashier'] },
  { id: 'receipts',     icon: History,         label: 'Receipts',        short: 'Receipts',  roles: ['admin','manager','cashier'] },
  { id: 'customers',    icon: Users,           label: 'Customers',       short: 'Customers', roles: ['admin','manager','cashier'] },
  { id: 'changeCredit', icon: CreditCard,      label: 'Change & Credit', short: 'Credit',    roles: ['admin','manager','cashier'] },
  { id: 'suppliers',    icon: Truck,           label: 'Suppliers',       short: 'Suppliers', roles: ['admin','manager'] },
  { id: 'purchasing',   icon: ClipboardList,   label: 'Purchase Orders', short: 'Orders',    roles: ['admin','manager'] },
  { id: 'expenses',     icon: Receipt,         label: 'Expenses',        short: 'Expenses',  roles: ['admin','manager'] },
  { id: 'sync',         icon: RefreshCw,       label: 'Sync',            short: 'Sync',      roles: ['admin','manager'] },
  { id: 'settings',     icon: Settings,        label: 'Settings',        short: 'Settings',  roles: ['admin'] },
]

// Pinned bar: POS, Sales, Sync, Inventory — always show Sync for admins/managers
const PINNED_IDS = ['pos', 'sales', 'sync', 'inventory']

function MobileBottomNav({ allowed, page, navigate }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { cartCount, heldSales } = useSession()

  const pinned   = PINNED_IDS.map(id => allowed.find(n => n.id === id)).filter(Boolean)
  const overflow = allowed.filter(n => !PINNED_IDS.includes(n.id))
  const overflowActive = overflow.some(n => n.id === page)

  const handleNav = (id) => { navigate(id); setMoreOpen(false) }

  return (
    <>
      <nav
        className="md:hidden flex shrink-0"
        style={{
          background: 'var(--surface-1)',
          borderTop: '1px solid var(--surface-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {pinned.map(item => {
          const Icon = item.icon
          const active = page === item.id
          const hasBadge = item.id === 'pos' && (cartCount > 0 || heldSales.length > 0)
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-all duration-150 relative"
              style={{ color: active ? 'var(--brand-500)' : 'var(--ink-tertiary)' }}
            >
              {active && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 24, height: 2.5, background: 'var(--brand-500)',
                  borderRadius: '0 0 4px 4px',
                }} />
              )}
              <span style={{ position: 'relative' }}>
                <Icon size={18} />
                {hasBadge && (
                  <span style={{
                    position: 'absolute', top: -4, right: -7,
                    minWidth: 14, height: 14, borderRadius: 7,
                    background: '#f59e0b', color: '#1a1a1a',
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                  }}>
                    {cartCount + heldSales.length}
                  </span>
                )}
              </span>
              <span>{item.short}</span>
            </button>
          )
        })}

        {overflow.length > 0 && (
          <button
            onClick={() => setMoreOpen(o => !o)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-all duration-150 relative"
            style={{ color: overflowActive || moreOpen ? 'var(--brand-500)' : 'var(--ink-tertiary)' }}
          >
            {(overflowActive || moreOpen) && (
              <span style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 24, height: 2.5, background: 'var(--brand-500)',
                borderRadius: '0 0 4px 4px',
              }} />
            )}
            {moreOpen ? <ChevronUp size={18} /> : <MoreHorizontal size={18} />}
            <span>More</span>
          </button>
        )}
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="md:hidden fixed left-0 right-0 z-50"
            style={{
              bottom: `calc(env(safe-area-inset-bottom) + 56px)`,
              background: 'var(--surface-1)',
              borderRadius: '20px 20px 0 0',
              border: '1px solid var(--surface-border)',
              borderBottom: 'none',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.14)',
              padding: '10px 16px 12px',
            }}
          >
            {/* Handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              background: 'var(--surface-4)',
              margin: '0 auto 14px',
            }} />
            <p style={{
              fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
            }}>
              More pages
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {overflow.map(item => {
                const Icon = item.icon
                const active = page === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px',
                      borderRadius: 12,
                      background: active ? 'rgba(220,38,38,0.08)' : 'transparent',
                      color: active ? 'var(--brand-600)' : 'var(--ink-primary)',
                      fontWeight: active ? 700 : 500,
                      fontSize: 14,
                      border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                      transition: 'background 150ms',
                    }}
                  >
                    <Icon size={17} style={{ color: active ? 'var(--brand-500)' : 'var(--ink-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {active && <ChevronRight size={14} style={{ color: 'var(--brand-400)', opacity: 0.6 }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default function AppShell({ user, online, page, navigate, onLogout, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [logo, setLogo]             = useState(null)
  const [shopName, setShopName]     = useState('PortionSpot')
  const { cartCount, heldSales, floatPages } = useSession()

  const allowed = NAV.filter(n => n.roles.includes(user?.role))

  useEffect(() => {
    getSetting('shop_logo').then(l => l && setLogo(l))
    getSetting('shop_name').then(n => n && setShopName(n))
  }, [page])

  const showHUD = floatPages.includes(page)

  const NavItem = ({ item }) => {
    const Icon = item.icon
    const active = page === item.id
    const hasBadge = item.id === 'pos' && (cartCount > 0 || heldSales.length > 0)
    return (
      <button
        onClick={() => { navigate(item.id); setDrawerOpen(false) }}
        className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
          active ? 'nav-item-active' : 'nav-item-inactive'
        }`}
      >
        <Icon size={17} className="shrink-0" />
        <span className="truncate flex-1 text-left">{item.label}</span>
        {hasBadge && (
          <span className="w-5 h-5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-black flex items-center justify-center shrink-0">
            {cartCount + heldSales.length}
          </span>
        )}
        {active && !hasBadge && <ChevronRight size={13} className="ml-auto opacity-50 shrink-0" />}
      </button>
    )
  }

  const LogoMark = ({ size = 'md' }) => {
    const cls = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl'
    if (logo) {
      return (
        <div className={`${cls} overflow-hidden shrink-0 flex items-center justify-center`} style={{ background: 'var(--surface-3)' }}>
          <img src={logo} alt="logo" className="w-full h-full object-contain" />
        </div>
      )
    }
    return (
      <div className={`${cls} flex items-center justify-center shrink-0`} style={{ background: 'var(--brand-600)', boxShadow: 'var(--shadow-red)' }}>
        <span className="text-white font-black text-[10px] leading-none tracking-tight">PSM</span>
      </div>
    )
  }

  const SidebarContent = () => (
    <>
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--surface-border)' }}>
        <div className="flex items-center gap-2.5">
          <LogoMark size="md" />
          <div>
            {/* The sidebar background is dark (#111827) — always use light text */}
            <div className="font-black text-sm leading-tight tracking-tight" style={{ color: '#f9fafb' }}>
              {shopName.split(' ')[0]}
              <span style={{ color: 'var(--brand-400)' }}>{shopName.split(' ').length > 1 ? ' ' + shopName.split(' ').slice(1).join(' ') : ''}</span>
            </div>
            <div className="text-[10px] leading-tight" style={{ color: 'rgba(156,163,175,0.85)' }}>Point of Sale</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto no-scrollbar">
        {allowed.map(item => <NavItem key={item.id} item={item} />)}
      </nav>

      <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--surface-border)' }}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl mb-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 uppercase"
            style={{ background: 'rgba(220,38,38,0.15)', color: 'var(--brand-400)' }}>
            {user?.name?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate" style={{ color: 'var(--ink-primary)' }}>{user?.name}</div>
            <div className="text-[10px] capitalize" style={{ color: 'var(--ink-tertiary)' }}>{user?.role}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold mb-2" style={{
          background: online ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)',
          color: online ? '#34d399' : '#fbbf24',
        }}>
          {online ? <><Wifi size={11} />Online</> : <><WifiOff size={11} />Offline</>}
        </div>

        <button onClick={onLogout}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
          style={{ color: 'var(--ink-tertiary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(220,38,38,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-tertiary)'; e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={14} />Logout
        </button>
      </div>
    </>
  )

  return (
    <div className="h-full flex app-bg">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 nav-sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setDrawerOpen(false)}
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <aside className="flex flex-col w-64 h-full nav-sidebar animate-slide-left" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--surface-border)' }}>
              <span className="font-black text-sm" style={{ color: 'var(--ink-primary)' }}>Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--surface-border)' }}>
          <button onClick={() => setDrawerOpen(true)} className="btn-ghost p-1.5"><Menu size={18} /></button>
          <LogoMark size="sm" />
          <span className="font-black text-sm flex-1 truncate" style={{ color: 'var(--ink-primary)' }}>{shopName}</span>
          {online ? <Wifi size={14} style={{ color: '#34d399' }} /> : <WifiOff size={14} style={{ color: '#fbbf24' }} />}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-hidden" style={{ background: 'var(--surface-0)' }}>
          {children}
        </main>

        {/* Smart mobile bottom nav — Sync always pinned */}
        <MobileBottomNav allowed={allowed} page={page} navigate={navigate} />
      </div>

      {showHUD && <SessionHUD navigate={navigate} currentPage={page} />}
    </div>
  )
}
