import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Users, Package, Banknote, Smartphone, CreditCard,
  FileCheck, RefreshCw, ArrowUpRight, AlertTriangle, ChevronRight,
  ClipboardList, X, Printer
} from 'lucide-react'
import { db, getSetting } from '../lib/db'
import { fmt, round2 } from '../lib/utils'
import Receipt from '../components/Receipt.jsx'

const PRESETS = [
  { label: 'Today',      getRange: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth(), t.getDate()), t] } },
  { label: 'This Week',  getRange: () => { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - 6); return [s, t] } },
  { label: 'This Month', getRange: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth(), 1), t] } },
  { label: 'All Time',   getRange: () => [new Date('2000-01-01'), new Date()] },
]

const PAY_CONFIG = {
  cash:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: Banknote,   label: 'Cash' },
  ecocash: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Smartphone, label: 'EcoCash' },
  swipe:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: CreditCard, label: 'Swipe' },
  invoice: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: FileCheck,  label: 'Invoice' },
}

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

function KpiCard({ title, value, sub, icon: Icon, color = '#dc2626', bg = 'rgba(220,38,38,0.1)', prefix = '$', decimals = 2, large = false }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--surface-border)',
        borderRadius: 20,
        padding: large ? '20px 22px' : '16px 18px',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'box-shadow 220ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: large ? 26 : 20, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          <AnimatedNumber value={value} prefix={prefix} decimals={decimals} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 4, fontWeight: 500 }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

function ProgressRow({ label, value, total, color, Icon }) {
  const pct = total > 0 ? round2((value / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {Icon && (
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={12} style={{ color: color || 'var(--ink-tertiary)' }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-secondary)', textTransform: 'capitalize' }}>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
        </div>
        <div style={{ height: 4, borderRadius: 9999, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: color || 'var(--brand-600)', transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-tertiary)', marginTop: 2 }}>{pct}%</div>
      </div>
    </div>
  )
}

function ProductBar({ rank, name, revenue, max }) {
  const pct = max > 0 ? (revenue / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 16, fontSize: 10, fontWeight: 800, color: 'var(--surface-4)', textAlign: 'right', flexShrink: 0 }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{name}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(revenue)}</span>
        </div>
        <div style={{ height: 5, borderRadius: 9999, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: 'linear-gradient(90deg, var(--brand-600), #f87171)', transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
      </div>
    </div>
  )
}

function Card({ children, style = {}, alert = false }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: alert ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--surface-border)',
      borderRadius: 20,
      padding: '16px 20px',
      boxShadow: 'var(--shadow-sm)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardTitle({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

export default function Dashboard({ user, navigate }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [preset, setPreset]       = useState('Today')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [payFilter, setPayFilter] = useState('all')
  const [range, setRange]         = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [spinning, setSpinning]   = useState(false)
  const [zOpen, setZOpen]         = useState(false)
  const [zCounted, setZCounted]   = useState('')
  const [zFloat, setZFloat]       = useState('')
  const [viewReceipt, setViewReceipt] = useState(null)  // receipt modal
  const [shopInfo, setShopInfo]   = useState({})
  const intervalRef = useRef(null)

  const loadData = useCallback(async (from, to, pf) => {
    const allSales  = await db.sales.where('type').equals('sale').toArray()
    const completed = allSales.filter(s => s.status === 'completed')
    const products  = await db.products.toArray()
    const customers = await db.customers.toArray()
    const creditTxs = await db.creditTransactions.toArray()
    const allExpenses = await db.expenses.toArray()

    const inRange = completed.filter(s => {
      const d = new Date(s.createdAt)
      if (from && d < from) return false
      if (to   && d > to  ) return false
      if (pf !== 'all' && s.payMethod !== pf) return false
      return true
    })

    const revenue  = inRange.reduce((a, s) => a + (s.grandTotal || s.total || 0), 0)
    const discount = inRange.reduce((a, s) => a + (s.totalDiscount || 0), 0)
    const txCount  = inRange.length
    const avgSale  = txCount > 0 ? round2(revenue / txCount) : 0

    const byMethod = {}
    for (const s of inRange) {
      const m = s.payMethod || 'unknown'
      byMethod[m] = (byMethod[m] || 0) + (s.grandTotal || s.total || 0)
    }

    const skuTotals = {}
    for (const s of inRange) {
      for (const item of (s.items || [])) {
        skuTotals[item.sku] = (skuTotals[item.sku] || 0) + (item.unitPrice * item.qty)
      }
    }
    const topProducts = Object.entries(skuTotals)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([sku, rev]) => {
        const p = products.find(pr => pr.sku === sku)
        return { sku, name: p?.name || sku, revenue: round2(rev) }
      })

    // Gross profit (requires costPrice on products)
    const productMap = {}
    products.forEach(p => { productMap[p.sku] = p })
    const grossProfit = inRange.reduce((sum, s) => {
      for (const item of (s.items || [])) {
        const cost = productMap[item.sku]?.costPrice || 0
        sum += (item.unitPrice - cost) * item.qty
      }
      return sum
    }, 0)
    const marginPct = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0

    // Expenses in range
    const expensesInRange = allExpenses.filter(e => {
      if (!e.date) return false
      const d = new Date(e.date + 'T00:00:00')
      if (from && d < from) return false
      if (to   && d > to  ) return false
      return true
    })
    const totalExpenses = round2(expensesInRange.reduce((s, e) => s + (e.amount || 0), 0))
    const netProfit = round2(grossProfit - totalExpenses)

    const lowStock = products.filter(p => {
      const total = (p.stockBoxes || 0) * (p.boxSize || 1) + (p.stockUnits || 0)
      return total < (p.lowStockThreshold || 5) && total > 0 && p.active
    }).length
    const outStock = products.filter(p => {
      const total = (p.stockBoxes || 0) * (p.boxSize || 1) + (p.stockUnits || 0)
      return total <= 0 && p.active
    }).length
    const noCostPrice = products.filter(p => p.active && !p.costPrice).length

    const pendingCredit = creditTxs
      .filter(t => !t.settled && (t.type === 'credit_owed' || t.type === 'change_owed'))
      .reduce((a, t) => a + t.amount, 0)

    // 7-day daily bar data (always last 7 real days)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0)
      const next = new Date(d); next.setDate(next.getDate() + 1)
      const label = d.toLocaleDateString('en', { weekday: 'narrow' })
      const value = completed.filter(s => {
        const sd = new Date(s.createdAt); return sd >= d && sd < next
      }).reduce((a, s) => a + (s.grandTotal || s.total || 0), 0)
      return { label, value, isToday: i === 6 }
    })

    const recentSales = allSales
      .filter(s => s.status === 'completed')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6)

    setData({ revenue, discount, txCount, avgSale, byMethod, topProducts, lowStock, outStock, noCostPrice, totalProducts: products.filter(p => p.active).length, totalCustomers: customers.length, pendingCredit: round2(pendingCredit), recentSales, last7, grossProfit: round2(grossProfit), marginPct, totalExpenses, netProfit })
    setLoading(false)
    setLastRefresh(new Date())
  }, [])

  const applyPreset = useCallback((p) => {
    setPreset(p); setDateFrom(''); setDateTo('')
    const found = PRESETS.find(pr => pr.label === p)
    if (found) { const [from, to] = found.getRange(); setRange([from, to]); loadData(from, to, payFilter) }
  }, [loadData, payFilter])

  const applyCustom = () => {
    setPreset('')
    const from = dateFrom ? new Date(dateFrom) : null
    const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null
    setRange([from, to]); loadData(from, to, payFilter)
  }

  const handleRefresh = () => {
    setSpinning(true); setTimeout(() => setSpinning(false), 800)
    if (range) loadData(range[0], range[1], payFilter)
  }

  useEffect(() => {
    applyPreset('Today')
    // Load shop info for the receipt viewer
    Promise.all([
      getSetting('shop_name'),
      getSetting('shop_tagline'),
      getSetting('shop_address'),
      getSetting('shop_phones'),
      getSetting('shop_logo'),
    ]).then(([name, tagline, address, phones, logo]) => {
      setShopInfo({ name, tagline, address, phones: phones?.split(',').filter(Boolean), logo })
    })
  }, [])
  useEffect(() => { if (range) loadData(range[0], range[1], payFilter) }, [payFilter])
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (range) loadData(range[0], range[1], payFilter)
      else { const found = PRESETS.find(pr => pr.label === preset); if (found) { const [from, to] = found.getRange(); loadData(from, to, payFilter) } }
    }, 15000)
    return () => clearInterval(intervalRef.current)
  }, [range, payFilter, preset, loadData])

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', margin: 0 }}>Dashboard</h1>
            {lastRefresh && (
              <p style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>
                Updated {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => { setZCounted(''); setZFloat(''); setZOpen(true) }} className="btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <ClipboardList size={13} />Z-Report
            </button>
            <button onClick={handleRefresh} className="btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <RefreshCw size={13} style={{ transition: 'transform 700ms', transform: spinning ? 'rotate(720deg)' : 'rotate(0deg)' }} />
              Refresh
            </button>
            <select value={payFilter} onChange={e => setPayFilter(e.target.value)} className="input" style={{ padding: '6px 10px', fontSize: 11, width: 'auto' }}>
              <option value="all">All Payments</option>
              <option value="cash">Cash</option>
              <option value="ecocash">EcoCash</option>
              <option value="swipe">Swipe</option>
              <option value="invoice">Invoice</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }} className="no-scrollbar">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.label)}
              className={`cat-chip shrink-0 ${preset === p.label ? 'cat-chip-active' : 'cat-chip-inactive'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ padding: '6px 10px', fontSize: 11, flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--ink-tertiary)', flexShrink: 0 }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ padding: '6px 10px', fontSize: 11, flex: 1 }} />
          <button onClick={applyCustom} className="btn-primary" style={{ padding: '6px 14px', fontSize: 11, flexShrink: 0 }}>Apply</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 80 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: 96, borderRadius: 20, background: 'var(--surface-3)' }} className="animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <KpiCard large title="Total Revenue" value={data.revenue} icon={DollarSign} color="#dc2626" bg="rgba(220,38,38,0.1)" sub={`${data.txCount} transaction${data.txCount !== 1 ? 's' : ''}`} prefix="$" />
              </div>
              <KpiCard title="Transactions" value={data.txCount} icon={ShoppingBag} color="#3b82f6" bg="rgba(59,130,246,0.1)" prefix="" decimals={0} />
              <KpiCard title="Avg Sale" value={data.avgSale} icon={TrendingUp} color="#10b981" bg="rgba(16,185,129,0.1)" prefix="$" />
              {data.noCostPrice === 0 ? (
                <>
                  <KpiCard title="Gross Profit" value={data.grossProfit} icon={TrendingUp} color="#10b981" bg="rgba(16,185,129,0.1)" prefix="$" />
                  <KpiCard title="Margin" value={data.marginPct} icon={TrendingDown} color="#8b5cf6" bg="rgba(139,92,246,0.1)" prefix="" decimals={1} />
                  {data.totalExpenses > 0 && (
                    <>
                      <KpiCard title="Expenses" value={data.totalExpenses} icon={TrendingDown} color="#ef4444" bg="rgba(239,68,68,0.1)" prefix="$" />
                      <KpiCard title="Net Profit" value={data.netProfit} icon={TrendingUp} color={data.netProfit >= 0 ? '#10b981' : '#ef4444'} bg={data.netProfit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'} prefix="$" />
                    </>
                  )}
                </>
              ) : (
                <div style={{ gridColumn: '1 / -1', padding: '10px 14px', borderRadius: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#b45309' }}>Profit hidden — {data.noCostPrice} products missing cost price</span>
                </div>
              )}
            </div>

            {/* 7-day bar chart */}
            {data.last7.some(d => d.value > 0) && (
              <Card>
                <CardTitle title="7-Day Revenue" sub="Daily breakdown" />
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
                  {data.last7.map((d, i) => {
                    const max = Math.max(...data.last7.map(x => x.value)) || 1
                    const h = Math.max((d.value / max) * 54, 3)
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div
                          style={{ width: '100%', height: h, borderRadius: 4, background: d.isToday ? 'var(--brand-600)' : 'rgba(220,38,38,0.2)', transition: 'height 600ms cubic-bezier(0.16,1,0.3,1)' }}
                          title={fmt(d.value)}
                        />
                        <span style={{ fontSize: 8, fontWeight: 700, color: d.isToday ? 'var(--brand-600)' : 'var(--ink-tertiary)' }}>{d.label}</span>
                      </div>
                    )
                  })}
                </div>
                {data.discount > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>Total discounts given</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.discount)}</span>
                  </div>
                )}
              </Card>
            )}

            {/* Payment breakdown */}
            {Object.keys(data.byMethod).length > 0 && (
              <Card>
                <CardTitle title="Payment Methods" sub="Revenue by payment type" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {Object.entries(data.byMethod).map(([method, amount]) => {
                    const cfg = PAY_CONFIG[method] || { color: '#6b7280', bg: 'var(--surface-3)', icon: DollarSign, label: method }
                    return <ProgressRow key={method} label={cfg.label || method} value={amount} total={data.revenue} color={cfg.color} Icon={cfg.icon} />
                  })}
                </div>
              </Card>
            )}

            {/* Top products */}
            {data.topProducts.length > 0 && (
              <Card>
                <CardTitle
                  title="Top Products"
                  sub="By revenue this period"
                  action={navigate && (
                    <button onClick={() => navigate('inventory')} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--brand-600)', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                      View all <ArrowUpRight size={10} />
                    </button>
                  )}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.topProducts.map((p, i) => (
                    <ProductBar key={p.sku} rank={i + 1} name={p.name} revenue={p.revenue} max={data.topProducts[0].revenue} />
                  ))}
                </div>
              </Card>
            )}

            {/* Inventory + customers alerts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div style={{ background: 'var(--surface-1)', border: data.outStock > 0 ? '1px solid rgba(239,68,68,0.22)' : '1px solid var(--surface-border)', borderRadius: 20, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <Package size={15} style={{ color: '#f59e0b' }} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>{data.totalProducts}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2, fontWeight: 500 }}>Products</div>
                {data.lowStock > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={9} />{data.lowStock} low stock</div>}
                {data.outStock > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={9} />{data.outStock} out of stock</div>}
                {data.noCostPrice > 0 && (
                  <div
                    onClick={() => navigate && navigate('inventory')}
                    style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, cursor: navigate ? 'pointer' : 'default' }}
                  >
                    <AlertTriangle size={9} />{data.noCostPrice} missing cost price
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--surface-1)', border: data.pendingCredit > 0 ? '1px solid rgba(245,158,11,0.22)' : '1px solid var(--surface-border)', borderRadius: 20, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <Users size={15} style={{ color: '#8b5cf6' }} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>{data.totalCustomers}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2, fontWeight: 500 }}>Customers</div>
                {data.pendingCredit > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginTop: 6 }}>{fmt(data.pendingCredit)} unsettled</div>}
              </div>
            </div>

            {/* Recent sales */}
            {data.recentSales.length > 0 && (
              <div style={{ background: 'var(--surface-1)', border: '1px solid var(--surface-border)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-primary)' }}>Recent Sales</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 1 }}>Live, refreshes every 15s</div>
                  </div>
                  {navigate && (
                    <button onClick={() => navigate('sales')} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--brand-600)', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                      All <ChevronRight size={11} />
                    </button>
                  )}
                </div>
                {data.recentSales.map((sale, i) => (
                  <div
                    key={sale.id || i}
                    onClick={() => setViewReceipt(sale)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 18px',
                      borderBottom: i < data.recentSales.length - 1 ? '1px solid var(--surface-border)' : 'none',
                      cursor: 'pointer', transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ShoppingBag size={12} style={{ color: 'var(--ink-tertiary)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sale.customer || 'Walk-in'}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>
                        {new Date(sale.createdAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                        {sale.ref && <span style={{ marginLeft: 4, fontFamily: 'monospace' }}>· {sale.ref}</span>}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sale.grandTotal || sale.total || 0)}</div>
                      {sale.payMethod && (
                        <div style={{ fontSize: 9, color: PAY_CONFIG[sale.payMethod]?.color || 'var(--ink-tertiary)', fontWeight: 700, textTransform: 'capitalize', marginTop: 1 }}>{sale.payMethod}</div>
                      )}
                    </div>
                    <ChevronRight size={12} style={{ color: 'var(--ink-tertiary)', opacity: 0.5, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {data.txCount === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink-tertiary)' }}>
                <ShoppingBag size={36} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-secondary)' }}>No sales in this period</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Record sales at the Point of Sale</div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Receipt viewer — tap any Recent Sale row to open */}
      {viewReceipt && (
        <Receipt record={viewReceipt} shop={shopInfo} onClose={() => setViewReceipt(null)} readOnly />
      )}

      {/* Z-Report modal */}
      {zOpen && data && (() => {
        const cash = data.byMethod.cash || 0
        const floatAmt = parseFloat(zFloat) || 0
        const expected = round2(floatAmt + cash)
        const counted  = parseFloat(zCounted) || 0
        const variance = round2(counted - expected)
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}
            onClick={() => setZOpen(false)}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-1)', borderRadius: '24px 24px 0 0', padding: '20px 20px 36px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>Z-Report</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <button onClick={() => setZOpen(false)} style={{ padding: 8, borderRadius: 10, border: '1px solid var(--surface-border)', background: 'var(--surface-2)', cursor: 'pointer' }}>
                  <X size={14} style={{ color: 'var(--ink-tertiary)' }} />
                </button>
              </div>

              <div style={{ background: 'var(--surface-2)', borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Sales Summary</div>
                {Object.entries(PAY_CONFIG).map(([key, cfg]) => {
                  const amt = data.byMethod[key] || 0
                  if (!amt) return null
                  const Icon = cfg.icon
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--surface-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon size={12} style={{ color: cfg.color }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)' }}>{cfg.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(amt)}</span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-primary)' }}>Total Revenue</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--brand-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.revenue)}</span>
                </div>
              </div>

              <div style={{ background: 'var(--surface-2)', borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Cash Reconciliation</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Opening float ($)</label>
                    <input type="number" value={zFloat} onChange={e => setZFloat(e.target.value)} placeholder="0.00"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--surface-border)', background: 'var(--surface-1)', fontSize: 14, color: 'var(--ink-primary)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>Cash sales</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cash)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--surface-border)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>Expected in drawer</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(expected)}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Counted cash ($)</label>
                    <input type="number" value={zCounted} onChange={e => setZCounted(e.target.value)} placeholder="0.00"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--surface-border)', background: 'var(--surface-1)', fontSize: 14, color: 'var(--ink-primary)' }} />
                  </div>
                  {zCounted !== '' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: variance === 0 ? 'rgba(16,185,129,0.08)' : variance > 0 ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>{variance === 0 ? 'Balanced' : variance > 0 ? 'Over' : 'Short'}</span>
                      <span style={{ fontSize: 14, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: variance === 0 ? '#10b981' : variance > 0 ? '#3b82f6' : '#ef4444' }}>
                        {variance > 0 ? '+' : ''}{fmt(variance)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {data.grossProfit > 0 && data.noCostPrice === 0 && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 16, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Profitability</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>Gross Profit</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.grossProfit)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>Margin</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>{data.marginPct}%</span>
                  </div>
                  {data.totalExpenses > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--surface-border)', marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>Expenses</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>−{fmt(data.totalExpenses)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 2px' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-primary)' }}>Net Profit</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: data.netProfit >= 0 ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.netProfit)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button onClick={() => window.print()} style={{ width: '100%', padding: '12px', borderRadius: 14, background: 'var(--brand-600)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Printer size={14} />Print Z-Report
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
