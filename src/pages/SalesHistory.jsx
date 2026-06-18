import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search, Download, Eye, X, ReceiptText, TrendingUp,
  BarChart2, DollarSign, Tag, ChevronDown, ArrowUpRight,
  Banknote, Smartphone, CreditCard, FileCheck, Package,
  RotateCcw, AlertTriangle, Check, Minus, Plus,
} from 'lucide-react'
import { db, getSetting, returnSale } from '../lib/db'
import { fmt, round2, formatDate } from '../lib/utils'
import Receipt from '../components/Receipt.jsx'

const PAY_CONFIG = {
  cash:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: 'Cash',    Icon: Banknote },
  ecocash: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'EcoCash', Icon: Smartphone },
  swipe:   { color: '#1e5bff', bg: 'rgba(30,91,255,0.12)', label: 'Swipe',   Icon: CreditCard },
  invoice: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: 'Invoice', Icon: FileCheck },
}

const PRESETS = [
  { label: 'Today',      getDates: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), t.getDate()); return [s.toISOString().split('T')[0], t.toISOString().split('T')[0]] } },
  { label: 'This Week',  getDates: () => { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - t.getDay()); return [s.toISOString().split('T')[0], t.toISOString().split('T')[0]] } },
  { label: 'This Month', getDates: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), 1); return [s.toISOString().split('T')[0], t.toISOString().split('T')[0]] } },
  { label: 'Last Month', getDates: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth()-1, 1); const e = new Date(t.getFullYear(), t.getMonth(), 0); return [s.toISOString().split('T')[0], e.toISOString().split('T')[0]] } },
  { label: 'This Year',  getDates: () => { const t = new Date(); const s = new Date(t.getFullYear(), 0, 1); return [s.toISOString().split('T')[0], t.toISOString().split('T')[0]] } },
]

function calcGrossMargin(revenue, cost) {
  if (!revenue || revenue <= 0) return null
  return round2(((revenue - cost) / revenue) * 100)
}
function calcMarkup(revenue, cost) {
  if (!cost || cost <= 0) return null
  return round2(((revenue - cost) / cost) * 100)
}

// Premium animated number
function AnimatedNumber({ value, prefix = '', decimals = 2 }) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)
  useEffect(() => {
    const start = prevRef.current, end = value, dur = 600
    const startTime = performance.now()
    const tick = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / dur, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(round2(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(tick)
      else prevRef.current = end
    }
    requestAnimationFrame(tick)
  }, [value])
  return <>{prefix}{decimals > 0 ? displayed.toFixed(decimals) : Math.round(displayed)}</>
}

// Premium bar chart — inline SVG with tooltips
function BarChart({ data, valueKey = 'value', labelKey = 'label', color = '#e11d15', height = 120 }) {
  if (!data || data.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, color: 'var(--ink-tertiary)', fontSize: 11 }}>No data</div>
  )
  const max = Math.max(...data.map(d => d[valueKey] || 0)) || 1
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, width: '100%', height }}>
      {data.map((d, i) => {
        const pct = ((d[valueKey] || 0) / max) * 100
        const isMax = d[valueKey] === max
        return (
          <div key={i} title={fmt(d[valueKey] || 0)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              height: `${Math.max(pct, 2)}%`,
              background: isMax ? color : `${color}55`,
              transition: 'height 700ms cubic-bezier(0.16,1,0.3,1)',
            }} />
            <span style={{ fontSize: 8, color: 'var(--ink-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center' }}>{d[labelKey]}</span>
          </div>
        )
      })}
    </div>
  )
}

// Premium donut chart
function DonutChart({ data }) {
  if (!data || data.length === 0) return null
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total === 0) return null
  const COLORS = ['#e11d15', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
  let cumPct = 0
  const r = 38, cx = 50, cy = 50, strokeWidth = 16
  const circumference = 2 * Math.PI * r
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="90" height="90" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={strokeWidth} />
        {data.map((d, i) => {
          const pct = d.value / total
          const dashArray = `${pct * circumference} ${circumference}`
          const dashOffset = -cumPct * circumference
          cumPct += pct
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={COLORS[i % COLORS.length]} strokeWidth={strokeWidth}
              strokeDasharray={dashArray} strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1)' }} />
          )
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 9, fontWeight: 800, fill: 'var(--ink-primary)', fontFamily: 'inherit' }}>
          {data.length}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 7, fill: 'var(--ink-tertiary)', fontFamily: 'inherit' }}>methods</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        {data.map((d, i) => {
          const pct = round2((d.value / total) * 100)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % 5], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--ink-secondary)', textTransform: 'capitalize', fontWeight: 500 }}>{d.label}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.value)}</span>
              </div>
              <div style={{ height: 3, borderRadius: 9999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: COLORS[i % 5], borderRadius: 9999, transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Double-bezel KPI card (from high-end-ui)
function KpiCard({ title, value, prefix = '$', decimals = 2, color = '#e11d15', bg = 'rgba(255,56,48,0.1)', Icon, sub }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(0,0,0,0.03)',
        border: '1px solid rgba(0,0,0,0.05)',
        padding: 5,
        borderRadius: 18,
        transition: 'box-shadow 300ms cubic-bezier(0.32,0.72,0,1)',
        boxShadow: hovered ? 'var(--shadow-md)' : 'none',
      }}
    >
      <div style={{
        background: 'var(--surface-1)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.8)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {Icon && (
          <div style={{ width: 32, height: 32, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={14} style={{ color }} />
          </div>
        )}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            <AnimatedNumber value={value} prefix={prefix} decimals={decimals} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 3, fontWeight: 600 }}>{title}</div>
          {sub && <div style={{ fontSize: 9, color: 'var(--ink-tertiary)', marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )
}

function SectionCard({ children, style = {}, alert = false }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: alert ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--surface-border)',
      borderRadius: 18,
      padding: '14px 16px',
      boxShadow: 'var(--shadow-sm)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardTitle({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 9, color: 'var(--ink-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

export default function SalesHistory({ user }) {
  const [sales, setSales]           = useState([])
  const [products, setProducts]     = useState([])
  const [search, setSearch]         = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [payFilter, setPayFilter]   = useState('all')
  const [viewReceipt, setViewReceipt] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('overview')
  const [marginDim, setMarginDim]   = useState('category')
  const [marginFormula, setMarginFormula] = useState('gross')
  const [shopInfo, setShopInfo]     = useState({})
  const [activePreset, setActivePreset] = useState('This Month')
  const [expandedSale, setExpandedSale] = useState(null)

  // Return flow
  const [returnModal, setReturnModal]   = useState(null)   // holds the original sale
  const [returnQtys, setReturnQtys]     = useState({})     // sku → qty to return
  const [returnReason, setReturnReason] = useState('')
  const [returnBusy, setReturnBusy]     = useState(false)
  const [returnToast, setReturnToast]   = useState(null)

  const openReturn = (sale, e) => {
    e.stopPropagation()
    const initial = {}
    ;(sale.items || []).forEach(item => { initial[`${item.sku}-${item.mode}`] = item.qty })
    setReturnQtys(initial)
    setReturnReason('')
    setReturnModal(sale)
  }

  const submitReturn = async () => {
    if (!returnReason.trim()) { setReturnToast('Please enter a return reason'); return }
    const returnedItems = (returnModal.items || [])
      .filter(item => (returnQtys[`${item.sku}-${item.mode}`] || 0) > 0)
      .map(item => ({ ...item, qty: returnQtys[`${item.sku}-${item.mode}`] || 0 }))
    if (returnedItems.length === 0) { setReturnToast('Select at least one item to return'); return }
    setReturnBusy(true)
    try {
      const { ref } = await returnSale(returnModal, returnedItems, returnReason, user)
      setReturnModal(null)
      await loadSales()
      setReturnToast(null)
      // Brief success message via the page
    } catch (err) {
      setReturnToast(`Error: ${err.message}`)
    } finally {
      setReturnBusy(false)
    }
  }

  const loadSales = async () => {
    let all = await db.sales.orderBy('createdAt').reverse().toArray()
    if (user?.role === 'cashier') {
      all = all.filter(s => s.cashierId === String(user.id) || s.cashier === user.name)
    }
    setSales(all)
    const p = await db.products.filter(pr => !!pr.active).toArray()
    setProducts(p)
  }

  useEffect(() => {
    ;(async () => {
      await loadSales()
      const formula = await getSetting('margin_formula', 'gross')
      setMarginFormula(formula)
      const sn = await getSetting('shop_name')
      const st = await getSetting('shop_tagline')
      const sa = await getSetting('shop_address')
      const sp = await getSetting('shop_phones')
      setShopInfo({ name: sn, tagline: st, address: sa, phones: sp?.split(',') })
      setLoading(false)
      const preset = PRESETS.find(p => p.label === 'This Month')
      if (preset) { const [f, t] = preset.getDates(); setDateFrom(f); setDateTo(t) }
    })()
    const interval = setInterval(loadSales, 15000)
    return () => clearInterval(interval)
  }, [])

  const applyPreset = (preset) => {
    const [from, to] = preset.getDates()
    setDateFrom(from); setDateTo(to); setActivePreset(preset.label)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sales.filter(s => {
      if (s.status === 'held') return false
      if (typeFilter !== 'all' && s.type !== typeFilter) return false
      if (payFilter !== 'all' && s.payMethod !== payFilter) return false
      if (q && !(s.customer || '').toLowerCase().includes(q) && !(s.ref || s.id || '').toLowerCase().includes(q) && !(s.cashier || '').toLowerCase().includes(q)) return false
      const d = new Date(s.createdAt)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [sales, search, dateFrom, dateTo, typeFilter, payFilter])

  const totals = useMemo(() => {
    const completed = filtered.filter(s => s.status === 'completed' || s.type === 'sale')
    return {
      revenue:  completed.reduce((a, s) => a + (s.grandTotal || s.total || 0), 0),
      count:    completed.length,
      discount: completed.reduce((a, s) => a + (s.totalDiscount || s.saleDiscount || 0), 0),
      avgSale:  completed.length ? round2(completed.reduce((a, s) => a + (s.grandTotal || s.total || 0), 0) / completed.length) : 0,
    }
  }, [filtered])

  const dailyData = useMemo(() => {
    const byDay = {}, byDayDate = {}
    filtered.filter(s => s.status === 'completed').forEach(s => {
      const d = new Date(s.createdAt)
      const key = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      byDay[key] = (byDay[key] || 0) + (s.grandTotal || 0)
      byDayDate[key] = label
    })
    return Object.keys(byDay).sort().slice(-14).map(k => ({ label: byDayDate[k], value: byDay[k] }))
  }, [filtered])

  const paymentBreakdown = useMemo(() => {
    const byMethod = {}
    filtered.filter(s => s.status === 'completed').forEach(s => {
      const m = s.payMethod || 'cash'
      byMethod[m] = (byMethod[m] || 0) + (s.grandTotal || 0)
    })
    return Object.entries(byMethod).map(([label, value]) => ({ label, value }))
  }, [filtered])

  const marginData = useMemo(() => {
    const completedSales = filtered.filter(s => s.status === 'completed')
    const prodMap = {}
    products.forEach(p => { prodMap[p.sku] = p })
    const byCategory = {}, byProduct = {}
    let totalRevenue = 0, totalCost = 0

    for (const sale of completedSales) {
      for (const item of (sale.items || [])) {
        const prod = prodMap[item.sku]
        if (!prod) continue
        const revenue = round2((item.unitPrice * item.qty) - (item.lineDiscount || 0))
        const unitsPerLine = item.unitsPerLine || 1
        const unitCost = prod.costPrice || 0
        const cost = round2(unitCost * item.qty * unitsPerLine)
        const cat = prod.category || 'Uncategorised'
        totalRevenue = round2(totalRevenue + revenue)
        totalCost    = round2(totalCost + cost)
        if (!byCategory[cat]) byCategory[cat] = { revenue: 0, cost: 0, units: 0 }
        byCategory[cat].revenue = round2(byCategory[cat].revenue + revenue)
        byCategory[cat].cost    = round2(byCategory[cat].cost + cost)
        byCategory[cat].units  += item.qty
        if (!byProduct[prod.sku]) byProduct[prod.sku] = { name: prod.name, revenue: 0, cost: 0, units: 0, cat }
        byProduct[prod.sku].revenue = round2(byProduct[prod.sku].revenue + revenue)
        byProduct[prod.sku].cost    = round2(byProduct[prod.sku].cost + cost)
        byProduct[prod.sku].units  += item.qty
      }
    }

    const calcMargin = (rev, cost) => marginFormula === 'gross' ? calcGrossMargin(rev, cost) : calcMarkup(rev, cost)
    const safeMargin = (rev, cost) => cost === 0 ? null : calcMargin(rev, cost)

    const catRows  = Object.entries(byCategory).map(([name, d]) => ({ name, ...d, profit: round2(d.revenue - d.cost), margin: safeMargin(d.revenue, d.cost) })).sort((a, b) => b.revenue - a.revenue)
    const prodRows = Object.entries(byProduct).map(([sku, d]) => ({ sku, ...d, profit: round2(d.revenue - d.cost), margin: safeMargin(d.revenue, d.cost) })).sort((a, b) => b.revenue - a.revenue)
    const totalProfit = round2(totalRevenue - totalCost)
    const overallMargin = totalCost > 0 ? calcMargin(totalRevenue, totalCost) : null

    return { catRows, prodRows, totalRevenue, totalCost, totalProfit, overallMargin }
  }, [filtered, products, marginFormula])

  const exportCSV = () => {
    const rows = [['Ref','Date','Customer','Cashier','Type','Payment','Items','Subtotal','Discount','VAT','Total']]
    filtered.forEach(s => rows.push([s.ref || s.id, new Date(s.createdAt).toLocaleString('en-GB'), s.customer || 'Walk-in', s.cashier, s.type, s.payMethod || '-', (s.items || []).length, fmt(s.subtotal), fmt(s.totalDiscount || 0), fmt(s.vatAmount || s.vat || 0), fmt(s.grandTotal || s.total || 0)]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `sales-${dateFrom || 'all'}-to-${dateTo || 'now'}.csv`; a.click()
  }

  const PAY_COLOR_BADGE = {
    cash:    { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    ecocash: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    swipe:   { color: '#1e5bff', bg: 'rgba(30,91,255,0.1)' },
    invoice: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  }

  return (
    <div className="page-wrap">
      {/* ── Header ── */}
      <div style={{ padding: '12px 16px 0', background: 'var(--surface-1)', borderBottom: '1px solid var(--surface-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', margin: 0 }}>Sales & Reports</h1>
            <p style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={exportCSV} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 11, gap: 5 }}>
            <Download size={12} /> CSV
          </button>
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2 }} className="no-scrollbar">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`cat-chip shrink-0 ${activePreset === p.label ? 'cat-chip-active' : 'cat-chip-inactive'}`}>
              {p.label}
            </button>
          ))}
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setActivePreset('') }}
              className="cat-chip shrink-0 cat-chip-inactive" style={{ color: 'var(--brand-600)' }}>
              <X size={9} style={{ display: 'inline', marginRight: 2 }} />Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 100 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-tertiary)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Customer, ref…" className="input" style={{ paddingLeft: 28, paddingTop: 6, paddingBottom: 6, fontSize: 11 }} />
          </div>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset('') }}
            className="input" style={{ padding: '6px 8px', fontSize: 11, width: 130, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--ink-tertiary)', flexShrink: 0 }}>—</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset('') }}
            className="input" style={{ padding: '6px 8px', fontSize: 11, width: 130, flexShrink: 0 }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input" style={{ padding: '6px 8px', fontSize: 11, width: 'auto', flexShrink: 0 }}>
            <option value="all">All types</option>
            <option value="sale">Sales</option>
            <option value="quote">Quotes</option>
            <option value="return">Returns</option>
          </select>
          <select value={payFilter} onChange={e => setPayFilter(e.target.value)} className="input" style={{ padding: '6px 8px', fontSize: 11, width: 'auto', flexShrink: 0 }}>
            <option value="all">All payments</option>
            <option value="cash">Cash</option>
            <option value="ecocash">EcoCash</option>
            <option value="swipe">Swipe</option>
            <option value="invoice">Invoice</option>
          </select>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[['overview', BarChart2, 'Overview'], ['sales', ReceiptText, 'Sales List'], ['margins', TrendingUp, 'Margins']].map(([id, Icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', fontSize: 11, fontWeight: 700,
                border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer',
                background: tab === id ? 'var(--surface-0)' : 'transparent',
                color: tab === id ? 'var(--brand-600)' : 'var(--ink-tertiary)',
                borderBottom: tab === id ? '2px solid var(--brand-600)' : '2px solid transparent',
                transition: 'all 180ms cubic-bezier(0.32,0.72,0,1)',
              }}>
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, paddingBottom: 80, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* KPI bento grid — asymmetric */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <KpiCard title="Total Revenue" value={totals.revenue} prefix="$" Icon={DollarSign} color="#e11d15" bg="rgba(255,56,48,0.1)"
                sub={`${totals.count} transaction${totals.count !== 1 ? 's' : ''}`} />
            </div>
            <KpiCard title="Average Sale" value={totals.avgSale} prefix="$" Icon={TrendingUp} color="#10b981" bg="rgba(16,185,129,0.1)" />
            <KpiCard title="Discounts" value={totals.discount} prefix="$" Icon={Tag} color="#f59e0b" bg="rgba(245,158,11,0.1)" />
          </div>

          {/* Daily revenue bar chart */}
          <SectionCard>
            <CardTitle title="Daily Revenue" sub={`Last ${Math.min(dailyData.length, 14)} days`} />
            {dailyData.length > 0
              ? <BarChart data={dailyData} valueKey="value" labelKey="label" color="#e11d15" height={110} />
              : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 110, color: 'var(--ink-tertiary)', fontSize: 11 }}>No sales in this period</div>
            }
          </SectionCard>

          {/* Payment methods */}
          {paymentBreakdown.length > 0 && (
            <SectionCard>
              <CardTitle title="Payment Methods" sub="Revenue by type" />
              <DonutChart data={paymentBreakdown} />
            </SectionCard>
          )}

          {/* Top products */}
          {marginData.prodRows.length > 0 && (
            <SectionCard>
              <CardTitle title="Top Products" sub="By revenue this period" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {marginData.prodRows.slice(0, 5).map((row, i) => {
                  const maxRev = marginData.prodRows[0]?.revenue || 1
                  const pct = (row.revenue / maxRev) * 100
                  return (
                    <div key={row.sku} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 14, fontSize: 10, fontWeight: 800, color: 'var(--surface-4)', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{row.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(row.revenue)}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 9999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: 'linear-gradient(90deg,var(--brand-600),#f87171)', transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Sales List Tab ── */}
      {tab === 'sales' && (
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--ink-tertiary)', fontSize: 12 }}>Loading…</div>
          ) : (
            <div style={{ minWidth: 0, overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', minWidth: 500 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th className="hidden sm:table-cell">Cashier</th>
                    <th>Payment</th>
                    <th className="text-right hidden sm:table-cell">Discount</th>
                    <th className="text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--ink-tertiary)' }}>
                      <ReceiptText size={28} style={{ opacity: 0.2, margin: '0 auto 10px', display: 'block' }} />No records found
                    </td></tr>
                  )}
                  {filtered.map((s, i) => {
                    const payStyle = PAY_COLOR_BADGE[s.payMethod] || { color: 'var(--ink-tertiary)', bg: 'var(--surface-3)' }
                    const isExpanded = expandedSale === (s.id || i)
                    return (
                      <React.Fragment key={s.id || i}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedSale(isExpanded ? null : (s.id || i))}>
                          <td>
                            <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 96 }}>{s.ref || s.id}</div>
                            <div style={{
                              display: 'inline-block', marginTop: 2, padding: '1px 6px', borderRadius: 9999, fontSize: 9, fontWeight: 700,
                              background: s.type === 'quote' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                              color: s.type === 'quote' ? '#d97706' : '#059669'
                            }}>{s.type}</div>
                          </td>
                          <td style={{ fontSize: 11, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customer || 'Walk-in'}</td>
                          <td style={{ fontSize: 10, color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>{formatDate(s.createdAt)}</td>
                          <td style={{ fontSize: 10, color: 'var(--ink-tertiary)' }} className="hidden sm:table-cell">{s.cashier}</td>
                          <td>
                            <span style={{ padding: '2px 7px', borderRadius: 9999, fontSize: 9, fontWeight: 700, background: payStyle.bg, color: payStyle.color, display: 'inline-block', textTransform: 'capitalize' }}>
                              {s.payMethod || '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--brand-600)', fontWeight: 600 }} className="hidden sm:table-cell">
                            {(s.totalDiscount || 0) > 0 ? `-${fmt(s.totalDiscount)}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 13, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.grandTotal || s.total || 0)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button onClick={e => { e.stopPropagation(); setViewReceipt(s) }}
                                className="btn-ghost" style={{ padding: '4px 6px', color: 'var(--ink-tertiary)' }}
                                title="View receipt">
                                <Eye size={13} />
                              </button>
                              {s.type === 'sale' && s.status === 'completed' && (
                                <button onClick={e => openReturn(s, e)}
                                  className="btn-ghost" style={{ padding: '4px 6px', color: '#f59e0b' }}
                                  title="Return / Refund">
                                  <RotateCcw size={13} />
                                </button>
                              )}
                              <div style={{ width: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ChevronDown size={11} style={{ color: 'var(--ink-tertiary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (s.items || []).length > 0 && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: 'var(--surface-0)' }}>
                              <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--surface-border)' }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Line Items</div>
                                {s.items.map((item, j) => (
                                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: j < s.items.length - 1 ? '1px solid var(--surface-border)' : 'none' }}>
                                    <div>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-primary)' }}>{item.name || item.sku}</span>
                                      <span style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginLeft: 6 }}>x{item.qty}</span>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.unitPrice * item.qty)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Margins Tab ── */}
      {tab === 'margins' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, paddingBottom: 80, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-3)', borderRadius: 10, padding: 3 }}>
              {['category', 'product', 'overall'].map(d => (
                <button key={d} onClick={() => setMarginDim(d)}
                  style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: marginDim === d ? 'var(--brand-600)' : 'transparent',
                    color: marginDim === d ? '#fff' : 'var(--ink-tertiary)',
                    transition: 'all 180ms cubic-bezier(0.32,0.72,0,1)',
                    textTransform: 'capitalize',
                  }}>{d}</button>
              ))}
            </div>
            <select value={marginFormula} onChange={e => setMarginFormula(e.target.value)} className="input" style={{ padding: '5px 8px', fontSize: 10, width: 'auto', marginLeft: 'auto' }}>
              <option value="gross">Gross Margin %</option>
              <option value="markup">Markup %</option>
            </select>
          </div>

          {marginData.totalCost === 0 && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.15)', fontSize: 11, color: '#92400e' }}>
              Set cost prices in Inventory for accurate margin calculations.
            </div>
          )}

          {marginDim === 'overall' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <KpiCard title="Total Revenue" value={marginData.totalRevenue} prefix="$" Icon={DollarSign} color="#e11d15" bg="rgba(255,56,48,0.1)" />
              <KpiCard title="Total Cost" value={marginData.totalCost} prefix="$" Icon={Package} color="#6b7280" bg="rgba(107,114,128,0.1)" />
              <KpiCard title="Gross Profit" value={marginData.totalProfit} prefix="$" Icon={TrendingUp}
                color={marginData.totalProfit >= 0 ? '#10b981' : '#ef4444'}
                bg={marginData.totalProfit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'} />
              <KpiCard title={marginFormula === 'gross' ? 'Gross Margin' : 'Markup'} value={marginData.overallMargin ?? 0} prefix="" decimals={1}
                Icon={BarChart2} color="#3b82f6" bg="rgba(59,130,246,0.1)"
                sub={marginData.overallMargin == null ? 'Set cost prices' : undefined} />
            </div>
          )}

          {marginDim === 'category' && (
            <>
              {marginData.catRows.length > 0 && (
                <SectionCard>
                  <CardTitle title="Revenue by Category" />
                  <BarChart data={marginData.catRows.map(r => ({ label: r.name.split(' ')[0], value: r.revenue }))} height={90} color="#e11d15" />
                </SectionCard>
              )}
              <div style={{ overflowX: 'auto', minWidth: 0 }}>
                <table className="data-table" style={{ width: '100%', minWidth: 380 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>Category</th>
                      <th className="text-right">Revenue</th>
                      <th className="text-right hidden sm:table-cell">Cost</th>
                      <th className="text-right hidden sm:table-cell">Profit</th>
                      <th className="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marginData.catRows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink-tertiary)', fontSize: 11 }}>No data</td></tr>}
                    {marginData.catRows.map(row => (
                      <tr key={row.name}>
                        <td style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 96 }}>{row.name}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(row.revenue)}</td>
                        <td style={{ textAlign: 'right', fontSize: 10, color: 'var(--ink-tertiary)', fontVariantNumeric: 'tabular-nums' }} className="hidden sm:table-cell">{fmt(row.cost)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#10b981', fontVariantNumeric: 'tabular-nums' }} className="hidden sm:table-cell">{fmt(row.revenue - row.cost)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {row.margin != null
                            ? <span style={{ padding: '2px 7px', borderRadius: 9999, fontSize: 9, fontWeight: 800, display: 'inline-block', background: row.margin >= 20 ? 'rgba(16,185,129,0.1)' : row.margin >= 10 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', color: row.margin >= 20 ? '#059669' : row.margin >= 10 ? '#d97706' : '#dc2626' }}>{row.margin}%</span>
                            : <span style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {marginDim === 'product' && (
            <>
              {marginData.prodRows.length > 0 && (
                <SectionCard>
                  <CardTitle title="Revenue by Product" sub="Top 10" />
                  <BarChart data={marginData.prodRows.slice(0, 10).map(r => ({ label: r.name.split(' ')[0], value: r.revenue }))} height={90} color="#3b82f6" />
                </SectionCard>
              )}
              <div style={{ overflowX: 'auto', minWidth: 0 }}>
                <table className="data-table" style={{ width: '100%', minWidth: 340 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>Product</th>
                      <th className="hidden sm:table-cell">Category</th>
                      <th className="text-right">Revenue</th>
                      <th className="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marginData.prodRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink-tertiary)', fontSize: 11 }}>No data</td></tr>}
                    {marginData.prodRows.map(row => (
                      <tr key={row.sku}>
                        <td>
                          <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 112 }}>{row.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--ink-tertiary)', fontFamily: 'monospace' }}>{row.sku}</div>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span style={{ padding: '2px 6px', borderRadius: 9999, fontSize: 9, fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#2563eb' }}>{row.cat}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(row.revenue)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {row.margin != null
                            ? <span style={{ padding: '2px 7px', borderRadius: 9999, fontSize: 9, fontWeight: 800, display: 'inline-block', background: row.margin >= 20 ? 'rgba(16,185,129,0.1)' : row.margin >= 10 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', color: row.margin >= 20 ? '#059669' : row.margin >= 10 ? '#d97706' : '#dc2626' }}>{row.margin}%</span>
                            : <span style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {viewReceipt && <Receipt record={viewReceipt} shop={shopInfo} onClose={() => setViewReceipt(null)} readOnly />}

      {/* ── Return / Refund modal ── */}
      {returnModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setReturnModal(null)}>
          <div className="modal-box-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900">Return — {returnModal.ref}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{returnModal.customer} · {new Date(returnModal.createdAt).toLocaleDateString('en-GB')}</p>
              </div>
              <button onClick={() => setReturnModal(null)}><X size={17} className="text-gray-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {/* Item selection */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Items to return</p>
                <div className="space-y-2">
                  {(returnModal.items || []).filter(item => item.subMode !== 'units').map(item => {
                    const key = `${item.sku}-${item.mode}`
                    const qty = returnQtys[key] ?? item.qty
                    return (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400">{item.label} · {fmt(item.unitPrice)}/ea · orig qty: {item.qty}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => setReturnQtys(q => ({ ...q, [key]: Math.max(0, (q[key] ?? item.qty) - 1) }))}
                            className="w-6 h-6 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition">
                            <Minus size={11} className="text-gray-600" />
                          </button>
                          <span className="w-6 text-center text-sm font-black text-gray-900">{qty}</span>
                          <button onClick={() => setReturnQtys(q => ({ ...q, [key]: Math.min(item.qty, (q[key] ?? item.qty) + 1) }))}
                            className="w-6 h-6 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-green-50 hover:border-green-200 transition">
                            <Plus size={11} className="text-gray-600" />
                          </button>
                        </div>
                        <div className="text-right shrink-0 w-16">
                          <div className="text-xs font-black text-brand-600">{fmt(item.unitPrice * qty)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Refund summary */}
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-amber-800">Refund total</span>
                  <span className="text-lg font-black text-amber-700">
                    {fmt((returnModal.items || []).filter(i => i.subMode !== 'units').reduce((sum, item) => {
                      const qty = returnQtys[`${item.sku}-${item.mode}`] ?? item.qty
                      return sum + item.unitPrice * qty
                    }, 0))}
                  </span>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Return reason *</label>
                <input value={returnReason} onChange={e => setReturnReason(e.target.value)}
                  className="input text-sm" placeholder="e.g. Wrong part, defective, customer changed mind…" autoFocus />
              </div>

              {returnToast && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-xs font-medium text-red-700">
                  <AlertTriangle size={13} />{returnToast}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex gap-2 shrink-0">
              <button onClick={() => setReturnModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitReturn} disabled={returnBusy}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl text-white bg-amber-500 hover:bg-amber-600 transition disabled:opacity-50">
                <RotateCcw size={15} />{returnBusy ? 'Processing…' : 'Process Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
