import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getAllProducts, getHeldSales, removeHeldSale, getSetting, getTotalUnits } from '../lib/db'

const SessionContext = createContext(null)

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}

export function SessionProvider({ children }) {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState('')
  const [customerId, setCustomerId] = useState(null)
  const [saleDiscount, setSaleDiscount] = useState(0)
  const [payMethod, setPayMethod] = useState('cash')
  const [mode, setMode] = useState('sale')
  const [vatEnabled, setVatEnabled] = useState(false)
  const [heldSales, setHeldSales] = useState([])
  const [activeHeldId, setActiveHeldId] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [floatPages, setFloatPages] = useState(['pos','dashboard','inventory','sales','customers'])
  const [floatAction, setFloatAction] = useState('navigate')

  const refreshProducts = useCallback(async () => {
    const p = await getAllProducts()
    setProducts(p)
  }, [])

  const refreshHeld = useCallback(async () => {
    const h = await getHeldSales()
    const EXPIRY_MS = 24 * 60 * 60 * 1000
    const now = Date.now()
    const expired = h.filter(s => now - new Date(s.createdAt).getTime() > EXPIRY_MS)
    await Promise.all(expired.map(s => removeHeldSale(s.id)))
    setHeldSales(h.filter(s => now - new Date(s.createdAt).getTime() <= EXPIRY_MS))
  }, [])

  useEffect(() => {
    refreshProducts()
    refreshHeld()
    getSetting('vat_enabled').then(v => setVatEnabled(!!v))
    getSetting('float_cart_pages').then(p => p && setFloatPages(p))
    getSetting('float_cart_action').then(a => a && setFloatAction(a))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setCustomer('')
    setCustomerId(null)
    setSaleDiscount(0)
    setPayMethod('cash')
    setMode('sale')
    setActiveHeldId(null)
  }, [])

  // Rebalance box/unit lines: promote units >= boxSize into extra boxes
  function rebalanceBoxLines(cartItems, sku, boxSize) {
    if (!boxSize || boxSize <= 1) return cartItems
    const boxIdx  = cartItems.findIndex(c => c.sku === sku && c.mode === 'box' && c.subMode === 'boxes')
    const unitIdx = cartItems.findIndex(c => c.sku === sku && c.mode === 'box' && c.subMode === 'units')
    if (boxIdx < 0 || unitIdx < 0) return cartItems
    let boxes = cartItems[boxIdx].qty
    let units = cartItems[unitIdx].qty
    const extra = Math.floor(units / boxSize)
    boxes += extra
    units = units % boxSize
    const next = [...cartItems]
    next[boxIdx] = { ...next[boxIdx], qty: boxes }
    next[unitIdx] = { ...next[unitIdx], qty: units }
    return next
  }

  const addToCart = useCallback((product, pMode) => {
    const totalAvailable = getTotalUnits(product)
    const hasBox = product.boxSize > 1 && product.boxPrice > 0

    if (pMode === 'box' && hasBox) {
      const boxSize = product.boxSize
      const inCartUnits = cart
        .filter(c => c.sku === product.sku)
        .reduce((a, c) => a + c.qty * c.unitsPerLine, 0)
      if (inCartUnits + boxSize > totalAvailable) {
        return { ok: false, msg: `Only ${totalAvailable} units in stock` }
      }
      setCart(prev => {
        let next = [...prev]
        const bi = next.findIndex(c => c.sku === product.sku && c.mode === 'box' && c.subMode === 'boxes')
        if (bi >= 0) {
          next[bi] = { ...next[bi], qty: next[bi].qty + 1 }
        } else {
          next.push({
            sku: product.sku, name: product.name, mode: 'box', subMode: 'boxes',
            label: `Box of ${boxSize}`, qty: 1,
            unitPrice: product.boxPrice, unitsPerLine: boxSize, lineDiscount: 0, boxSize,
          })
          // Ensure units shadow line exists
          const ui = next.findIndex(c => c.sku === product.sku && c.mode === 'box' && c.subMode === 'units')
          if (ui < 0) {
            next.push({
              sku: product.sku, name: product.name, mode: 'box', subMode: 'units',
              label: 'Loose units', qty: 0,
              unitPrice: product.wholesalePrice, unitsPerLine: 1, lineDiscount: 0, boxSize,
            })
          }
        }
        return rebalanceBoxLines(next, product.sku, boxSize)
      })
      return { ok: true }
    }

    // Wholesale / Retail
    const unitsPerLine = 1
    const inCartUnits = cart.filter(c => c.sku === product.sku).reduce((a, c) => a + c.qty * c.unitsPerLine, 0)
    if (inCartUnits + unitsPerLine > totalAvailable) {
      return { ok: false, msg: `Only ${totalAvailable} units in stock` }
    }
    const unitPrice = pMode === 'wholesale' ? product.wholesalePrice : product.retailPrice
    const label = pMode === 'wholesale' ? 'Wholesale' : 'Retail'
    setCart(prev => {
      const idx = prev.findIndex(c => c.sku === product.sku && c.mode === pMode && !c.subMode)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next
      }
      return [...prev, { sku: product.sku, name: product.name, mode: pMode, subMode: '', label, qty: 1, unitPrice, unitsPerLine, lineDiscount: 0 }]
    })
    return { ok: true }
  }, [cart])

  const addLooseUnit = useCallback((product) => {
    const totalAvailable = getTotalUnits(product)
    const inCartUnits = cart.filter(c => c.sku === product.sku).reduce((a, c) => a + c.qty * c.unitsPerLine, 0)
    if (inCartUnits + 1 > totalAvailable) return { ok: false, msg: `Only ${totalAvailable} units in stock` }
    setCart(prev => {
      let next = [...prev]
      const ui = next.findIndex(c => c.sku === product.sku && c.mode === 'box' && c.subMode === 'units')
      if (ui >= 0) {
        next[ui] = { ...next[ui], qty: next[ui].qty + 1 }
      } else {
        next.push({ sku: product.sku, name: product.name, mode: 'box', subMode: 'units', label: 'Loose units', qty: 1, unitPrice: product.wholesalePrice, unitsPerLine: 1, lineDiscount: 0, boxSize: product.boxSize })
      }
      return rebalanceBoxLines(next, product.sku, product.boxSize)
    })
    return { ok: true }
  }, [cart])

  const updateQty = useCallback((sku, mode, delta, subMode = '') => {
    setCart(prev => {
      let next = prev.map(item => {
        if (item.sku !== sku || item.mode !== mode || (item.subMode || '') !== subMode) return item
        const newQty = item.qty + delta
        if (newQty < 0) return item
        if (newQty === 0 && subMode === 'boxes') return null
        return { ...item, qty: newQty }
      }).filter(Boolean)

      if (mode === 'box') {
        const bs = prev.find(c => c.sku === sku && c.mode === 'box')?.boxSize || 1
        next = rebalanceBoxLines(next, sku, bs)
        const hasBoxes = next.some(c => c.sku === sku && c.mode === 'box' && c.subMode === 'boxes')
        if (!hasBoxes) next = next.filter(c => !(c.sku === sku && c.mode === 'box'))
      }
      return next
    })
  }, [])

  const removeFromCart = useCallback((sku, mode, subMode = '') => {
    setCart(prev => {
      let next = prev.filter(item => !(item.sku === sku && item.mode === mode && (item.subMode || '') === subMode))
      if (mode === 'box' && subMode === 'boxes') next = next.filter(c => !(c.sku === sku && c.mode === 'box'))
      return next
    })
  }, [])

  const setLineDiscount = useCallback((sku, mode, discount, subMode = '') => {
    setCart(prev => prev.map(item =>
      item.sku === sku && item.mode === mode && (item.subMode || '') === subMode
        ? { ...item, lineDiscount: discount } : item
    ))
  }, [])

  const cartCount = cart.reduce((a, c) => a + c.qty, 0)
  const visibleCart = cart.filter(c => c.qty > 0)

  return (
    <SessionContext.Provider value={{
      products, refreshProducts,
      cart: visibleCart, fullCart: cart, setCart, cartCount,
      addToCart, addLooseUnit, updateQty, removeFromCart, setLineDiscount, clearCart,
      customer, setCustomer, customerId, setCustomerId,
      saleDiscount, setSaleDiscount,
      payMethod, setPayMethod,
      mode, setMode,
      vatEnabled, setVatEnabled,
      heldSales, setHeldSales, refreshHeld, activeHeldId, setActiveHeldId,
      cartOpen, setCartOpen,
      floatPages, setFloatPages,
      floatAction, setFloatAction,
    }}>
      {children}
    </SessionContext.Provider>
  )
}
