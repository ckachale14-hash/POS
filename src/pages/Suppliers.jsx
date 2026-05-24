import React, { useState, useEffect, useCallback } from 'react'
import { Truck, Plus, Edit2, Trash2, X, Save, Search, Phone, Mail, MapPin, FileText } from 'lucide-react'
import { db } from '../lib/db'

const EMPTY = { name: '', phone: '', email: '', address: '', notes: '' }

function SupplierModal({ supplier, onSave, onClose }) {
  const [form, setForm] = useState(supplier ? { ...supplier } : { ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setErr('Supplier name is required'); return }
    setBusy(true)
    try {
      if (form.id) {
        await db.suppliers.update(form.id, { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), notes: form.notes.trim() })
      } else {
        await db.suppliers.add({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), notes: form.notes.trim() })
      }
      onSave()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-1)', borderRadius: '24px 24px 0 0', padding: '20px 20px 36px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>
            {form.id ? 'Edit Supplier' : 'New Supplier'}
          </div>
          <button onClick={onClose} style={{ padding: 8, borderRadius: 10, border: '1px solid var(--surface-border)', background: 'var(--surface-2)', cursor: 'pointer' }}>
            <X size={14} style={{ color: 'var(--ink-tertiary)' }} />
          </button>
        </div>

        {err && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: 11, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Supplier Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. ABC Auto Parts" className="input" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+263 77 …" className="input" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="orders@…" className="input" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, City" className="input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Payment terms, lead time…" rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 12, border: '1px solid var(--surface-border)', background: 'var(--surface-0)', fontSize: 13, color: 'var(--ink-primary)', resize: 'vertical' }} />
          </div>
        </div>

        <button onClick={save} disabled={busy} className="btn-primary" style={{ width: '100%', marginTop: 16 }}>
          <Save size={14} />{busy ? 'Saving…' : 'Save Supplier'}
        </button>
      </div>
    </div>
  )
}

export default function Suppliers({ user }) {
  const [suppliers, setSuppliers]   = useState([])
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState(null) // null | 'add' | supplier object
  const [deleteId, setDeleteId]     = useState(null)
  const [toast, setToast]           = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    const rows = await db.suppliers.toArray()
    setSuppliers(rows.sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    await load()
    setModal(null)
    showToast(modal?.id ? 'Supplier updated' : 'Supplier added')
  }

  const handleDelete = async () => {
    await db.suppliers.delete(deleteId)
    setDeleteId(null)
    await load()
    showToast('Supplier deleted')
  }

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone && s.phone.includes(search)) ||
    (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
  )

  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h1 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', margin: 0 }}>Suppliers</h1>
          {canEdit && (
            <button onClick={() => setModal('add')} className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} />Add
            </button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…"
            className="input" style={{ width: '100%', paddingLeft: 32 }} />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 80px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--ink-tertiary)' }}>
            <Truck size={36} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-secondary)' }}>{search ? 'No matches' : 'No suppliers yet'}</div>
            {!search && canEdit && <div style={{ fontSize: 11, marginTop: 4 }}>Tap Add to create your first supplier</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
            {filtered.map(s => (
              <div key={s.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--surface-border)', borderRadius: 18, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-primary)', marginBottom: 6 }}>{s.name}</div>
                    {s.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Phone size={10} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>{s.phone}</span>
                      </div>
                    )}
                    {s.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Mail size={10} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--ink-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
                      </div>
                    )}
                    {s.address && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <MapPin size={10} style={{ color: 'var(--ink-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>{s.address}</span>
                      </div>
                    )}
                    {s.notes && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
                        <FileText size={10} style={{ color: 'var(--ink-tertiary)', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 10, color: 'var(--ink-tertiary)', lineHeight: 1.4 }}>{s.notes}</span>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setModal(s)} style={{ padding: '6px 8px', borderRadius: 9, border: '1px solid var(--surface-border)', background: 'var(--surface-2)', cursor: 'pointer' }}>
                        <Edit2 size={12} style={{ color: 'var(--ink-secondary)' }} />
                      </button>
                      <button onClick={() => setDeleteId(s.id)} style={{ padding: '6px 8px', borderRadius: 9, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', cursor: 'pointer' }}>
                        <Trash2 size={12} style={{ color: '#ef4444' }} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <SupplierModal
          supplier={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface-1)', borderRadius: 20, padding: 24, maxWidth: 320, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink-primary)', marginBottom: 8 }}>Delete supplier?</div>
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleDelete} className="btn-danger" style={{ flex: 1 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>
      )}
    </div>
  )
}
