import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search, X, ShoppingCart, Tag, FileText, Pause, Wifi, WifiOff,
  Send, Printer, CheckCircle2, Package, AlertCircle, Edit3,
  ArrowLeft, CreditCard, Banknote, Smartphone, FileCheck, Eye,
  Plus, Minus, Trash2, ChevronDown, Receipt as ReceiptIcon,
  RotateCcw, AlertTriangle, Check, DollarSign, Box, Layers, UserCheck,
  ScanLine,
} from 'lucide-react'
import {
  db, saveSale, saveQuote, holdSale, removeHeldSale,
  getSetting, saveSetting, logAudit, genRef, deductStock, getTotalUnits
} from '../lib/db'
import { fmt, round2, genId, calculateTotals } from '../lib/utils'
import { CATEGORIES, SHOP_INFO } from '../data/initial-inventory'
import { useSession } from '../context/SessionContext'
import Receipt from '../components/Receipt.jsx'
import PinDialog from '../components/PinDialog.jsx'
import { useBarcodeScanner } from '../lib/useBarcode'

const DISCOUNT_THRESHOLD = 5

const PAY_METHODS = [
  { id: 'cash',     label: 'Cash',    icon: Banknote },
  { id: 'ecocash',  label: 'EcoCash', icon: Smartphone },
  { id: 'swipe',    label: 'Swipe',   icon: CreditCard },
  { id: 'invoice',  label: 'Invoice', icon: FileCheck },
]

function Toast({ toast }) {
  if (!toast) return null
  const styles = { success: 'toast-success', error: 'toast-error', warning: 'toast-warning', info: 'toast-info' }
  return (
    <div className={`toast ${styles[toast.type] || 'toast-info'}`}>
      {toast.type === 'success' && <Check size={14} />}
      {toast.type === 'error' && <AlertTriangle size={14} />}
      {toast.msg}
    </div>
  )
}

// Quick-fill amounts: exact, round up to nearest $5, $10, $20, $50
function getQuickFills(total) {
  const fills = new Set()
  fills.add(total)
  const roundings = [5, 10, 20, 50]
  for (const r of roundings) {
    const rounded = Math.ceil(total / r) * r
    if (rounded !== total) fills.add(rounded)
    if (fills.size >= 4) break
  }
  return Array.from(fills).slice(0, 4)
}

// ── Hoisted outside POS so they are never recreated on every render ────────
const ProductCard = React.memo(function ProductCard({
  product, cart, addedSku, pressedSku, onPress
}) {
  const totalUnits = getTotalUnits(product)
  const inCart = cart.reduce((a, c) => c.sku === product.sku ? a + c.qty : a, 0)
  const isOut = totalUnits <= 0
  const isLow = totalUnits > 0 && totalUnits < 5
  const isAdded = addedSku === product.sku
  const isPressed = pressedSku === product.sku
  const hasBox = product.boxSize > 1 && product.boxPrice > 0

  return (
    <button
      type="button"
      onClick={() => !isOut && onPress(product)}
      disabled={isOut}
      aria-label={`${product.name}${isOut ? ', out of stock' : `, ${fmt(product.retailPrice)}`}`}
      style={{ touchAction: 'manipulation', textAlign: 'left' }}
      className={`product-card relative overflow-hidden transition-all duration-150 w-full ${
        isOut ? 'opacity-40 cursor-not-allowed bg-gray-50'
          : isPressed ? 'scale-[0.96] shadow-inner'
          : 'hover:border-brand-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
      } ${isAdded ? 'border-brand-400 bg-brand-50/40' : ''} focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none`}
    >
      <div className="absolute top-1.5 right-1.5">
        {isOut ? <span className="badge-danger text-[9px] px-1.5 py-0.5">Out</span>
          : isLow ? <span className="badge-warning text-[9px] px-1.5 py-0.5">{totalUnits} left</span>
          : <span className="text-[9px] text-gray-300 font-medium">{totalUnits}</span>}
      </div>
      {inCart > 0 && (
        <div className="absolute top-1.5 left-1.5">
          <span className={`w-5 h-5 bg-brand-600 text-white rounded-full text-[10px] font-black flex items-center justify-center ${isAdded ? 'animate-cart-pop' : ''}`}>
            {inCart}
          </span>
        </div>
      )}
      <div className="text-[9px] text-gray-300 font-mono mt-1 pr-6 truncate">{product.sku}</div>
      <div className="text-xs font-bold text-gray-900 leading-tight line-clamp-2 mb-1.5 mt-0.5 pr-2">{product.name}</div>
      <div className="mt-auto space-y-0.5">
        {hasBox && (
          <div className="text-[10px] text-gray-400">
            Box: <span className="font-semibold text-gray-600">{fmt(product.boxPrice)}</span>
          </div>
        )}
        <div className="text-[10px] text-gray-400">
          WS: <span className="font-semibold text-gray-600">{fmt(product.wholesalePrice)}</span>
        </div>
        <div className="text-sm font-black text-brand-600">{fmt(product.retailPrice)}</div>
      </div>
      {isAdded && <div className="absolute inset-0 bg-brand-600/10 rounded-2xl pointer-events-none animate-fade-in" />}
    </button>
  )
})

const CartRow = React.memo(function CartRow({
  item, products, onUpdateQty, onRemove, onOpenDiscount, onAddLoose, onToast
}) {
  const isUnitLine = item.subMode === 'units'
  const net = item.unitPrice * item.qty - (item.lineDiscount || 0)
  const product = products.find(p => p.sku === item.sku)

  const handleAddLoose = () => {
    if (product) {
      const result = onAddLoose(product)
      if (!result?.ok) onToast(result?.msg || 'Cannot add loose unit', 'error')
    }
  }

  return (
    <div className={`cart-item group ${isUnitLine ? 'pl-3 border-l-2 border-blue-100' : ''}`}>
      <div className="flex-1 min-w-0">
        {isUnitLine
          ? <p className="text-[10px] text-blue-600 font-semibold leading-tight">+ Loose units</p>
          : <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{item.name}</p>}
        <p className="text-[10px] text-gray-400 mt-0.5">{item.label} · {fmt(item.unitPrice)}/ea</p>
        {(item.lineDiscount || 0) > 0 && (
          <p className="text-[10px] text-brand-600 font-semibold">Disc: -{fmt(item.lineDiscount)}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onUpdateQty(item.sku, item.mode, -1, item.subMode || '')}
          aria-label="Decrease quantity"
          className="w-6 h-6 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none">
          <Minus size={11} className="text-gray-600" />
        </button>
        <span className="w-6 text-center text-sm font-black text-gray-900 tabular-nums">{item.qty}</span>
        <button
          onClick={() => isUnitLine ? handleAddLoose() : onUpdateQty(item.sku, item.mode, 1, item.subMode || '')}
          aria-label="Increase quantity"
          className="w-6 h-6 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-green-50 hover:border-green-200 transition active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none">
          <Plus size={11} className="text-gray-600" />
        </button>
      </div>
      <div className="text-right shrink-0 w-14">
        <div className="text-xs font-black text-gray-900">{fmt(net)}</div>
      </div>
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
        {!isUnitLine && (
          <button onClick={() => onOpenDiscount(item)}
            aria-label="Add line discount"
            className="w-6 h-6 rounded-md text-gray-400 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none">
            <Tag size={11} />
          </button>
        )}
        <button onClick={() => onRemove(item.sku, item.mode, item.subMode || '')}
          aria-label="Remove item"
          className="w-6 h-6 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
})

export default function POS({ user, online, navigate }) {
  const {
    products, refreshProducts,
    cart, fullCart, setCart, cartCount, addToCart, addLooseUnit, updateQty, removeFromCart, setLineDiscount, clearCart,
    customer, setCustomer, customerId, setCustomerId,
    saleDiscount, setSaleDiscount,
    payMethod, setPayMethod,
    mode, setMode,
    vatEnabled, setVatEnabled,
    heldSales, refreshHeld, activeHeldId,
  } = useSession()

  const [search, setSearch]                   = useState('')
  const [selectedCat, setSelectedCat]         = useState('All')
  const [prevCat, setPrevCat]                 = useState('All')
  const [view, setView]                       = useState('products')

  const [priceModal, setPriceModal]           = useState(null)
  const [lineDiscountModal, setLineDiscountModal] = useState(null)
  const [lineDiscountVal, setLineDiscountVal] = useState('')
  const [showSaleDiscount, setShowSaleDiscount] = useState(false)
  const [saleDiscountInput, setSaleDiscountInput] = useState('')
  const [pinPrompt, setPinPrompt]             = useState(null)
  const [checkoutModal, setCheckoutModal]     = useState(false)
  const [printReceipt, setPrintReceipt]       = useState(null)
  const [holdNameModal, setHoldNameModal]     = useState(false)
  const [holdNameInput, setHoldNameInput]     = useState('')
  const [toast, setToast]                     = useState(null)
  const [pressedSku, setPressedSku]           = useState(null)
  const [addedSku, setAddedSku]               = useState(null)
  const [shopInfo, setShopInfo]               = useState({})

  // Customer search
  const [customerSearch, setCustomerSearch]   = useState('')
  const [customerSuggestions, setCustomerSuggestions] = useState([])
  const [selectedCustomerCredit, setSelectedCustomerCredit] = useState(null)
  const [customerPhone, setCustomerPhone]     = useState('')

  // Checkout payment state
  const [payments, setPayments]               = useState([{ method: 'cash', amount: '' }])
  const [changeActuallyGiven, setChangeActuallyGiven] = useState('')
  const [holdPartialChange, setHoldPartialChange] = useState(false)

  const searchRef  = useRef(null)
  const [lastScan, setLastScan] = useState('')    // brief scan indicator text

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2600)
  }, [])

  // ── Barcode scanner ─────────────────────────────────────────────────────
  // The Sunmi V1s-G hardware scan button emits the barcode as keystrokes
  // ending with Enter. useBarcodeScanner detects the burst and fires here.
  const handleScan = useCallback((code) => {
    // Ignore scans while any modal is blocking the POS view
    if (priceModal || checkoutModal || lineDiscountModal || showSaleDiscount || holdNameModal) return

    // Look up by exact SKU (case-insensitive)
    const match = products.find(p => p.active && p.sku && p.sku.toLowerCase() === code.toLowerCase())
    if (match) {
      handleProductPress(match)
      // Flash the search box to confirm what was scanned, then clear
      setLastScan(code)
      if (searchRef.current) searchRef.current.value = code
      setTimeout(() => {
        setLastScan('')
        if (searchRef.current) searchRef.current.value = ''
        handleSearchChange('')
      }, 900)
      return
    }

    // No exact SKU match — fill search so the cashier sees what was scanned
    handleSearchChange(code)
    if (searchRef.current) searchRef.current.value = code
    showToast(`No product for SKU: ${code}`, 'warning')
    if (navigator.vibrate) navigator.vibrate([80, 40, 80])
  }, [
    priceModal, checkoutModal, lineDiscountModal, showSaleDiscount, holdNameModal,
    products, showToast,
    // handleProductPress and handleSearchChange are defined below — the callback
    // ref inside useBarcodeScanner always calls the latest version so deps on
    // them is optional here; listing them makes the linter happy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ])

  useBarcodeScanner(handleScan)

  useEffect(() => {
    ;(async () => {
      const v = await getSetting('vat_enabled')
      setVatEnabled(!!v)
      const sn = await getSetting('shop_name')
      const st = await getSetting('shop_tagline')
      const sa = await getSetting('shop_address')
      const sp = await getSetting('shop_phones')
      const sl = await getSetting('shop_logo')
      const se = await getSetting('shop_email')
      const sw = await getSetting('shop_website')
      setShopInfo({ name: sn, tagline: st, address: sa, phones: sp?.split(','), logo: sl, email: se, website: sw })
    })()
  }, [])

  // Register back-button overlay so Android back closes the receipt dialog
  useEffect(() => {
    if (printReceipt) {
      window.__ps_back_overlay = () => setPrintReceipt(null)
      return () => { window.__ps_back_overlay = null }
    }
  }, [printReceipt])

  // Customer lookup as user types
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerSuggestions([]); return }
    const q = customerSearch.toLowerCase()
    db.customers.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    ).limit(5).toArray().then(setCustomerSuggestions)
  }, [customerSearch])

  const handleCustomerInput = (val) => {
    setCustomerSearch(val)
    setCustomer(val)
    setCustomerId(null)
    setCustomerPhone('')
    setSelectedCustomerCredit(null)
  }

  const selectCustomer = async (c) => {
    setCustomer(c.name)
    setCustomerId(c.id)
    setCustomerPhone(c.phone || '')
    setCustomerSearch('')
    setCustomerSuggestions([])
    // Load outstanding credit/change balance
    const txs = await db.creditTransactions
      .filter(t => (String(t.customerId) === String(c.id) || t.customerName === c.name) && !t.settled)
      .toArray()
    const changeOwedToThem = txs.filter(t => t.type === 'change_owed').reduce((a, t) => a + t.amount, 0)
    const creditOwedByThem = txs.filter(t => t.type === 'credit_owed').reduce((a, t) => a + t.amount, 0)
    if (changeOwedToThem > 0 || creditOwedByThem > 0) {
      setSelectedCustomerCredit({ changeOwed: changeOwedToThem, creditOwed: creditOwedByThem })
    }
  }

  const handleSearchChange = (val) => {
    if (val && selectedCat !== 'All') { setPrevCat(selectedCat); setSelectedCat('All') }
    else if (!val && prevCat !== 'All') { setSelectedCat(prevCat); setPrevCat('All') }
    setSearch(val)
  }

  const handleCatSelect = (cat) => {
    setSelectedCat(cat); setPrevCat(cat); setSearch('')
    if (searchRef.current) searchRef.current.value = ''
  }

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (!p.active) return false
      if (q) return p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
      return selectedCat === 'All' || p.category === selectedCat
    })
  }, [products, search, selectedCat])

  const totals = useMemo(
    () => calculateTotals({ items: cart, saleDiscount, vatEnabled, vatRate: 0.15 }),
    [cart, saleDiscount, vatEnabled]
  )

  const totalPaid = useMemo(() => payments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0), [payments])
  const changeOwed = useMemo(() => round2(Math.max(0, totalPaid - totals.grandTotal)), [totalPaid, totals])
  const amountOwing = useMemo(() => round2(Math.max(0, totals.grandTotal - totalPaid)), [totalPaid, totals])
  const hasSplit = useMemo(() => payments.some(p => p.method === 'invoice'), [payments])

  // Change tracking: what we still owe after giving some
  const changeGivenAmt = useMemo(() => parseFloat(changeActuallyGiven) || 0, [changeActuallyGiven])
  const changeStillOwed = useMemo(() => round2(Math.max(0, changeOwed - changeGivenAmt)), [changeOwed, changeGivenAmt])

  const handleProductPress = (product) => {
    setPressedSku(product.sku)
    setTimeout(() => setPressedSku(null), 180)
    const total = getTotalUnits(product)
    if (total <= 0) { showToast(`${product.name} is out of stock`, 'error'); if (navigator.vibrate) navigator.vibrate([50,30,50]); return }
    if (!product.boxSize || product.boxSize <= 1) {
      const result = addToCart(product, 'retail')
      if (!result.ok) { showToast(result.msg, 'error'); return }
      setAddedSku(product.sku); setTimeout(() => setAddedSku(null), 400)
      showToast(`${product.name} added`, 'success'); if (navigator.vibrate) navigator.vibrate(30); return
    }
    setPriceModal(product)
  }

  const handleAddWithMode = (product, pMode) => {
    const result = addToCart(product, pMode)
    if (!result.ok) { showToast(result.msg, 'error'); return }
    setAddedSku(product.sku); setTimeout(() => setAddedSku(null), 400)
    showToast(`${product.name} added`, 'success'); if (navigator.vibrate) navigator.vibrate(30)
    setPriceModal(null)
  }

  const openLineDiscount = useCallback((item) => {
    setLineDiscountModal(item)
    setLineDiscountVal(item.lineDiscount > 0 ? String(item.lineDiscount) : '')
  }, [])

  const applyLineDiscount = () => {
    const val = parseFloat(lineDiscountVal) || 0
    const apply = () => {
      setLineDiscount(lineDiscountModal.sku, lineDiscountModal.mode, val, lineDiscountModal.subMode || '')
      setLineDiscountModal(null)
    }
    if (val > DISCOUNT_THRESHOLD && user?.role === 'cashier') {
      setPinPrompt({ action: 'line_discount', onApprove: apply, amount: val })
    } else { apply() }
  }

  const applySaleDiscount = () => {
    const val = parseFloat(saleDiscountInput) || 0
    const apply = () => { setSaleDiscount(val); setShowSaleDiscount(false); setSaleDiscountInput('') }
    if (val > DISCOUNT_THRESHOLD && user?.role === 'cashier') {
      setPinPrompt({ action: 'sale_discount', onApprove: apply, amount: val })
    } else { apply() }
  }

  const holdCurrentSale = async (name) => {
    if (cart.length === 0) return
    await holdSale({ ref: genRef('HLD'), items: cart, customer, customerId, saleDiscount, payMethod,
      holdName: name || customer || `Hold ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      cashier: user?.name, cashierId: user?.id })
    await refreshHeld(); clearCart(); setHoldNameModal(false); showToast('Sale held', 'info')
  }

  const completeSale = async () => {
    if (cart.length === 0) return

    // Require name for walk-in if there's change owed
    const effectiveName = customer || 'Walk-in'
    if (changeStillOwed > 0 && !customer.trim()) {
      showToast('Please add customer name to track change owed', 'warning'); return
    }

    // Auto-create customer if typed name not in DB
    let finalCustomerId = customerId
    if (customer.trim() && !customerId) {
      const existing = await db.customers.where('name').equalsIgnoreCase(customer.trim()).first()
      if (existing) {
        finalCustomerId = existing.id
      } else {
        finalCustomerId = await db.customers.add({
          name: customer.trim(), phone: '', email: '', address: '',
          creditLimit: 0, balance: 0, isTradeAccount: false, notes: 'Auto-created from POS',
          localId: `CUST-${Date.now()}`, createdAt: new Date().toISOString(), syncedAt: null,
        })
        showToast(`New customer "${customer}" created`, 'info')
      }
    }

    const ref = genRef('PSM')
    const primaryMethod = payments[0]?.method || payMethod
    const saleData = {
      ref, type: 'sale', status: 'completed',
      customer: effectiveName, customerId: finalCustomerId ? String(finalCustomerId) : '',
      customerPhone: customerPhone || '',
      items: cart, ...totals,
      payments: payments.map(p => ({ method: p.method, amount: parseFloat(p.amount) || 0 })),
      amountPaid: totalPaid, changeOwed,
      changeGiven: changeGivenAmt,
      changeStillOwed,
      amountOwing, payMethod: primaryMethod, vatEnabled,
      cashier: user?.name, cashierId: user?.id,
      createdAt: new Date().toISOString(),
    }

    for (const item of cart) {
      const product = products.find(p => p.sku === item.sku)
      if (!product) continue
      const result = deductStock(product, item.mode === 'box' ? 'box' : item.mode, item.qty)
      if (!result.ok) { showToast(`Stock error: ${item.name}`, 'error'); continue }
      await db.products.update(product.id, { stockBoxes: result.stockBoxes, stockUnits: result.stockUnits })
    }

    await saveSale(saleData)
    await logAudit('sale_completed', user, { ref, total: totals.grandTotal, items: cart.length })

    // Track change still owed
    if (changeStillOwed > 0 && (customer.trim() || effectiveName !== 'Walk-in')) {
      const { saveCreditTransaction } = await import('../lib/db')
      await saveCreditTransaction({
        saleRef: ref, customerId: finalCustomerId ? String(finalCustomerId) : '',
        customerName: effectiveName, type: 'change_owed', amount: changeStillOwed,
        note: `Change from sale ${ref}. Owed: $${changeOwed}, Given: $${changeGivenAmt}`,
        cashier: user?.name,
      })
    }

    // Track credit owed (invoice)
    if (amountOwing > 0 && primaryMethod === 'invoice' && effectiveName !== 'Walk-in') {
      const { saveCreditTransaction } = await import('../lib/db')
      await saveCreditTransaction({
        saleRef: ref, customerId: finalCustomerId ? String(finalCustomerId) : '',
        customerName: effectiveName, type: 'credit_owed', amount: amountOwing,
        note: `Credit from sale ${ref}`, cashier: user?.name,
      })
    }

    await refreshProducts()
    setPrintReceipt(saleData); setCheckoutModal(false); clearCart()
    setPayments([{ method: 'cash', amount: '' }]); setChangeActuallyGiven('')
  }

  const completeQuote = async () => {
    if (cart.length === 0) return
    const ref = genRef('QUO')
    const days = (await getSetting('default_quote_validity_days')) || 7
    const quoteData = {
      ref, type: 'quote', customer: customer || 'Customer',
      items: cart, ...totals, vatEnabled,
      cashier: user?.name, cashierId: user?.id,
      validUntil: new Date(Date.now() + days * 86400000).toISOString(),
    }
    await saveQuote(quoteData); setPrintReceipt(quoteData); clearCart()
  }

  const vatToggle = async () => {
    const next = !vatEnabled; setVatEnabled(next)
    await saveSetting('vat_enabled', next)
    await logAudit('vat_toggled', user, { enabled: next })
    showToast(`VAT ${next ? 'ON' : 'OFF'}`, next ? 'success' : 'info')
  }

  const categories = ['All', ...CATEGORIES]
  const quickFills = useMemo(() => getQuickFills(totals.grandTotal), [totals.grandTotal])

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-2 font-bold text-sm text-gray-900 flex-1 min-w-0">
          <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
            <ShoppingCart size={15} className="text-white" />
          </div>
          <span className="truncate">Point of Sale</span>
          {mode === 'quote' && <span className="badge-warning text-[10px] ml-1 shrink-0">QUOTE</span>}
        </div>
        <button onClick={() => setMode(m => m === 'sale' ? 'quote' : 'sale')}
          aria-label={`Switch to ${mode === 'quote' ? 'sale' : 'quote'} mode`}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition shrink-0 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none ${mode === 'quote' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          <FileText size={12} aria-hidden="true" />{mode === 'quote' ? 'Quote' : 'Sale'}
        </button>
        <button onClick={vatToggle}
          aria-label={`VAT is ${vatEnabled ? 'on' : 'off'}, click to toggle`}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition shrink-0 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none ${vatEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          VAT {vatEnabled ? 'ON' : 'OFF'}
        </button>
        <div aria-label={online ? 'Online' : 'Offline'} role="status" className={`flex items-center gap-1 text-[10px] font-semibold shrink-0 ${online ? 'text-emerald-600' : 'text-amber-500'}`}>
          {online ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Products panel */}
        <div className={`flex flex-col ${view === 'cart' ? 'hidden md:flex' : 'flex'} flex-1 overflow-hidden min-w-0`}>
          <div className="px-3 py-2 bg-white border-b border-gray-100 shrink-0">
            <div className="search-input-wrap">
              {lastScan
                ? <ScanLine className="search-icon text-emerald-500" size={13} />
                : <Search className="search-icon" size={13} />}
              <input ref={searchRef} defaultValue={search} onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search or scan SKU…" autoComplete="off" aria-label="Search products"
                className={`input py-2 text-xs transition-colors ${lastScan ? 'border-emerald-400 bg-emerald-50/60' : ''}`}
                style={{paddingRight: search ? '2rem' : undefined}} />
              {search && <button onClick={() => { handleSearchChange(''); setLastScan('') }} className="absolute right-3 top-1/2 -translate-y-1/2" style={{color:'var(--ink-tertiary)'}}><X size={13} /></button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2 pb-0.5">
              {categories.map(cat => (
                <button key={cat} onClick={() => handleCatSelect(cat)}
                  aria-pressed={selectedCat === cat && !search}
                  className={`cat-chip shrink-0 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none ${selectedCat === cat && !search ? 'cat-chip-active' : 'cat-chip-inactive'}`}>
                  {cat === 'All' ? 'All' : cat.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {search && (
            <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 shrink-0">
              <p className="text-[11px] text-blue-600 font-medium">
                {filteredProducts.length} of {products.length} products
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <Package size={32} className="mb-2 opacity-30" aria-hidden="true" />
                <p className="text-sm font-medium">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {filteredProducts.map(p => <ProductCard key={p.id} product={p} cart={cart} addedSku={addedSku} pressedSku={pressedSku} onPress={handleProductPress} />)}
              </div>
            )}
          </div>
        </div>

        {/* Cart panel */}
        <div className={`${view === 'products' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-72 lg:w-80 xl:w-96 bg-white border-l border-gray-100 shrink-0 overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <button className="md:hidden btn-ghost p-1.5 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none" aria-label="Back to products" onClick={() => setView('products')}>
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              <span className="font-bold text-gray-900 text-sm">
                Cart {cartCount > 0 && <span className="tabular-nums">· {cartCount}</span>}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {cart.length > 0 && (
                <>
                  <button onClick={() => { setHoldNameInput(customer || ''); setHoldNameModal(true) }}
                    aria-label="Hold sale"
                    className="btn-ghost p-1.5 text-amber-600 hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none">
                    <Pause size={15} aria-hidden="true" />
                  </button>
                  <button onClick={() => setShowSaleDiscount(true)} aria-label="Add sale discount" className="btn-ghost p-1.5 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none">
                    <Tag size={15} aria-hidden="true" />
                  </button>
                  <button onClick={clearCart} aria-label="Clear cart" className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none">
                    <RotateCcw size={14} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Customer search with autocomplete */}
          <div className="px-3 py-2 border-b border-gray-100 shrink-0 relative">
            <div className="relative">
              <input value={customer || customerSearch}
                onChange={e => handleCustomerInput(e.target.value)}
                placeholder="Customer name (optional)"
                autoComplete="name"
                aria-label="Customer name"
                className="input py-2 text-xs pr-8" />
              {customerId && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <UserCheck size={13} className="text-emerald-500" />
                </div>
              )}
            </div>
            {customerSuggestions.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {customerSuggestions.map(c => (
                  <button key={c.id} onClick={() => selectCustomer(c)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition">
                    <div className="w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 uppercase">
                      {c.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{c.name}</div>
                      {c.phone && <div className="text-[10px] text-gray-400">{c.phone}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedCustomerCredit && (
              <div className="mt-1.5 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                {selectedCustomerCredit.changeOwed > 0 && (
                  <p className="text-[10px] text-amber-700 font-semibold">
                    We owe {customer}: {fmt(selectedCustomerCredit.changeOwed)} change
                  </p>
                )}
                {selectedCustomerCredit.creditOwed > 0 && (
                  <p className="text-[10px] text-red-700 font-semibold">
                    {customer} owes us: {fmt(selectedCustomerCredit.creditOwed)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 no-scrollbar">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                <ShoppingCart size={36} className="mb-2" />
                <p className="text-xs font-medium">Tap a product to add it</p>
              </div>
            ) : cart.map(item => <CartRow key={`${item.sku}-${item.mode}-${item.subMode}`} item={item} products={products} onUpdateQty={updateQty} onRemove={removeFromCart} onOpenDiscount={openLineDiscount} onAddLoose={addLooseUnit} onToast={showToast} />)}
          </div>

          {saleDiscount > 0 && (
            <div className="mx-3 mb-2 flex items-center justify-between px-3 py-2 bg-brand-50 rounded-xl border border-brand-100">
              <span className="text-xs font-semibold text-brand-700">Sale discount</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-600">-{fmt(saleDiscount)}</span>
                <button onClick={() => setSaleDiscount(0)} className="text-brand-400 hover:text-brand-700"><X size={12} /></button>
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50 shrink-0 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span><span>{fmt(totals.subtotal)}</span>
              </div>
              {totals.lineDiscountTotal > 0 && (
                <div className="flex justify-between text-xs text-brand-600">
                  <span>Line discounts</span><span>-{fmt(totals.lineDiscountTotal)}</span>
                </div>
              )}
              {totals.saleDiscount > 0 && (
                <div className="flex justify-between text-xs text-brand-600">
                  <span>Sale disc.</span><span>-{fmt(totals.saleDiscount)}</span>
                </div>
              )}
              {vatEnabled && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>VAT 15%</span><span>{fmt(totals.vatAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-base pt-1 border-t border-gray-200">
                <span className="text-gray-900">TOTAL</span>
                <span className="text-brand-600 tabular-nums">{fmt(totals.grandTotal)}</span>
              </div>
            </div>
          )}

          <div className="px-3 py-3 border-t border-gray-100 shrink-0">
            {mode === 'quote' ? (
              <button onClick={completeQuote} disabled={cart.length === 0} className="btn-primary w-full py-3 disabled:opacity-40">
                <FileText size={16} />Generate Quote
              </button>
            ) : (
              <button onClick={() => { if (cart.length === 0) return; setPayments([{ method: 'cash', amount: String(totals.grandTotal) }]); setCheckoutModal(true) }}
                disabled={cart.length === 0} className="btn-primary w-full py-3 text-sm disabled:opacity-40 shadow-md">
                <DollarSign size={16} />Checkout — {fmt(totals.grandTotal)}
              </button>
            )}
          </div>
        </div>

        {/* Mobile cart FAB */}
        {view === 'products' && cart.length > 0 && (
          <button onClick={() => setView('cart')}
            className="md:hidden fixed bottom-20 right-4 z-30 flex items-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-2xl shadow-lg font-bold text-sm motion-safe:animate-scale-in">
            <ShoppingCart size={16} />
            <span>{cartCount}</span>
            <span className="text-brand-200 font-medium">{fmt(totals.grandTotal)}</span>
          </button>
        )}
      </div>

      {/* Price modal */}
      {priceModal && (
        <div className="modal-overlay animate-fade-in overscroll-contain" onClick={() => setPriceModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-900 text-sm">{priceModal.name}</p>
                <p className="text-[10px] text-gray-400 font-mono">{priceModal.sku}</p>
              </div>
              <button onClick={() => setPriceModal(null)} aria-label="Close" className="focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none rounded-lg p-0.5"><X size={17} className="text-gray-400" aria-hidden="true" /></button>
            </div>
            <div className="p-4 space-y-2.5">
              <p className="text-xs text-gray-500 font-medium mb-3">Select price type:</p>
              {priceModal.boxSize > 1 && priceModal.boxPrice > 0 && (
                <button onClick={() => handleAddWithMode(priceModal, 'box')}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-brand-400 hover:bg-brand-50 transition active:scale-95">
                  <div className="text-left">
                    <p className="font-bold text-sm text-gray-900">Box of {priceModal.boxSize}</p>
                    <p className="text-xs text-gray-400">Per unit: {fmt(priceModal.boxPrice / priceModal.boxSize)}</p>
                  </div>
                  <span className="text-xl font-black text-brand-600">{fmt(priceModal.boxPrice)}</span>
                </button>
              )}
              <button onClick={() => handleAddWithMode(priceModal, 'wholesale')}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50 transition active:scale-95">
                <div className="text-left">
                  <p className="font-bold text-sm text-gray-900">Wholesale</p>
                  <p className="text-xs text-gray-400">Trade price</p>
                </div>
                <span className="text-xl font-black text-blue-600">{fmt(priceModal.wholesalePrice)}</span>
              </button>
              <button onClick={() => handleAddWithMode(priceModal, 'retail')}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-emerald-400 hover:bg-emerald-50 transition active:scale-95">
                <div className="text-left">
                  <p className="font-bold text-sm text-gray-900">Retail</p>
                  <p className="text-xs text-gray-400">Walk-in price</p>
                </div>
                <span className="text-xl font-black text-emerald-600">{fmt(priceModal.retailPrice)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Line discount modal */}
      {lineDiscountModal && (
        <div className="modal-overlay animate-fade-in overscroll-contain" onClick={() => setLineDiscountModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-sm">Line Discount — {lineDiscountModal.name}</p>
              <button onClick={() => setLineDiscountModal(null)} aria-label="Close" className="focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none rounded-lg p-0.5"><X size={17} className="text-gray-400" aria-hidden="true" /></button>
            </div>
            <div className="p-4">
              <label htmlFor="line-discount-input" className="block text-xs font-medium text-gray-600 mb-2">Discount amount ($)</label>
              <input id="line-discount-input" type="number" inputMode="decimal" min="0" value={lineDiscountVal} onChange={e => setLineDiscountVal(e.target.value)}
                autoFocus className="input text-lg font-bold mb-4" placeholder="0.00" />
              <div className="flex gap-2">
                <button onClick={() => setLineDiscountModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={applyLineDiscount} className="btn-primary flex-1">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sale discount modal */}
      {showSaleDiscount && (
        <div className="modal-overlay animate-fade-in overscroll-contain" onClick={() => setShowSaleDiscount(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-sm">Sale Discount</p>
              <button onClick={() => setShowSaleDiscount(false)} aria-label="Close" className="focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none rounded-lg p-0.5"><X size={17} className="text-gray-400" aria-hidden="true" /></button>
            </div>
            <div className="p-4">
              <label htmlFor="sale-discount-input" className="block text-xs font-medium text-gray-600 mb-2">Discount amount ($)</label>
              <input id="sale-discount-input" type="number" inputMode="decimal" min="0" value={saleDiscountInput} onChange={e => setSaleDiscountInput(e.target.value)}
                autoFocus className="input text-lg font-bold mb-1" placeholder="0.00" />
              {saleDiscountInput && <p className="text-xs text-gray-400 mb-4">= {totals.subtotal > 0 ? ((parseFloat(saleDiscountInput) / totals.subtotal) * 100).toFixed(1) : 0}% off</p>}
              <div className="flex gap-2">
                <button onClick={() => setShowSaleDiscount(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={applySaleDiscount} className="btn-primary flex-1">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hold modal */}
      {holdNameModal && (
        <div className="modal-overlay animate-fade-in overscroll-contain" onClick={() => setHoldNameModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-sm">Hold Sale</p>
              <button onClick={() => setHoldNameModal(false)} aria-label="Close" className="focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none rounded-lg p-0.5"><X size={17} className="text-gray-400" aria-hidden="true" /></button>
            </div>
            <div className="p-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">Label (optional)</label>
              <input value={holdNameInput} onChange={e => setHoldNameInput(e.target.value)} autoFocus
                className="input mb-4" placeholder="Customer name or note…" />
              <div className="flex gap-2">
                <button onClick={() => setHoldNameModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => holdCurrentSale(holdNameInput)} className="btn-primary flex-1 bg-amber-500 hover:bg-amber-600">
                  <Pause size={14} />Hold Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout modal */}
      {checkoutModal && (
        <div className="modal-overlay animate-fade-in overscroll-contain" onClick={() => setCheckoutModal(false)}>
          <div className="modal-box-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900">Checkout — {fmt(totals.grandTotal)}</p>
              <button onClick={() => setCheckoutModal(false)} aria-label="Close" className="focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none rounded-lg p-0.5"><X size={17} className="text-gray-400" aria-hidden="true" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {/* Customer with autocomplete */}
              <div className="relative">
                <label className="block text-xs font-semibold mb-1.5" style={{color:'var(--ink-secondary)'}}>Customer</label>
                <input value={customer}
                  onChange={e => { handleCustomerInput(e.target.value) }}
                  autoComplete="name"
                  aria-label="Customer name"
                  className="input text-sm" placeholder="Walk-in customer (type to search)" />
                {customerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-lg z-20 overflow-hidden"
                    style={{background:'var(--surface-2)',border:'1px solid var(--surface-border-strong)'}}>
                    {customerSuggestions.map(c => (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left transition"
                        style={{color:'var(--ink-primary)'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface-3)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 uppercase"
                          style={{background:'rgba(220,38,38,0.15)',color:'var(--brand-400)'}}>
                          {c.name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{c.name}</div>
                          {c.phone && <div className="text-[10px]" style={{color:'var(--ink-tertiary)'}}>{c.phone}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!customer.trim() && changeOwed > 0 && (
                  <p className="text-[10px] mt-1 font-medium" style={{color:'#fbbf24'}}>Name required to track change owed</p>
                )}
              </div>

              {/* Payment methods */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600">Payments</label>
                  <button onClick={() => setPayments(p => [...p, { method: 'cash', amount: '' }])}
                    className="text-xs text-brand-600 font-semibold hover:text-brand-700 flex items-center gap-1">
                    <Plus size={12} />Split
                  </button>
                </div>
                <div className="space-y-2">
                  {payments.map((pmt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={pmt.method}
                        onChange={e => setPayments(prev => prev.map((p, j) => j === i ? { ...p, method: e.target.value } : p))}
                        className="input py-2 text-sm flex-1">
                        {PAY_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <input type="number" inputMode="decimal" min="0" step="0.01" value={pmt.amount}
                        onChange={e => setPayments(prev => prev.map((p, j) => j === i ? { ...p, amount: e.target.value } : p))}
                        className="input py-2 text-sm w-28" placeholder={fmt(totals.grandTotal)} />
                      {payments.length > 1 && (
                        <button onClick={() => setPayments(p => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 transition p-1.5">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick fill — smart suggestions */}
              {totals.grandTotal > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Quick fill</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {quickFills.map((amt, i) => (
                      <button key={i}
                        onClick={() => setPayments([{ method: payments[0]?.method || 'cash', amount: String(amt) }])}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                          i === 0 ? 'border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100' : 'border-gray-200 text-gray-700 hover:border-brand-300 hover:text-brand-700'
                        }`}>
                        {fmt(amt)}{i === 0 ? ' (exact)' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment summary */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total due</span><span className="font-bold text-gray-900">{fmt(totals.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Amount tendered</span>
                    <span className={`font-bold ${totalPaid >= totals.grandTotal ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {fmt(totalPaid)}
                    </span>
                  </div>
                </div>

                {changeOwed > 0 && (
                  <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-800">Change owed</span>
                      <span className="text-xl font-black text-emerald-700">{fmt(changeOwed)}</span>
                    </div>
                    <div>
                      <label className="block text-[10px] text-emerald-700 font-semibold mb-1">Change actually given</label>
                      <input type="number" inputMode="decimal" min="0" max={changeOwed} step="0.01"
                        value={changeActuallyGiven}
                        onChange={e => setChangeActuallyGiven(e.target.value)}
                        className="input text-sm py-1.5"
                        placeholder={`Max: ${fmt(changeOwed)}`} />
                    </div>
                    {changeStillOwed > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
                        <span className="text-xs font-semibold text-amber-800">Still owed to customer</span>
                        <span className="text-sm font-black text-amber-700">{fmt(changeStillOwed)}</span>
                      </div>
                    )}
                    {changeStillOwed > 0 && !customer.trim() && (
                      <p className="text-[10px] text-amber-600 font-medium">Add customer name to track this balance</p>
                    )}
                    {changeStillOwed === 0 && changeActuallyGiven && (
                      <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <Check size={10} />Full change given
                      </p>
                    )}
                  </div>
                )}

                {amountOwing > 0 && (
                  <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-amber-800">Amount owing</span>
                      <span className="text-xl font-black text-amber-700">{fmt(amountOwing)}</span>
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1">Will be tracked in Change & Credit</p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex gap-2 shrink-0">
              <button onClick={() => setCheckoutModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={completeSale} disabled={totalPaid <= 0 && !hasSplit}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-40">
                <CheckCircle2 size={16} />Complete Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt */}
      {printReceipt && (
        <Receipt record={printReceipt} shop={shopInfo} onClose={() => setPrintReceipt(null)}
          onSendWhatsApp={() => {
            const text = `*${shopInfo.name}*\nRef: ${printReceipt.ref}\nCustomer: ${printReceipt.customer}\nTotal: ${fmt(printReceipt.grandTotal)}\n\nThank you!`
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
          }} />
      )}

      {pinPrompt && (
        <PinDialog title={`Manager approval required — ${fmt(pinPrompt.amount)}`}
          onApprove={() => { pinPrompt.onApprove(); setPinPrompt(null) }}
          onCancel={() => setPinPrompt(null)} />
      )}

      <Toast toast={toast} />
    </div>
  )
}
