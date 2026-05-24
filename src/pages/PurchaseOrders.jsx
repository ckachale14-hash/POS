import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ShoppingCart, Plus, X, Save, Search, ChevronRight,
  Send, PackageCheck, Ban, Edit2, Truck, Package, Printer, Box,
} from 'lucide-react'
import { db, createPurchaseOrder, updatePurchaseOrder, receivePurchaseOrder } from '../lib/db'
import { fmt, round2 } from '../lib/utils'
import { printPurchaseOrder } from '../lib/printer'
import { getSetting } from '../lib/db'

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:     { label: 'Draft',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  sent:      { label: 'Sent',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  received:  { label: 'Received',  color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 20 }}>
      {cfg.label}
    </span>
  )
}

function SheetModal({ title, subtitle, onClose, children, footer }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-1)', borderRadius: '24px 24px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--surface-border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ padding: 8, borderRadius: 10, border: '1px solid var(--surface-border)', background: 'var(--surface-2)', cursor: 'pointer' }}>
            <X size={14} style={{ color: 'var(--ink-tertiary)' }} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: '12px 20px 32px', borderTop: '1px solid var(--surface-border)', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create PO modal ────────────────────────────────────────────────────────
function CreateModal({ suppliers, products, onSave, onClose }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '')
  const [items, setItems]           = useState([])
  const [notes, setNotes]           = useState('')
  const [search, setSearch]         = useState('')
  const [busy, setBusy]             = useState(false)
  const [err, setErr]               = useState('')

  const supplier = suppliers.find(s => s.id === Number(supplierId))

  const filteredProducts = useMemo(() =>
    products.filter(p => p.active &&
      (search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    ).slice(0, 30),
  [products, search])

  const addItem = (p) => {
    setItems(prev => {
      if (prev.find(i => i.sku === p.sku)) return prev
      return [...prev, { sku: p.sku, name: p.name, qty: 1, unitCost: p.costPrice || '' }]
    })
    setSearch('')
  }

  const updateItem = (sku, field, val) => setItems(prev => prev.map(i => i.sku === sku ? { ...i, [field]: val } : i))
  const removeItem = (sku) => setItems(prev => prev.filter(i => i.sku !== sku))

  const orderTotal = round2(items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitCost) || 0), 0))

  const save = async () => {
    if (!supplierId) { setErr('Select a supplier'); return }
    if (items.length === 0) { setErr('Add at least one item'); return }
    const invalid = items.find(i => !(parseFloat(i.qty) > 0))
    if (invalid) { setErr(`Qty must be > 0 for ${invalid.name}`); return }
    setBusy(true)
    try {
      await createPurchaseOrder({
        supplierId: Number(supplierId),
        supplierName: supplier?.name || '',
        items: items.map(i => ({ ...i, qty: parseFloat(i.qty), unitCost: parseFloat(i.unitCost) || 0 })),
        notes,
      })
      onSave()
    } finally { setBusy(false) }
  }

  return (
    <SheetModal title="New Purchase Order" onClose={onClose}
      footer={
        <button onClick={save} disabled={busy} className="btn-primary" style={{ width: '100%' }}>
          <Save size={14} />{busy ? 'Creating…' : 'Create Draft PO'}
        </button>
      }
    >
      {err && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: 11, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Supplier */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Supplier *</label>
          {suppliers.length === 0 ? (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: 11 }}>No suppliers yet — add one in the Suppliers page first.</div>
          ) : (
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input" style={{ width: '100%' }}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {/* Product search */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Add Products</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-tertiary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or SKU…"
              className="input" style={{ width: '100%', paddingLeft: 32 }} />
          </div>
          {search && (
            <div style={{ marginTop: 4, border: '1px solid var(--surface-border)', borderRadius: 12, background: 'var(--surface-1)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ink-tertiary)' }}>No products found</div>
              ) : filteredProducts.map(p => (
                <button key={p.sku} onClick={() => addItem(p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', borderBottom: '1px solid var(--surface-border)', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{p.sku}</div>
                  </div>
                  <Plus size={14} style={{ color: 'var(--brand-600)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        {items.length > 0 && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 6 }}>Order Items ({items.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(item => (
                <div key={item.sku} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{item.sku}</div>
                    </div>
                    <button onClick={() => removeItem(item.sku)} style={{ padding: 4, cursor: 'pointer', color: '#ef4444' }}><X size={13} /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 3 }}>Qty (units)</label>
                      <input type="number" min="1" value={item.qty}
                        onChange={e => updateItem(item.sku, 'qty', e.target.value)}
                        className="input" style={{ width: '100%', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 3 }}>Unit Cost ($)</label>
                      <input type="number" min="0" step="0.01" value={item.unitCost}
                        onChange={e => updateItem(item.sku, 'unitCost', e.target.value)}
                        className="input" style={{ width: '100%', fontSize: 13 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 6, textAlign: 'right' }}>
                    Line total: <strong style={{ color: 'var(--ink-primary)' }}>{fmt((parseFloat(item.qty) || 0) * (parseFloat(item.unitCost) || 0))}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '1px solid var(--surface-border)', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>Order Total</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--brand-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(orderTotal)}</span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 4 }}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery date, special instructions…" rows={2}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 12, border: '1px solid var(--surface-border)', background: 'var(--surface-0)', fontSize: 13, color: 'var(--ink-primary)', resize: 'none' }} />
        </div>
      </div>
    </SheetModal>
  )
}

// ── Receive stock modal ────────────────────────────────────────────────────
function ReceiveModal({ po, user, products, onDone, onClose }) {
  const [received, setReceived] = useState(
    (po.items || []).map(i => ({ ...i, receivedQty: i.qty }))
  )
  const [boxMode, setBoxMode] = useState(false)
  const [busy, setBusy] = useState(false)

  const setQty = (sku, val) => setReceived(prev => prev.map(i => i.sku === sku ? { ...i, receivedQty: val } : i))

  const getBoxSize = (sku) => products.find(p => p.sku === sku)?.boxSize || 1

  const confirm = async () => {
    setBusy(true)
    try {
      const items = boxMode
        ? received.map(i => ({ ...i, receivedQty: (parseFloat(i.receivedQty) || 0) * getBoxSize(i.sku) }))
        : received
      await receivePurchaseOrder(po, items, user?.id)
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <SheetModal title="Receive Stock" subtitle={`PO ${po.ref} · ${po.supplierName}`} onClose={onClose}
      footer={
        <button onClick={confirm} disabled={busy} className="btn-primary" style={{ width: '100%' }}>
          <PackageCheck size={14} />{busy ? 'Receiving…' : 'Confirm Receipt & Update Stock'}
        </button>
      }
    >
      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Box size={13} style={{ color: 'var(--brand-600)' }} />
          Receive in Boxes
        </div>
        <button onClick={() => setBoxMode(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: boxMode ? 'var(--brand-600)' : 'var(--surface-border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 3, left: boxMode ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={{ marginBottom: 10, padding: '6px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', fontSize: 11, color: '#1d4ed8' }}>
        {boxMode ? 'Enter boxes received — units will be calculated using each product\'s box size.' : 'Enter the actual units received. Stock will be added immediately.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {received.map(item => {
          const boxSize = getBoxSize(item.sku)
          const unitsPreview = boxMode ? (parseFloat(item.receivedQty) || 0) * boxSize : null
          return (
            <div key={item.sku} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>{item.name}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>
                  {item.sku} · Ordered: {item.qty}{boxMode && boxSize > 1 ? ` · Box size: ${boxSize}` : ''}
                </div>
                {boxMode && unitsPreview !== null && (
                  <div style={{ fontSize: 10, color: 'var(--brand-600)', fontWeight: 600, marginTop: 2 }}>
                    = {unitsPreview} units to stock
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-tertiary)', display: 'block', marginBottom: 3, textAlign: 'right' }}>
                  {boxMode ? 'Boxes' : 'Units'}
                </label>
                <input type="number" min="0" value={item.receivedQty}
                  onChange={e => setQty(item.sku, e.target.value)}
                  style={{ width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--surface-border)', background: 'var(--surface-1)', fontSize: 14, fontWeight: 700, color: 'var(--ink-primary)', textAlign: 'right' }} />
              </div>
            </div>
          )
        })}
      </div>
    </SheetModal>
  )
}

// ── PO detail / view modal ─────────────────────────────────────────────────
function DetailModal({ po, user, shop, onUpdate, onClose }) {
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)

  const doPrint = async () => {
    setPrinting(true)
    try { await printPurchaseOrder(po, shop) } finally { setPrinting(false) }
  }

  const markSent = async () => {
    setBusy(true)
    await updatePurchaseOrder(po.id, { status: 'sent', sentAt: new Date().toISOString() })
    onUpdate()
    setBusy(false)
  }

  const cancel = async () => {
    setBusy(true)
    await updatePurchaseOrder(po.id, { status: 'cancelled' })
    onUpdate()
    setBusy(false)
  }

  const orderTotal = round2((po.items || []).reduce((s, i) => s + (i.qty || 0) * (i.unitCost || 0), 0))

  return (
    <SheetModal title={`PO ${po.ref}`} subtitle={po.supplierName} onClose={onClose}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {po.status === 'draft' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={cancel} disabled={busy} className="btn-danger" style={{ flex: 1 }}>
                <Ban size={13} />Cancel PO
              </button>
              <button onClick={markSent} disabled={busy} className="btn-primary" style={{ flex: 2 }}>
                <Send size={13} />{busy ? 'Updating…' : 'Mark as Sent'}
              </button>
            </div>
          )}
          {po.status === 'sent' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={cancel} disabled={busy} className="btn-ghost" style={{ flex: 1 }}>
                <Ban size={13} />Cancel
              </button>
              <button onClick={() => onUpdate('receive')} disabled={busy} className="btn-primary" style={{ flex: 2 }}>
                <PackageCheck size={13} />Receive Stock
              </button>
            </div>
          )}
          <button onClick={doPrint} disabled={printing} className="btn-secondary" style={{ width: '100%' }}>
            <Printer size={13} />{printing ? 'Printing…' : 'Print / Share PO'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <StatusBadge status={po.status} />
        <span style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>
          Created {new Date(po.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {po.sentAt && <span style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>· Sent {new Date(po.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
        {po.receivedAt && <span style={{ fontSize: 10, color: '#10b981' }}>· Received {new Date(po.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {(po.items || []).map(item => {
          const line = round2((item.qty || 0) * (item.unitCost || 0))
          const recvd = po.receivedItems?.find(r => r.sku === item.sku)
          return (
            <div key={item.sku} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>{item.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 1 }}>{item.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(line)}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>{item.qty} × {fmt(item.unitCost)}</div>
                </div>
              </div>
              {recvd && (
                <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 7, background: 'rgba(16,185,129,0.08)', display: 'inline-block', fontSize: 10, color: '#065f46', fontWeight: 600 }}>
                  Received: {recvd.receivedQty} units
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--surface-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-primary)' }}>Order Total</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--brand-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(orderTotal)}</span>
      </div>

      {po.notes && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 11, color: 'var(--ink-secondary)' }}>
          {po.notes}
        </div>
      )}
    </SheetModal>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
const STATUSES = ['all', 'draft', 'sent', 'received', 'cancelled']

export default function PurchaseOrders({ user }) {
  const [pos, setPos]               = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [products, setProducts]     = useState([])
  const [statusFilter, setFilter]   = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailPo, setDetailPo]     = useState(null)
  const [receivePo, setReceivePo]   = useState(null)
  const [toast, setToast]           = useState(null)
  const [shopInfo, setShopInfo]     = useState({})

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    const [p, s, pr] = await Promise.all([
      db.purchaseOrders.orderBy('createdAt').reverse().toArray(),
      db.suppliers.toArray(),
      db.products.toArray(),
    ])
    setPos(p); setSuppliers(s); setProducts(pr)
  }, [])

  useEffect(() => {
    getSetting('shop_name').then(n => {
      if (n) setShopInfo(prev => ({ ...prev, name: n }))
    })
    getSetting('shop_address').then(a => {
      if (a) setShopInfo(prev => ({ ...prev, address: a }))
    })
    getSetting('shop_phones').then(ph => {
      if (ph) setShopInfo(prev => ({ ...prev, phones: ph }))
    })
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = pos.filter(p => statusFilter === 'all' || p.status === statusFilter)

  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  const handleDetailUpdate = async (action) => {
    if (action === 'receive') {
      setReceivePo(detailPo)
      setDetailPo(null)
    } else {
      await load()
      setDetailPo(null)
      showToast('Purchase order updated')
    }
  }

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h1 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', margin: 0 }}>Purchase Orders</h1>
          {canEdit && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} />New PO
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="no-scrollbar">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`cat-chip shrink-0 ${statusFilter === s ? 'cat-chip-active' : 'cat-chip-inactive'}`}
              style={{ textTransform: 'capitalize' }}>
              {s === 'all' ? `All (${pos.length})` : `${STATUS_CFG[s]?.label} (${pos.filter(p => p.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--ink-tertiary)' }}>
            <ShoppingCart size={36} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-secondary)' }}>
              {statusFilter === 'all' ? 'No purchase orders yet' : `No ${statusFilter} orders`}
            </div>
            {statusFilter === 'all' && canEdit && (
              <div style={{ fontSize: 11, marginTop: 4 }}>Tap New PO to create your first order</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(po => {
              const orderTotal = round2((po.items || []).reduce((s, i) => s + (i.qty || 0) * (i.unitCost || 0), 0))
              return (
                <button key={po.id} onClick={() => setDetailPo(po)}
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--surface-border)', borderRadius: 18, padding: '14px 16px', boxShadow: 'var(--shadow-sm)', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={17} style={{ color: '#3b82f6' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-primary)' }}>{po.ref}</span>
                      <StatusBadge status={po.status} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-secondary)', marginBottom: 1 }}>{po.supplierName || 'Unknown supplier'}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>
                      {(po.items || []).length} item{(po.items || []).length !== 1 ? 's' : ''} ·{' '}
                      {new Date(po.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(orderTotal)}</div>
                    <ChevronRight size={13} style={{ color: 'var(--ink-tertiary)', marginTop: 2 }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <CreateModal
          suppliers={suppliers}
          products={products}
          onSave={async () => { await load(); setCreateOpen(false); showToast('Purchase order created') }}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {detailPo && (
        <DetailModal
          po={detailPo}
          user={user}
          shop={shopInfo}
          onUpdate={handleDetailUpdate}
          onClose={() => setDetailPo(null)}
        />
      )}

      {receivePo && (
        <ReceiveModal
          po={receivePo}
          user={user}
          products={products}
          onDone={async () => { await load(); setReceivePo(null); showToast('Stock received and updated') }}
          onClose={() => setReceivePo(null)}
        />
      )}

      {toast && <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.msg}</div>}
    </div>
  )
}
