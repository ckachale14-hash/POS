import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, X, Save, Filter, Receipt } from 'lucide-react'
import { db } from '../lib/db'
import { fmt, round2 } from '../lib/utils'

const CATEGORIES = [
  'Rent', 'Salaries', 'Utilities', 'Fuel', 'Transport',
  'Maintenance', 'Advertising', 'Supplies', 'Bank Charges', 'Other',
]

const EMPTY = { category: CATEGORIES[0], amount: '', date: new Date().toISOString().slice(0, 10), description: '' }

function ExpenseModal({ expense, onSave, onClose }) {
  const [form, setForm] = useState(expense ? { ...expense, date: expense.date?.slice(0, 10) || EMPTY.date } : { ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr('Enter a valid amount'); return }
    if (!form.date) { setErr('Date is required'); return }
    setBusy(true)
    try {
      const payload = { category: form.category, amount: round2(amount), date: form.date, description: form.description.trim() }
      if (form.id) {
        await db.expenses.update(form.id, payload)
      } else {
        await db.expenses.add(payload)
      }
      onSave()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-1)', borderRadius: '24px 24px 0 0', padding: '20px 20px 36px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>
            {form.id ? 'Edit Expense' : 'New Expense'}
          </div>
          <button onClick={onClose} style={{ padding: 8, borderRadius: 10, border: '1px solid var(--surface-border)', background: 'var(--surface-2)', cursor: 'pointer' }}>
            <X size={14} style={{ color: 'var(--ink-tertiary)' }} />
          </button>
        </div>

        {err && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: 11, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className="input" style={{ width: '100%' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Amount ($) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="0.00" className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Date *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="e.g. May rent payment" className="input" style={{ width: '100%' }} />
          </div>
        </div>

        <button onClick={save} disabled={busy} className="btn-primary" style={{ width: '100%', marginTop: 16 }}>
          <Save size={14} />{busy ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </div>
  )
}

const PRESETS = [
  { label: 'Today',      days: 0 },
  { label: 'This Week',  days: 6 },
  { label: 'This Month', days: 29 },
  { label: 'All Time',   days: 9999 },
]

export default function Expenses({ user }) {
  const [expenses, setExpenses]   = useState([])
  const [modal, setModal]         = useState(null)
  const [deleteId, setDeleteId]   = useState(null)
  const [preset, setPreset]       = useState('This Month')
  const [catFilter, setCatFilter] = useState('All')
  const [toast, setToast]         = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    const rows = await db.expenses.toArray()
    setExpenses(rows.sort((a, b) => b.date.localeCompare(a.date)))
  }, [])

  useEffect(() => { load() }, [load])

  const getDateFrom = () => {
    const p = PRESETS.find(p => p.label === preset)
    if (!p || p.days >= 9999) return null
    const d = new Date(); d.setDate(d.getDate() - p.days); d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }

  const filtered = expenses.filter(e => {
    const from = getDateFrom()
    if (from && e.date < from) return false
    if (catFilter !== 'All' && e.category !== catFilter) return false
    return true
  })

  const total = round2(filtered.reduce((s, e) => s + (e.amount || 0), 0))

  const byCategory = {}
  filtered.forEach(e => { byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount) })

  const handleSave = async () => {
    await load()
    setModal(null)
    showToast(modal?.id ? 'Expense updated' : 'Expense recorded')
  }

  const handleDelete = async () => {
    await db.expenses.delete(deleteId)
    setDeleteId(null)
    await load()
    showToast('Expense deleted')
  }

  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h1 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', margin: 0 }}>Expenses</h1>
          {canEdit && (
            <button onClick={() => setModal('new')} className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} />Add
            </button>
          )}
        </div>

        {/* Preset tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }} className="no-scrollbar">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => setPreset(p.label)}
              className={`cat-chip shrink-0 ${preset === p.label ? 'cat-chip-active' : 'cat-chip-inactive'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="no-scrollbar">
          {['All', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`cat-chip shrink-0 ${catFilter === c ? 'cat-chip-active' : 'cat-chip-inactive'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div style={{ padding: '10px 16px', background: 'var(--surface-1)', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{filtered.length} expense{filtered.length !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#ef4444', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--ink-tertiary)' }}>
            <Receipt size={36} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-secondary)' }}>No expenses recorded</div>
            {canEdit && <div style={{ fontSize: 11, marginTop: 4 }}>Tap Add to record your first expense</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(e => (
              <div key={e.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--surface-border)', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Receipt size={15} style={{ color: '#ef4444' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-primary)' }}>{e.category}</div>
                  {e.description && <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</div>}
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)}</div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => setModal(e)} style={{ padding: '4px 6px', borderRadius: 7, border: '1px solid var(--surface-border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 10, color: 'var(--ink-secondary)' }}>Edit</button>
                      <button onClick={() => setDeleteId(e.id)} style={{ padding: '4px 6px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', cursor: 'pointer', fontSize: 10, color: '#ef4444' }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <ExpenseModal
          expense={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface-1)', borderRadius: 20, padding: 24, maxWidth: 320, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-primary)', marginBottom: 8 }}>Delete expense?</div>
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleDelete} className="btn-danger" style={{ flex: 1 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>}
    </div>
  )
}
