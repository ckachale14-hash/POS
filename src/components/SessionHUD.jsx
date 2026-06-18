import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  ShoppingCart, Pause, ChevronUp, ChevronDown, X, Play,
  Plus, Minus, Trash2
} from 'lucide-react'
import { useSession } from '../context/SessionContext'
import { db, holdSale, removeHeldSale, genRef, getTotalUnits } from '../lib/db'
import { fmt, calculateTotals } from '../lib/utils'

export default function SessionHUD({ navigate, currentPage }) {
  const {
    cart, cartCount, updateQty, removeFromCart, clearCart,
    saleDiscount, setSaleDiscount, customer,
    vatEnabled, mode,
    heldSales, refreshHeld, setCart, setCustomer, setSaleDiscount: setSd,
    setPayMethod, setMode, setActiveHeldId, floatAction,
  } = useSession()

  const [open, setOpen]   = useState(false)
  const [tab, setTab]     = useState('cart')
  const panelRef          = useRef(null)
  const hudRef            = useRef(null)

  // ── Drag state ─────────────────────────────────────────────────────────
  const dragState = useRef({ active: false, startX: 0, startY: 0, origLeft: 0, origTop: 0, moved: false })
  const [dragged, setDragged] = useState(false)

  const initPos = useCallback(() => {
    const el = hudRef.current
    if (!el || dragged) return
    const rect = el.getBoundingClientRect()
    el.style.left      = `${window.innerWidth / 2 - rect.width / 2}px`
    el.style.top       = `${window.innerHeight - rect.height - 24}px`
    el.style.bottom    = 'auto'
    el.style.transform = 'none'
  }, [dragged])

  useEffect(() => {
    const t = setTimeout(initPos, 80)
    return () => clearTimeout(t)
  }, [initPos])

  useEffect(() => {
    const onResize = () => { if (!dragged) initPos() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dragged, initPos])

  const onDragStart = useCallback((clientX, clientY) => {
    const el = hudRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.left      = `${rect.left}px`
    el.style.top       = `${rect.top}px`
    el.style.bottom    = 'auto'
    el.style.transform = 'none'
    dragState.current = {
      active: true, moved: false,
      startX: clientX, startY: clientY,
      origLeft: rect.left, origTop: rect.top,
    }
    el.classList.add('is-dragging')
  }, [])

  const onDragMove = useCallback((clientX, clientY) => {
    if (!dragState.current.active) return
    const { startX, startY, origLeft, origTop } = dragState.current
    const dx = clientX - startX
    const dy = clientY - startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true
    const el = hudRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const newLeft = Math.max(8, Math.min(window.innerWidth  - rect.width  - 8, origLeft + dx))
    const newTop  = Math.max(8, Math.min(window.innerHeight - rect.height - 8, origTop  + dy))
    el.style.left = `${newLeft}px`
    el.style.top  = `${newTop}px`
  }, [])

  const onDragEnd = useCallback(() => {
    if (!dragState.current.active) return
    const moved = dragState.current.moved
    dragState.current.active = false
    const el = hudRef.current
    if (el) el.classList.remove('is-dragging')
    if (moved) setDragged(true)
    return moved // true if it was a drag, false if it was a tap
  }, [])

  // Mouse drag — attached to the entire HUD container so it works even when closed
  useEffect(() => {
    const el = hudRef.current
    if (!el) return

    const onMouseDown = (e) => {
      // Don't intercept clicks on interactive children (buttons inside the panel)
      if (e.target.closest('button') && !e.target.closest('.float-btn')) return
      e.preventDefault()
      onDragStart(e.clientX, e.clientY)

      const onMove = (ev) => onDragMove(ev.clientX, ev.clientY)
      const onUp   = () => {
        onDragEnd()
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [onDragStart, onDragMove, onDragEnd])

  // Touch drag
  const onTouchStart = useCallback((e) => {
    if (e.target.closest('button') && !e.target.classList.contains('float-btn')) return
    const t = e.touches[0]
    onDragStart(t.clientX, t.clientY)
  }, [onDragStart])

  const onTouchMove = useCallback((e) => {
    if (!dragState.current.active) return
    e.preventDefault()
    const t = e.touches[0]
    onDragMove(t.clientX, t.clientY)
  }, [onDragMove])

  const onTouchEnd = useCallback(() => onDragEnd(), [onDragEnd])

  // Float button click — only fires if we didn't drag
  const handleFloatClick = useCallback((e) => {
    e.stopPropagation()
    if (dragState.current.moved) return // was a drag, not a tap
    setOpen(o => !o)
  }, [])

  const totals = calculateTotals({ items: cart, saleDiscount, vatEnabled, vatRate: 0.15 })

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const resumeHeld = async (held) => {
    if (cart.length > 0) {
      await holdSale({ ref: genRef('HLD'), items: cart, customer, saleDiscount, holdName: customer || `Session ${Date.now()}`, cashier: '', cashierId: '' })
    }
    setCart(held.items || [])
    setCustomer(held.customer || '')
    setSd(held.saleDiscount || 0)
    setPayMethod(held.payMethod || 'cash')
    setMode(held.type === 'quote' ? 'quote' : 'sale')
    setActiveHeldId(held.id)
    await removeHeldSale(held.id)
    await refreshHeld()
    setOpen(false)
    if (floatAction === 'navigate' && currentPage !== 'pos') navigate('pos')
  }

  const discardHeld = async (held, e) => {
    e.stopPropagation()
    await removeHeldSale(held.id)
    await refreshHeld()
  }

  if (cartCount === 0 && heldSales.length === 0) return null

  const s = { background: 'var(--surface-2)', border: '1px solid var(--surface-border-strong)', color: 'var(--ink-primary)' }

  return (
    <div
      ref={hudRef}
      className="session-hud"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: 'none' }}
    >
      <div ref={panelRef} className="flex flex-col items-center">
        {/* Expanded panel */}
        {open && (
          <div className="mb-3 w-80 max-h-[70vh] rounded-2xl flex flex-col overflow-hidden animate-slide-up"
            style={{ ...s, boxShadow: 'var(--shadow-modal)' }}>
            <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--surface-border)' }}>
              <div className="flex gap-1 flex-1">
                {['cart','held'].map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${tab === t ? 'text-white' : ''}`}
                    style={tab === t ? { background: 'var(--brand-600)' } : { color: 'var(--ink-secondary)' }}
                    onMouseEnter={e => { if (tab !== t) e.currentTarget.style.background = 'var(--surface-3)' }}
                    onMouseLeave={e => { if (tab !== t) e.currentTarget.style.background = 'transparent' }}
                  >
                    {t === 'cart' ? `Cart${cartCount > 0 ? ` (${cartCount})` : ''}` : `On Hold${heldSales.length > 0 ? ` (${heldSales.length})` : ''}`}
                  </button>
                ))}
              </div>
              <button onClick={() => setOpen(false)} className="btn-ghost p-1.5"><X size={15} /></button>
            </div>

            {tab === 'cart' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {cart.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8" style={{ color: 'var(--ink-tertiary)' }}>
                    <ShoppingCart size={28} className="mb-2 opacity-30" />
                    <p className="text-xs">Cart is empty</p>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {cart.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--ink-primary)' }}>{item.name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>{item.label} · {fmt(item.unitPrice)}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {[[-1,'−'],[1,'+']].map(([delta, sym]) => (
                              <button key={sym} onClick={() => updateQty(item.sku, item.mode, delta)}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition"
                                style={{ background: 'var(--surface-3)', color: 'var(--ink-primary)' }}>
                                {sym}
                              </button>
                            ))}
                            <span className="w-5 text-center text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{item.qty}</span>
                            <button onClick={() => removeFromCart(item.sku, item.mode)}
                              className="w-6 h-6 rounded-md flex items-center justify-center ml-1 transition"
                              style={{ color: '#f87171' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,56,48,0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <Trash2 size={10} />
                            </button>
                          </div>
                          <span className="text-xs font-bold w-14 text-right shrink-0" style={{ color: 'var(--ink-primary)' }}>
                            {fmt((item.unitPrice * item.qty) - (item.lineDiscount || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-3 shrink-0 space-y-2" style={{ borderTop: '1px solid var(--surface-border)' }}>
                      {saleDiscount > 0 && (
                        <div className="flex justify-between text-xs" style={{ color: 'var(--brand-400)' }}>
                          <span>Discount</span><span>-{fmt(saleDiscount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-black" style={{ color: 'var(--ink-primary)' }}>Total</span>
                        <span className="text-lg font-black" style={{ color: 'var(--brand-600)' }}>{fmt(totals.grandTotal)}</span>
                      </div>
                      <button onClick={() => { setOpen(false); navigate('pos') }} className="btn-primary w-full py-2.5 text-xs">
                        <ShoppingCart size={13} />
                        {currentPage === 'pos' ? 'Back to Sale' : 'Go to POS'}
                      </button>
                      <button onClick={() => { clearCart(); setOpen(false) }}
                        className="w-full py-1.5 text-xs transition"
                        style={{ color: 'var(--ink-tertiary)' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-tertiary)'}>
                        Clear cart
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'held' && (
              <div className="flex-1 overflow-y-auto p-3">
                {heldSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--ink-tertiary)' }}>
                    <Pause size={28} className="mb-2 opacity-30" />
                    <p className="text-xs">No held sessions</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {heldSales.map((held) => (
                      <button key={held.id} onClick={() => resumeHeld(held)}
                        className="w-full flex items-start gap-3 p-3 rounded-xl text-left group transition"
                        style={{ background: 'var(--surface-3)', border: '1px solid var(--surface-border)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-600)'; e.currentTarget.style.background = 'rgba(255,56,48,0.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--surface-border)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                          <Pause size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
                            {held.holdName || held.customer || 'Unnamed session'}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>
                            {(held.items || []).length} items · {fmt((held.items || []).reduce((a, i) => a + i.unitPrice * i.qty, 0))}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => discardHeld(held, e)}
                            className="w-6 h-6 rounded-md flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                            style={{ color: '#f87171' }}>
                            <X size={11} />
                          </button>
                          <Play size={13} className="opacity-0 group-hover:opacity-100 transition" style={{ color: 'var(--brand-600)' }} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* HUD pill — draggable from here */}
        <button
          className={`float-btn ${cartCount > 0 ? 'animate-hud-pulse' : ''}`}
          style={{ minWidth: 140 }}
          onClick={handleFloatClick}
          onMouseDown={e => {
            // Start drag tracking from the button itself
            e.preventDefault()
            onDragStart(e.clientX, e.clientY)
            const onMove = (ev) => onDragMove(ev.clientX, ev.clientY)
            const onUp   = () => {
              onDragEnd()
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        >
          <div className="relative">
            <ShoppingCart size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center animate-scale-in"
                style={{ background: '#fff', color: 'var(--brand-600)' }}>
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-sm font-bold">
            {cartCount > 0
              ? fmt(calculateTotals({ items: cart, saleDiscount, vatEnabled, vatRate: 0.15 }).grandTotal)
              : `${heldSales.length} held`}
          </span>
          {heldSales.length > 0 && (
            <span className="w-5 h-5 bg-amber-400 text-gray-900 rounded-full text-[9px] font-black flex items-center justify-center">
              {heldSales.length}
            </span>
          )}
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
    </div>
  )
}
