import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  CreditCard, Check, X, Search, DollarSign,
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, RefreshCw
} from 'lucide-react'
import { db, saveCreditTransaction, getCreditTransactions } from '../lib/db'
import { fmt, formatDate, round2 } from '../lib/utils'

const TYPE_CONFIG = {
  change_owed:  { label: 'Change Owed',  color: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24' }, icon: ArrowUpRight,  desc: 'We owe change to customer' },
  change_paid:  { label: 'Change Paid',  color: { bg: 'rgba(16,185,129,0.12)', text: '#34d399' }, icon: Check,         desc: 'Change given to customer' },
  credit_owed:  { label: 'Credit Owed',  color: { bg: 'rgba(239,68,68,0.12)',  text: '#f87171' }, icon: ArrowDownLeft, desc: 'Customer owes us money' },
  credit_paid:  { label: 'Credit Paid',  color: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' }, icon: Check,         desc: 'Customer paid credit' },
}

export default function ChangeCredit({ user }) {
  const [txs, setTxs]               = useState([])
  const [customers, setCustomers]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [settledFilter, setSettledFilter] = useState('unsettled')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [payModal, setPayModal]     = useState(null)
  const [payAmount, setPayAmount]   = useState('')
  const [payNote, setPayNote]       = useState('')
  const [toast, setToast]           = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const intervalRef = useRef(null)

  const showToast = (msg, type = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    const all = await db.creditTransactions.orderBy('createdAt').reverse().toArray()
    setTxs(all)
    const c = await db.customers.toArray()
    setCustomers(c)
    setLoading(false)
    setLastRefresh(new Date())
  }, [])

  useEffect(() => { load() }, [load])

  // Real-time refresh every 15 seconds
  useEffect(() => {
    intervalRef.current = setInterval(load, 15000)
    return () => clearInterval(intervalRef.current)
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return txs.filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false
      if (settledFilter === 'settled' && !tx.settled) return false
      if (settledFilter === 'unsettled' && tx.settled) return false
      if (q && !(tx.customerName || '').toLowerCase().includes(q) && !(tx.saleRef || '').toLowerCase().includes(q)) return false
      const d = new Date(tx.createdAt)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [txs, typeFilter, settledFilter, search, dateFrom, dateTo])

  const summary = useMemo(() => {
    const all = txs.filter(t => !t.settled)
    return {
      changeOwed:     all.filter(t => t.type === 'change_owed').reduce((a, t) => a + t.amount, 0),
      creditOwed:     all.filter(t => t.type === 'credit_owed').reduce((a, t) => a + t.amount, 0),
      totalUnsettled: all.length,
    }
  }, [txs])

  const recordPayment = async () => {
    if (!payModal) return
    const amount = parseFloat(payAmount) || 0
    if (amount <= 0) { showToast('Enter a valid amount', 'error'); return }
    const remaining = round2(payModal.amount - (payModal.amountPaid || 0) - amount)
    if (remaining <= 0) {
      await db.creditTransactions.update(payModal.id, {
        settled: true, settledAt: new Date().toISOString(),
        amountPaid: (payModal.amountPaid || 0) + amount,
        settledBy: user?.name,
        note: payModal.note ? `${payModal.note} | Settled: ${payNote}` : `Settled: ${payNote}`,
        syncedAt: null,
      })
      showToast('Marked as settled', 'success')
    } else {
      await db.creditTransactions.update(payModal.id, {
        amountPaid: (payModal.amountPaid || 0) + amount,
        note: payModal.note ? `${payModal.note} | Partial: $${amount} - ${payNote}` : `Partial: $${amount} - ${payNote}`,
        syncedAt: null,
      })
      showToast(`Recorded ${fmt(amount)} payment. Remaining: ${fmt(remaining)}`, 'info')
    }
    const counterType = payModal.type === 'change_owed' ? 'change_paid' : 'credit_paid'
    await saveCreditTransaction({
      saleRef: payModal.saleRef, customerId: payModal.customerId, customerName: payModal.customerName,
      type: counterType, amount, note: payNote || `Payment toward ${payModal.saleRef}`,
      cashier: user?.name, settled: true, settledAt: new Date().toISOString(),
    })
    setPayModal(null); setPayAmount(''); setPayNote('')
    await load()
  }

  const markFullySettled = async (tx) => {
    await db.creditTransactions.update(tx.id, {
      settled: true, settledAt: new Date().toISOString(),
      amountPaid: tx.amount, settledBy: user?.name, syncedAt: null,
    })
    showToast('Marked as fully settled', 'success')
    await load()
  }

  const ink = { color: 'var(--ink-primary)' }

  return (
    <div className="page-wrap">
      <div className="section-header">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-black text-base" style={ink}>Change & Credit</h1>
            <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--ink-tertiary)' }}>
              {summary.totalUnsettled} unsettled
              {lastRefresh && ` · ${lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            </p>
          </div>
          <button onClick={load} className="btn-ghost p-2" title="Refresh"><RefreshCw size={14} /></button>
        </div>

        {/* Summary — double-bezel cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'We Owe Customers', value: summary.changeOwed, sub: 'change to give', color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)' },
            { label: 'Customers Owe Us', value: summary.creditOwed, sub: 'credit outstanding', color: '#dc2626', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.22)' },
          ].map(({ label, value, sub, color, bg, border }) => (
            <div key={label} style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', padding: 4, borderRadius: 18 }}>
              <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 15, padding: '12px 14px', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                <p style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: '0 0 3px' }}>{fmt(value)}</p>
                <p style={{ fontSize: 9, color, opacity: 0.7, margin: 0 }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 flex-wrap mb-2">
          {['all','unsettled','settled'].map(f => (
            <button key={f} onClick={() => setSettledFilter(f)}
              className={`cat-chip ${settledFilter === f ? 'cat-chip-active' : 'cat-chip-inactive'} capitalize`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <div className="search-input-wrap flex-1">
            <Search className="search-icon" size={13} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer, ref…" className="input py-1.5 text-xs" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input py-1.5 text-xs shrink-0">
            <option value="all">All Types</option>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--ink-tertiary)' }}>
            <CreditCard size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-semibold">No records found</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filtered.map(tx => {
              const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.credit_owed
              const Icon = cfg.icon
              const amountPaid = tx.amountPaid || 0
              const remaining  = round2(Math.max(0, tx.amount - amountPaid))
              return (
                <div key={tx.id} className="card p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.color.bg }}>
                    <Icon size={14} style={{ color: cfg.color.text }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold truncate" style={ink}>{tx.customerName || 'Unknown'}</span>
                      <span className="badge text-[9px]" style={cfg.color}>{cfg.label}</span>
                      {tx.settled && <span className="badge text-[9px]" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>Settled</span>}
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>
                      {tx.saleRef} · {formatDate(tx.createdAt)}
                    </p>
                    {tx.note && <p className="text-[10px] italic mt-0.5" style={{ color: 'var(--ink-tertiary)' }}>{tx.note}</p>}
                    {!tx.settled && amountPaid > 0 && (
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#60a5fa' }}>
                        Paid: {fmt(amountPaid)} · Remaining: {fmt(remaining)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-sm font-black" style={{ color: cfg.color.text }}>{fmt(tx.amount)}</span>
                    {!tx.settled && (tx.type === 'change_owed' || tx.type === 'credit_owed') && (
                      <div className="flex gap-1">
                        <button onClick={() => { setPayModal(tx); setPayAmount(String(remaining || tx.amount)) }}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold transition"
                          style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                          Record
                        </button>
                        <button onClick={() => markFullySettled(tx)}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold transition"
                          style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                          Settle
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pay modal */}
      {payModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setPayModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-border)' }}>
              <p className="font-bold text-sm" style={ink}>Record Payment</p>
              <button onClick={() => setPayModal(null)} className="btn-ghost p-1"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-xl p-3" style={{ background: 'var(--surface-3)' }}>
                <p className="text-xs font-semibold" style={ink}>{payModal.customerName}</p>
                <p className="text-xs" style={{ color: 'var(--ink-tertiary)' }}>{payModal.saleRef} · Total: {fmt(payModal.amount)}</p>
                {(payModal.amountPaid || 0) > 0 && <p className="text-xs" style={{ color: '#60a5fa' }}>Already paid: {fmt(payModal.amountPaid)}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-secondary)' }}>Amount</label>
                <input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  autoFocus className="input text-lg font-bold" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-secondary)' }}>Note (optional)</label>
                <input value={payNote} onChange={e => setPayNote(e.target.value)} className="input text-sm" placeholder="Payment note…" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setPayModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={recordPayment} className="btn-primary flex-1">Record Payment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type || 'info'}`}>{toast.msg}</div>
      )}
    </div>
  )
}
