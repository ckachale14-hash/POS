import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search, Plus, Edit2, Trash2, Users, Phone, Mail, X,
  CreditCard, ReceiptText, ChevronRight, ArrowLeft,
  TrendingUp, DollarSign, Clock, CheckCircle2, RefreshCw
} from 'lucide-react'
import { db, logAudit } from '../lib/db'
import { fmt, formatDate, round2 } from '../lib/utils'

const EMPTY = {
  name: '', phone: '', email: '', address: '',
  creditLimit: '', balance: 0, isTradeAccount: false, notes: '',
}

const HISTORY_PRESETS = [
  { label: 'All Time', days: -1 },
  { label: 'This Month', days: 30 },
  { label: 'This Year', days: 365 },
]

export default function Customers({ user, navigate }) {
  const [customers, setCustomers]     = useState([])
  const [search, setSearch]           = useState('')
  const [editModal, setEditModal]     = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [toast, setToast]             = useState('')
  const [detailCustomer, setDetailCustomer] = useState(null)
  const [purchases, setPurchases]     = useState([])
  const [creditTxs, setCreditTxs]     = useState([])
  const [historyPreset, setHistoryPreset] = useState('All Time')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailTab, setDetailTab]     = useState('history') // 'history' | 'credit'

  const showToast = (msg, type = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(''), 2500) }
  const load = async () => { const c = await db.customers.toArray(); setCustomers(c) }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
    )
  }, [customers, search])

  const save = async (data) => {
    const { id, ...rest } = data
    const payload = {
      ...rest,
      creditLimit: parseFloat(rest.creditLimit) || 0,
      balance: parseFloat(rest.balance) || 0,
      localId: id ? (data.localId || String(id)) : `CUST-${Date.now()}`,
    }
    if (id) {
      await db.customers.update(id, { ...payload, syncedAt: null })
      showToast('Customer updated', 'success')
    } else {
      await db.customers.add({ ...payload, createdAt: new Date().toISOString(), syncedAt: null })
      showToast('Customer added', 'success')
    }
    setEditModal(null)
    await load()
  }

  const del = async (c) => {
    await db.customers.delete(c.id)
    setDeleteConfirm(null)
    showToast('Customer deleted')
    await load()
  }

  const refreshDetailInterval = useRef(null)

  const loadDetailData = useCallback(async (c) => {
    const sales = await db.sales
      .filter(s => String(s.customerId) === String(c.id) || String(s.customerId) === c.localId)
      .toArray()
    setPurchases(sales.filter(s => s.status === 'completed').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))

    const txs = await db.creditTransactions
      .filter(t => String(t.customerId) === String(c.id) || String(t.customerId) === c.localId || t.customerName === c.name)
      .toArray()
    setCreditTxs(txs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
  }, [])

  const openDetail = async (c) => {
    setDetailCustomer(c)
    setLoadingDetail(true)
    await loadDetailData(c)
    setLoadingDetail(false)

    // Real-time refresh every 15s while detail is open
    if (refreshDetailInterval.current) clearInterval(refreshDetailInterval.current)
    refreshDetailInterval.current = setInterval(() => loadDetailData(c), 15000)
  }

  // Clear interval when closing detail
  useEffect(() => {
    if (!detailCustomer && refreshDetailInterval.current) {
      clearInterval(refreshDetailInterval.current)
      refreshDetailInterval.current = null
    }
  }, [detailCustomer])

  const filteredPurchases = useMemo(() => {
    if (historyPreset === 'All Time') return purchases
    const days = HISTORY_PRESETS.find(p => p.label === historyPreset)?.days || -1
    if (days === -1) return purchases
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    return purchases.filter(s => new Date(s.createdAt) >= cutoff)
  }, [purchases, historyPreset])

  const customerStats = useMemo(() => {
    if (!filteredPurchases.length) return null
    const totalSpent = filteredPurchases.reduce((a, s) => a + (s.grandTotal || s.total || 0), 0)
    const avgSale    = round2(totalSpent / filteredPurchases.length)
    const lastSale   = filteredPurchases[0]?.createdAt
    const unsettledChange  = creditTxs.filter(t => t.type === 'change_owed' && !t.settled).reduce((a, t) => a + t.amount, 0)
    const unsettledCredit  = creditTxs.filter(t => t.type === 'credit_owed' && !t.settled).reduce((a, t) => a + t.amount, 0)
    return { totalSpent, avgSale, lastSale, unsettledChange, unsettledCredit }
  }, [filteredPurchases, creditTxs])

  const tradeCount = customers.filter(c => c.isTradeAccount).length

  // ── Customer detail view ──
  if (detailCustomer) {
    const stats = customerStats
    return (
      <div className="page-wrap">
        {/* Detail header */}
        <div className="section-header">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setDetailCustomer(null)} className="btn-ghost p-1.5">
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1">
              <h1 className="font-black text-gray-900">{detailCustomer.name}</h1>
              <p className="text-xs text-gray-400">
                {detailCustomer.phone && `${detailCustomer.phone} · `}
                {detailCustomer.isTradeAccount ? 'Trade Account' : 'Retail Customer'}
              </p>
            </div>
            <button onClick={() => setEditModal({ ...detailCustomer })} className="btn-secondary py-1.5 px-3 text-xs">
              <Edit2 size={12} />Edit
            </button>
          </div>

          {/* History period selector */}
          <div className="flex gap-1.5">
            {HISTORY_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setHistoryPreset(p.label)}
                className={`cat-chip ${historyPreset === p.label ? 'cat-chip-active' : 'cat-chip-inactive'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loadingDetail ? (
          <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-3 p-4 pb-0">
                <div className="stat-card">
                  <p className="text-[10px] text-gray-400">Total Spent</p>
                  <p className="text-xl font-black text-gray-900">{fmt(stats.totalSpent)}</p>
                  <p className="text-[10px] text-gray-400">{filteredPurchases.length} purchase{filteredPurchases.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="stat-card">
                  <p className="text-[10px] text-gray-400">Avg Purchase</p>
                  <p className="text-xl font-black text-gray-900">{fmt(stats.avgSale)}</p>
                  {stats.lastSale && <p className="text-[10px] text-gray-400">Last: {new Date(stats.lastSale).toLocaleDateString('en-GB')}</p>}
                </div>
                {stats.unsettledChange > 0 && (
                  <div className="stat-card" style={{ borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)" }}>
                    <p className="text-[10px] font-semibold" style={{color:"#fbbf24"}}>Change We Owe</p>
                    <p className="text-xl font-black" style={{color:"#fbbf24"}}>{fmt(stats.unsettledChange)}</p>
                  </div>
                )}
                {stats.unsettledCredit > 0 && (
                  <div className="stat-card" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }}>
                    <p className="text-[10px] font-semibold" style={{color:"#f87171"}}>Credit Owed</p>
                    <p className="text-xl font-black" style={{color:"#f87171"}}>{fmt(stats.unsettledCredit)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="tab-bar mx-4 mt-4 rounded-xl overflow-hidden border border-gray-100 flex shrink-0">
              <button
                className={`tab-item flex-1 justify-center ${detailTab === 'history' ? 'tab-item-active' : 'tab-item-inactive'}`}
                onClick={() => setDetailTab('history')}
              >
                <ReceiptText size={13} />Purchases
              </button>
              <button
                className={`tab-item flex-1 justify-center ${detailTab === 'credit' ? 'tab-item-active' : 'tab-item-inactive'}`}
                onClick={() => setDetailTab('credit')}
              >
                <CreditCard size={13} />Credit & Change
              </button>
            </div>

            <div className="p-4 pt-2">
              {detailTab === 'history' && (
                filteredPurchases.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <ReceiptText size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No purchases in this period</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPurchases.map((s, i) => (
                      <div key={i} className="card p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-xs font-bold text-gray-900 font-mono">{s.ref || s.id}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(s.createdAt)} · {s.cashier}</p>
                          </div>
                          <span className="text-base font-black text-gray-900">{fmt(s.grandTotal || s.total || 0)}</span>
                        </div>
                        <div className="space-y-0.5">
                          {(s.items || []).slice(0, 3).map((item, j) => (
                            <p key={j} className="text-[10px] text-gray-500">
                              {item.name} · {item.label} × {item.qty} = {fmt(item.unitPrice * item.qty)}
                            </p>
                          ))}
                          {(s.items || []).length > 3 && (
                            <p className="text-[10px] text-gray-400">+{s.items.length - 3} more items</p>
                          )}
                        </div>
                        {s.payMethod && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className="badge badge-info text-[9px]">{s.payMethod}</span>
                            {s.changeOwed > 0 && <span className="badge badge-warning text-[9px]">Change: {fmt(s.changeOwed)}</span>}
                            {s.amountOwing > 0 && <span className="badge badge-danger text-[9px]">Owing: {fmt(s.amountOwing)}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailTab === 'credit' && (
                creditTxs.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <CreditCard size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No credit or change records</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {creditTxs.map((tx, i) => {
                      const typeColors = {
                        change_owed:  'bg-amber-50 border-amber-200',
                        change_paid:  'bg-emerald-50 border-emerald-200',
                        credit_owed:  'bg-red-50 border-red-200',
                        credit_paid:  'bg-blue-50 border-blue-200',
                      }
                      const typeLabels = {
                        change_owed: 'Change Owed', change_paid: 'Change Paid',
                        credit_owed: 'Credit Owed', credit_paid: 'Credit Paid',
                      }
                      return (
                        <div key={i} className={`card p-3 border ${typeColors[tx.type] || ''}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs font-bold text-gray-900">{typeLabels[tx.type] || tx.type}</p>
                              <p className="text-[10px] text-gray-400">{formatDate(tx.createdAt)}</p>
                              {tx.note && <p className="text-[10px] text-gray-500 mt-0.5">{tx.note}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-base font-black text-gray-900">{fmt(tx.amount)}</p>
                              {tx.settled
                                ? <span className="badge-success text-[9px]"><CheckCircle2 size={8} />Settled</span>
                                : <span className="badge-warning text-[9px]"><Clock size={8} />Pending</span>
                              }
                            </div>
                          </div>
                          {!tx.settled && (tx.amountPaid || 0) > 0 && (
                            <div className="mt-1 text-[10px] text-emerald-600">
                              Paid: {fmt(tx.amountPaid)} · Remaining: {fmt(round2(tx.amount - tx.amountPaid))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Edit modal shared with main view */}
        {editModal && renderEditModal(editModal, setEditModal, save)}
        {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-info'}`}>{toast.msg}</div>}
      </div>
    )
  }

  function renderEditModal(modal, setModal, onSave) {
    return (
      <div className="modal-overlay animate-fade-in" onClick={() => setModal(null)}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
            <p className="font-bold text-gray-900">{modal.id ? 'Edit Customer' : 'Add Customer'}</p>
            <button onClick={() => setModal(null)}><X size={17} className="text-gray-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} className="input text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={modal.phone || ''} onChange={e => setModal(m => ({ ...m, phone: e.target.value }))} className="input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={modal.email || ''} onChange={e => setModal(m => ({ ...m, email: e.target.value }))} className="input text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input value={modal.address || ''} onChange={e => setModal(m => ({ ...m, address: e.target.value }))} className="input text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Credit Limit ($)</label>
                <input type="number" value={modal.creditLimit || ''} onChange={e => setModal(m => ({ ...m, creditLimit: e.target.value }))} className="input text-sm" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <button
                  onClick={() => setModal(m => ({ ...m, isTradeAccount: !m.isTradeAccount }))}
                  className={`toggle ${modal.isTradeAccount ? 'toggle-on' : 'toggle-off'}`}
                >
                  <span className={`toggle-thumb ${modal.isTradeAccount ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
                </button>
                <span className="text-xs font-medium text-gray-700">Trade Account</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={modal.notes || ''} onChange={e => setModal(m => ({ ...m, notes: e.target.value }))} rows={2} className="input text-sm resize-none" />
            </div>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2 shrink-0">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={() => onSave(modal)} disabled={!modal.name} className="btn-primary flex-1 disabled:opacity-40">
              Save Customer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Customer list view ──
  return (
    <div className="page-wrap">
      <div className="section-header">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-black" style={{color:"var(--ink-primary)"}}>Customers</h1>
            <p className="text-xs" style={{color:"var(--ink-tertiary)"}}>{customers.length} customers · {tradeCount} trade accounts</p>
          </div>
          <button onClick={() => setEditModal({ ...EMPTY })} className="btn-primary py-2 px-3 text-xs gap-1.5">
            <Plus size={13} />Add
          </button>
        </div>
        <div className="search-input-wrap">
          <Search className="search-icon" size={13} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or email…" className="input py-2 text-xs w-full" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Users size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No customers yet</p>
          </div>
        ) : (
          filtered.map(c => {
            const unsettled = 0 // Would need creditTxs loaded to show here
            return (
              <button
                key={c.id}
                onClick={() => openDetail(c)}
                className="card w-full p-3.5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98] group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 uppercase" style={{background:"rgba(220,38,38,0.15)",color:"var(--brand-400)"}}>
                    {c.name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm truncate">{c.name}</p>
                      {c.isTradeAccount && <span className="badge badge-brand text-[9px]">Trade</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.phone && <p className="text-[10px] text-gray-400 flex items-center gap-1"><Phone size={9} />{c.phone}</p>}
                      {c.email && <p className="text-[10px] text-gray-400 truncate">{c.email}</p>}
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 transition shrink-0" />
                </div>
              </button>
            )
          })
        )}
      </div>

      {editModal && renderEditModal(editModal, setEditModal, save)}

      {deleteConfirm && (
        <div className="modal-overlay animate-fade-in" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <p className="font-bold text-gray-900 mb-1">Delete Customer?</p>
              <p className="text-sm text-gray-500 mb-5">{deleteConfirm.name}</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => del(deleteConfirm)} className="btn-danger flex-1">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-info'}`}>{toast.msg}</div>}
    </div>
  )
}
