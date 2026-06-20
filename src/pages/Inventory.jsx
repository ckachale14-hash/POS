import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Search, Plus, Edit2, Trash2, Package, AlertTriangle, Download, Upload,
  X, ChevronDown, Filter, Box, Layers, RefreshCw, Check, Tag, ScanLine, History, Send, List,
} from 'lucide-react'
import { db, logAudit, getTotalUnits, autoConvert, getSetting, saveSetting, setSetting } from '../lib/db'
import { fmt, round2, roundUpStep } from '../lib/utils'
import { CATEGORIES, SHOP_INFO } from '../data/initial-inventory'
import { useBarcodeScanner } from '../lib/useBarcode'

const EMPTY_PRODUCT = {
  sku: '', name: '', category: CATEGORIES[0],
  productType: 'box',
  boxOnly: 0,
  boxPrice: '', boxSize: 1,
  wholesalePrice: '', retailPrice: '', costPrice: '',
  stockBoxes: 0, stockUnits: 0, active: 1,
}

// True when a field holds no usable price (empty or zero).
const blankPrice = (v) => v === '' || v == null || parseFloat(v) === 0

function StockDisplay({ product }) {
  const boxes = product.stockBoxes || 0
  const units = product.stockUnits || 0
  const total = getTotalUnits(product)

  if (product.boxSize <= 1 || (boxes === 0 && units === 0)) {
    return (
      <span className={`badge ${total <= 0 ? 'badge-danger' : total < 5 ? 'badge-warning' : 'badge-success'}`}>
        {total} units
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {boxes > 0 && (
        <span className="stock-boxes text-[10px]">
          <Box size={9} />{boxes} {boxes === 1 ? 'box' : 'boxes'}
        </span>
      )}
      {units > 0 && (
        <span className="stock-units text-[10px]">
          <Layers size={9} />{units} units
        </span>
      )}
      {boxes === 0 && units === 0 && (
        <span className="badge-danger text-[10px]">Out of stock</span>
      )}
      <span className="text-[9px] text-gray-400">{total} total</span>
    </div>
  )
}

export default function Inventory({ user }) {
  const readOnly = user?.role === 'cashier'
  const [products, setProducts]         = useState([])
  const [search, setSearch]             = useState('')
  const [catFilter, setCatFilter]       = useState('All')
  const [stockFilter, setStockFilter]   = useState('all')
  const [editModal, setEditModal]       = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [stockAdjModal, setStockAdjModal] = useState(null)
  const [adjVal, setAdjVal]             = useState('')
  const [adjType, setAdjType]           = useState('units')
  const [adjDelta, setAdjDelta]         = useState('add')
  const [adjReason, setAdjReason]       = useState('')
  const [toast, setToast]               = useState('')
  const [importModal, setImportModal]   = useState(false)
  const [importText, setImportText]     = useState('')
  const [autoConvertEnabled, setAutoConvertEnabled] = useState(true)
  const [roundMode, setRoundMode] = useState('none')

  const [customCategories, setCustomCategories] = useState([])
  const [catModal, setCatModal]               = useState(false)
  const [newCatInput, setNewCatInput]         = useState('')
  const [historyModal, setHistoryModal]       = useState(null) // product object
  const [historyRows, setHistoryRows]         = useState([])
  const [wholesaleModal, setWholesaleModal]   = useState(false)

  const searchRef = useRef(null)

  const showToast = (msg, type = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(''), 2500) }
  const load = async () => { const p = await db.products.toArray(); setProducts(p) }

  // Barcode scanner — when user scans a SKU while on Inventory, filter to it.
  // If it matches exactly one product and no modal is open, open its edit form.
  const handleScan = useCallback((code) => {
    if (editModal || deleteConfirm || stockAdjModal || importModal || historyModal) return
    setSearch(code)
    if (searchRef.current) searchRef.current.value = code
    const matches = products.filter(p => p.active && p.sku && p.sku.toLowerCase() === code.toLowerCase())
    if (matches.length === 1 && !readOnly) {
      setEditModal({ ...matches[0] })
    } else if (matches.length === 0) {
      showToast(`SKU not found: ${code}`, 'warning')
    }
  }, [editModal, deleteConfirm, stockAdjModal, importModal, historyModal, products, readOnly])

  useBarcodeScanner(handleScan)

  const openHistory = useCallback(async (product) => {
    const rows = await db.stockMovements.where('productId').equals(product.id).reverse().sortBy('timestamp')
    setHistoryRows(rows)
    setHistoryModal(product)
  }, [])

  // Load custom categories from settings
  const loadCategories = async () => {
    const saved = await getSetting('custom_categories', null)
    if (saved && Array.isArray(saved)) setCustomCategories(saved)
  }

  const saveCategories = async (cats) => {
    setCustomCategories(cats)
    await saveSetting('custom_categories', cats)
  }

  const addCategory = async () => {
    const name = newCatInput.trim()
    if (!name || customCategories.includes(name) || CATEGORIES.includes(name)) {
      showToast('Category already exists or invalid', 'error'); return
    }
    await saveCategories([...customCategories, name])
    setNewCatInput('')
    showToast(`Category "${name}" added`, 'success')
  }

  const deleteCategory = async (cat) => {
    const inUse = products.some(p => p.category === cat)
    if (inUse) { showToast('Cannot delete — category is in use by products', 'error'); return }
    await saveCategories(customCategories.filter(c => c !== cat))
    showToast(`Category "${cat}" removed`, 'info')
  }

  useEffect(() => {
    load()
    loadCategories()
    getSetting('auto_convert_stock', true).then(v => setAutoConvertEnabled(!!v))
    getSetting('ws_round_mode', 'none').then(v => setRoundMode(v || 'none'))
  }, [])

  const allCategories = useMemo(() => [...CATEGORIES, ...customCategories], [customCategories])

  // Auto-fill the blank price from its counterpart, using units-per-box.
  // Only ever fills an empty field — a price you typed is never overwritten,
  // so deliberate box discounts survive. Box→unit divides (and rounds up per the
  // shop's rule); unit→box multiplies (exact).
  const editBoxPrice = (v) => setEditModal(m => {
    const next = { ...m, boxPrice: v }
    const size = parseInt(next.boxSize) || 1
    if (size > 1 && parseFloat(v) > 0 && blankPrice(next.wholesalePrice)) {
      next.wholesalePrice = String(roundUpStep(parseFloat(v) / size, roundMode))
    }
    return next
  })
  const editWholesale = (v) => setEditModal(m => {
    const next = { ...m, wholesalePrice: v }
    const size = parseInt(next.boxSize) || 1
    if (size > 1 && parseFloat(v) > 0 && blankPrice(next.boxPrice)) {
      next.boxPrice = String(round2(parseFloat(v) * size))
    }
    return next
  })
  const editBoxSize = (v) => setEditModal(m => {
    const next = { ...m, boxSize: v }
    const size = parseInt(v) || 1
    if (size > 1) {
      if (!blankPrice(next.boxPrice) && blankPrice(next.wholesalePrice)) {
        next.wholesalePrice = String(roundUpStep(parseFloat(next.boxPrice) / size, roundMode))
      } else if (!blankPrice(next.wholesalePrice) && blankPrice(next.boxPrice)) {
        next.boxPrice = String(round2(parseFloat(next.wholesalePrice) * size))
      }
    }
    return next
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (!p.active) return false
      const matchCat   = catFilter === 'All' || p.category === catFilter
      const matchQ     = !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
      const total      = getTotalUnits(p)
      const matchStock = stockFilter === 'all' ? true
        : stockFilter === 'low'  ? total < 5 && total > 0
        : stockFilter === 'out'  ? total <= 0
        : true
      return matchCat && matchQ && matchStock
    })
  }, [products, search, catFilter, stockFilter])

  const saveProduct = async (data) => {
    const { id, ...rest } = data
    const isBoxType = (rest.productType || 'box') === 'box'
    let { stockBoxes, stockUnits, boxSize } = rest

    stockBoxes = isBoxType ? (parseInt(stockBoxes) || 0) : 0
    stockUnits = parseInt(stockUnits) || 0

    // Auto-convert on save (box type only)
    if (isBoxType && autoConvertEnabled) {
      const converted = autoConvert(stockBoxes, stockUnits, parseInt(boxSize) || 1, true)
      stockBoxes = converted.stockBoxes
      stockUnits = converted.stockUnits
    }

    const payload = {
      ...rest,
      productType:    rest.productType || 'box',
      boxPrice:       isBoxType ? (parseFloat(rest.boxPrice) || 0) : 0,
      boxSize:        isBoxType ? (parseInt(rest.boxSize) || 1) : 1,
      boxOnly:        isBoxType && rest.boxOnly ? 1 : 0,
      wholesalePrice: parseFloat(rest.wholesalePrice) || 0,
      retailPrice:    parseFloat(rest.retailPrice) || 0,
      costPrice:      parseFloat(rest.costPrice) || 0,
      stockBoxes, stockUnits,
      active: 1,
    }

    // Set updatedAt so pushProducts() in sync.js sees this as changed
    payload.updatedAt = new Date().toISOString()

    if (id) { await db.products.update(id, payload); showToast('Product updated', 'success') }
    else    { await db.products.add(payload); showToast('Product added', 'success') }

    await logAudit(id ? 'product_edited' : 'product_added', user, { sku: payload.sku })
    setEditModal(null)
    await load()
  }

  const deleteProduct = async (p) => {
    await db.products.update(p.id, { active: 0 })
    await logAudit('product_deleted', user, { sku: p.sku })
    setDeleteConfirm(null); showToast('Product removed'); await load()
  }

  const applyStockAdj = async () => {
    if (!stockAdjModal) return
    const p = stockAdjModal
    const val = parseInt(adjVal) || 0
    if (val <= 0) { showToast('Enter a valid amount', 'error'); return }

    let { stockBoxes = 0, stockUnits = 0, boxSize = 1 } = p
    const mult = adjDelta === 'add' ? 1 : -1

    if (adjType === 'boxes') {
      stockBoxes = Math.max(0, stockBoxes + mult * val)
    } else {
      stockUnits = Math.max(0, stockUnits + mult * val)
    }

    if (autoConvertEnabled) {
      const converted = autoConvert(stockBoxes, stockUnits, boxSize, true)
      stockBoxes = converted.stockBoxes
      stockUnits = converted.stockUnits
    }

    // Set updatedAt so pushProducts() in sync.js includes this adjustment
    await db.products.update(p.id, { stockBoxes, stockUnits, updatedAt: new Date().toISOString() })
    await db.stockMovements.add({
      productId: p.id,
      type: adjDelta === 'add' ? 'adjustment-in' : 'adjustment-out',
      qty: val,
      balanceUnits: stockBoxes * boxSize + stockUnits,
      ref: adjReason,
      userId: user?.id,
      timestamp: new Date().toISOString(),
    })
    await logAudit('stock_adjusted', user, { sku: p.sku, type: adjType, delta: mult * val, reason: adjReason })
    setStockAdjModal(null); setAdjVal(''); setAdjReason('')
    showToast(`Stock updated`, 'success'); await load()
  }

  const exportCSV = () => {
    const rows = [['SKU','Name','Category','Box Price','Box Size','Wholesale','Retail','Cost','Stock Boxes','Stock Units','Total Units']]
    products.filter(p => p.active).forEach(p => rows.push([
      p.sku, p.name, p.category, p.boxPrice, p.boxSize,
      p.wholesalePrice, p.retailPrice, p.costPrice,
      p.stockBoxes || 0, p.stockUnits || 0, getTotalUnits(p),
    ]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'inventory.csv'; a.click()
    showToast('Exported!')
  }

  const importCSV = async () => {
    const lines = importText.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    let count = 0
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const vals = line.split(',')
      const obj = {}
      headers.forEach((h, i) => obj[h] = vals[i]?.trim() || '')
      const stockBoxes = parseInt(obj['stock boxes'] || obj.stock_boxes || 0)
      const stockUnits = parseInt(obj['stock units'] || obj.stock_units || obj.stock || 0)
      const payload = {
        sku: obj.sku || '', name: obj.name || '',
        category: obj.category || CATEGORIES[0],
        boxPrice: parseFloat(obj['box price'] || 0),
        boxSize: parseInt(obj['box size'] || 1),
        wholesalePrice: parseFloat(obj.wholesale || 0),
        retailPrice: parseFloat(obj.retail || 0),
        costPrice: parseFloat(obj.cost || 0),
        stockBoxes, stockUnits, active: 1,
      }
      if (!payload.sku || !payload.name) continue
      const ex = await db.products.where('sku').equals(payload.sku).first()
      if (ex) await db.products.update(ex.id, payload)
      else await db.products.add(payload)
      count++
    }
    setImportModal(false); setImportText('')
    showToast(`Imported ${count} products`, 'success'); await load()
  }

  const lowCount  = products.filter(p => { const t = getTotalUnits(p); return t < 5 && t > 0 && p.active }).length
  const outCount  = products.filter(p => getTotalUnits(p) <= 0 && p.active).length
  const activeCount = products.filter(p => p.active).length

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="section-header">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-black text-gray-900">Inventory</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeCount} products · {lowCount > 0 && <span className="text-amber-600">{lowCount} low</span>}
              {lowCount > 0 && outCount > 0 && ' · '}
              {outCount > 0 && <span className="text-red-600">{outCount} out of stock</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary py-2 px-3 text-xs gap-1.5">
              <Download size={13} />Export
            </button>
            <button onClick={() => setWholesaleModal(true)} className="btn-secondary py-2 px-3 text-xs gap-1.5">
              <List size={13} />Wholesale List
            </button>
            {!readOnly && (
              <>
                <button onClick={() => setImportModal(true)} className="btn-secondary py-2 px-3 text-xs gap-1.5">
                  <Upload size={13} />Import
                </button>
                <button onClick={() => setCatModal(true)} className="btn-secondary py-2 px-3 text-xs gap-1.5">
                  <Tag size={13} />Categories
                </button>
                <button onClick={() => setEditModal({ ...EMPTY_PRODUCT })} className="btn-primary py-2 px-3 text-xs gap-1.5">
                  <Plus size={13} />Add Product
                </button>
              </>
            )}
            {readOnly && (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                Read only
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products…" className="input pl-8 py-2 text-xs w-full"
            />
          </div>
          <select
            value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="input py-2 text-xs pr-8"
          >
            <option value="All">All Categories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={stockFilter} onChange={e => setStockFilter(e.target.value)}
            className="input py-2 text-xs"
          >
            <option value="all">All Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Auto-convert banner */}
      <div className={`px-4 py-2 text-xs flex items-center justify-between border-b shrink-0 ${
        autoConvertEnabled ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-500'
      }`}>
        <span className="flex items-center gap-1.5">
          <RefreshCw size={11} />
          Auto-convert units → boxes: <strong>{autoConvertEnabled ? 'ON' : 'OFF'}</strong>
        </span>
        <button
          onClick={async () => {
            const next = !autoConvertEnabled
            setAutoConvertEnabled(next)
            await setSetting('auto_convert_stock', next)
            showToast(`Auto-convert ${next ? 'enabled' : 'disabled'}`)
          }}
          className="text-xs font-semibold underline"
        >
          {autoConvertEnabled ? 'Disable' : 'Enable'}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" style={{ minWidth: 0 }}>
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th className="text-right">Box Price</th>
              <th className="text-right">Wholesale</th>
              <th className="text-right">Retail</th>
              <th className="text-right">Cost</th>
              <th className="text-center">Stock</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-gray-400">
                  <Package size={32} className="mx-auto mb-2 opacity-30" />
                  No products found
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const total = getTotalUnits(p)
              return (
                <tr key={p.id} className="group">
                  <td>
                    <div className="font-semibold text-gray-900 text-xs">{p.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
                  </td>
                  <td><span className="badge-info text-[10px]">{p.category}</span></td>
                  <td className="text-right text-xs">
                    {p.boxSize > 1 ? (
                      <div>
                        <div className="font-semibold">{fmt(p.boxPrice)}</div>
                        <div className="text-[10px] text-gray-400">÷{p.boxSize}</div>
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="text-right text-xs font-semibold">{fmt(p.wholesalePrice)}</td>
                  <td className="text-right text-xs font-bold text-gray-900">{fmt(p.retailPrice)}</td>
                  <td className="text-right text-xs text-gray-500">{fmt(p.costPrice)}</td>
                  <td className="text-center">
                    {readOnly ? (
                      <StockDisplay product={p} />
                    ) : (
                      <button
                        onClick={() => { setStockAdjModal(p); setAdjVal(''); setAdjType('units'); setAdjDelta('add'); setAdjReason('') }}
                        className="hover:opacity-70 transition"
                      >
                        <StockDisplay product={p} />
                      </button>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => openHistory(p)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
                        title="Stock history"
                      >
                        <History size={13} />
                      </button>
                      {!readOnly && (
                        <>
                          <button
                            onClick={() => setEditModal({ ...p })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(p)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Edit/Add product modal ── */}
      {editModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setEditModal(null)}>
          <div className="modal-box-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900">{editModal.id ? 'Edit Product' : 'Add Product'}</p>
              <button onClick={() => setEditModal(null)}><X size={17} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">

              {/* Product type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Product Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'box',   label: 'Box / Units', desc: 'Sold by box or loose unit' },
                    { value: 'set',   label: 'Set',         desc: 'Sold as a complete set only' },
                    { value: 'piece', label: 'Piece',       desc: 'Sold individually, no box' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditModal(m => ({ ...m, productType: opt.value }))}
                      className={`p-2.5 rounded-xl border-2 text-left transition ${
                        (editModal.productType || 'box') === opt.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">SKU *</label>
                  <input value={editModal.sku} onChange={e => setEditModal(m => ({ ...m, sku: e.target.value }))}
                    className="input text-sm" placeholder="OIL-GTX-5L" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={editModal.category} onChange={e => setEditModal(m => ({ ...m, category: e.target.value }))} className="input text-sm">
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
                <input value={editModal.name} onChange={e => setEditModal(m => ({ ...m, name: e.target.value }))}
                  className="input text-sm" placeholder="Delo Engine Oil 5L" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Wholesale Price ($)
                    {(editModal.productType === 'set') && <span className="ml-1 text-gray-400 font-normal">per set</span>}
                    {(editModal.productType === 'piece') && <span className="ml-1 text-gray-400 font-normal">each</span>}
                  </label>
                  <input type="number" inputMode="decimal" value={editModal.wholesalePrice} onChange={e => editWholesale(e.target.value)} className="input text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Retail Price ($)
                    {(editModal.productType === 'set') && <span className="ml-1 text-gray-400 font-normal">per set</span>}
                    {(editModal.productType === 'piece') && <span className="ml-1 text-gray-400 font-normal">each</span>}
                  </label>
                  <input type="number" inputMode="decimal" value={editModal.retailPrice} onChange={e => setEditModal(m => ({ ...m, retailPrice: e.target.value }))} className="input text-sm" />
                </div>
              </div>

              {/* Box-only fields */}
              {(editModal.productType || 'box') === 'box' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Box Price ($)</label>
                      <input type="number" inputMode="decimal" value={editModal.boxPrice} onChange={e => editBoxPrice(e.target.value)} className="input text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Units per Box</label>
                      <input type="number" min="1" value={editModal.boxSize} onChange={e => editBoxSize(e.target.value)} className="input text-sm" />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!editModal.boxOnly}
                      onChange={e => setEditModal(m => ({ ...m, boxOnly: e.target.checked ? 1 : 0 }))}
                      className="w-4 h-4 accent-amber-600"
                    />
                    <span className="text-xs">
                      <span className="font-semibold text-amber-800">Sell as whole box/container only</span>
                      <span className="block text-[10px] text-amber-600">Locks loose-unit sales — e.g. a sealed pack of clips</span>
                    </span>
                  </label>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price ($)</label>
                <input type="number" inputMode="decimal" value={editModal.costPrice} onChange={e => setEditModal(m => ({ ...m, costPrice: e.target.value }))} className="input text-sm" />
              </div>

              {/* Stock entry — box type */}
              {(editModal.productType || 'box') === 'box' && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5">
                    <Box size={12} />Stock Quantities
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium text-blue-700 mb-1">
                        Boxes (×{editModal.boxSize || 1} units each)
                      </label>
                      <input
                        type="number" min="0"
                        value={editModal.stockBoxes || 0}
                        onChange={e => setEditModal(m => ({ ...m, stockBoxes: e.target.value }))}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-blue-700 mb-1">Loose Units</label>
                      <input
                        type="number" min="0"
                        value={editModal.stockUnits || 0}
                        onChange={e => setEditModal(m => ({ ...m, stockUnits: e.target.value }))}
                        className="input text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-1.5">
                    Total: {(parseInt(editModal.stockBoxes) || 0) * (parseInt(editModal.boxSize) || 1) + (parseInt(editModal.stockUnits) || 0)} units
                    {autoConvertEnabled && parseInt(editModal.stockUnits) >= parseInt(editModal.boxSize) && parseInt(editModal.boxSize) > 1 && (
                      <span className="ml-1 text-amber-600">· Will auto-convert on save</span>
                    )}
                  </p>
                </div>
              )}

              {/* Stock entry — set / piece type */}
              {(editModal.productType === 'set' || editModal.productType === 'piece') && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5">
                    <Layers size={12} />
                    {editModal.productType === 'set' ? 'Sets in Stock' : 'Pieces in Stock'}
                  </p>
                  <input
                    type="number" min="0"
                    value={editModal.stockUnits || 0}
                    onChange={e => setEditModal(m => ({ ...m, stockUnits: e.target.value }))}
                    className="input text-sm"
                  />
                  <p className="text-[10px] text-blue-600 mt-1.5">
                    {parseInt(editModal.stockUnits) || 0} {editModal.productType === 'set' ? 'sets' : 'pieces'} in stock
                  </p>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex gap-2 shrink-0">
              <button onClick={() => setEditModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => saveProduct(editModal)}
                disabled={!editModal.sku || !editModal.name}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                Save Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock adjustment modal ── */}
      {stockAdjModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setStockAdjModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-sm">Adjust Stock</p>
                <p className="text-xs text-gray-400">{stockAdjModal.name}</p>
              </div>
              <button onClick={() => setStockAdjModal(null)}><X size={17} className="text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <StockDisplay product={stockAdjModal} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAdjDelta('add')}
                  className={`py-2 rounded-xl text-xs font-bold border-2 transition ${adjDelta === 'add' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}
                >
                  + Add Stock
                </button>
                <button
                  onClick={() => setAdjDelta('remove')}
                  className={`py-2 rounded-xl text-xs font-bold border-2 transition ${adjDelta === 'remove' ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}
                >
                  − Remove Stock
                </button>
              </div>

              {stockAdjModal.boxSize > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAdjType('units')}
                    className={`py-2 rounded-xl text-xs font-semibold border-2 transition ${adjType === 'units' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}
                  >
                    <Layers size={12} className="inline mr-1" />Units
                  </button>
                  <button
                    onClick={() => setAdjType('boxes')}
                    className={`py-2 rounded-xl text-xs font-semibold border-2 transition ${adjType === 'boxes' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}
                  >
                    <Box size={12} className="inline mr-1" />Boxes
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Quantity ({adjType})
                </label>
                <input
                  type="number" min="1" value={adjVal} onChange={e => setAdjVal(e.target.value)}
                  autoFocus className="input text-lg font-bold" placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                <input value={adjReason} onChange={e => setAdjReason(e.target.value)}
                  className="input text-sm" placeholder="Stock take, purchase, etc." />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStockAdjModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={applyStockAdj} className="btn-primary flex-1">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="modal-overlay animate-fade-in" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <p className="font-bold text-gray-900 mb-1">Remove Product?</p>
              <p className="text-sm text-gray-500 mb-5">{deleteConfirm.name} will be hidden from the POS</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={() => deleteProduct(deleteConfirm)} className="btn-danger flex-1">Remove</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import modal ── */}
      {importModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setImportModal(false)}>
          <div className="modal-box-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900">Import CSV</p>
              <button onClick={() => setImportModal(false)}><X size={17} className="text-gray-400" /></button>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                Paste CSV with headers: sku, name, category, box price, box size, wholesale, retail, cost, stock boxes, stock units
              </p>
              <textarea
                value={importText} onChange={e => setImportText(e.target.value)}
                rows={10} className="input font-mono text-xs resize-none flex-1"
                placeholder="sku,name,category,box price,box size,wholesale,retail,cost,stock boxes,stock units&#10;OIL-GTX-5L,GTX Oil 5L,Oils & Lubricants,80,4,20,23,18,0,25"
              />
              <div className="flex gap-2">
                <button onClick={() => setImportModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={importCSV} className="btn-primary flex-1">Import</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {/* Category Management Modal */}
      {catModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setCatModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-sm">Manage Categories</p>
              <button onClick={() => setCatModal(false)}><X size={17} className="text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Add new */}
              <div className="flex gap-2">
                <input value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="New category name…" className="input text-sm flex-1" />
                <button onClick={addCategory} className="btn-primary px-3 py-2">
                  <Plus size={14} />Add
                </button>
              </div>
              {/* Built-in categories */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold mb-2 uppercase tracking-wide">Built-in (read-only)</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <span key={c} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{c}</span>
                  ))}
                </div>
              </div>
              {/* Custom categories */}
              {customCategories.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold mb-2 uppercase tracking-wide">Custom</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customCategories.map(c => (
                      <div key={c} className="flex items-center gap-1 px-2.5 py-1 bg-brand-50 border border-brand-200 text-brand-700 rounded-full text-xs font-medium">
                        {c}
                        <button onClick={() => deleteCategory(c)} className="hover:text-red-600 transition ml-0.5">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Stock history modal ── */}
      {historyModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setHistoryModal(null)}>
          <div className="modal-box-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-sm">Stock History</p>
                <p className="text-xs text-gray-400">{historyModal.name} · {historyModal.sku}</p>
              </div>
              <button onClick={() => setHistoryModal(null)}><X size={17} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {historyRows.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <History size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No movements recorded</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400">Type</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400">Qty</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400">Balance</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 hidden sm:table-cell">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r, i) => {
                      const isIn = r.type === 'adjustment-in' || r.type === 'return' || r.type === 'receive'
                      const typeLabel = { 'adjustment-in': 'Stock In', 'adjustment-out': 'Stock Out', 'return': 'Return', 'sale': 'Sale', 'receive': 'Received' }[r.type] || r.type
                      return (
                        <tr key={r.id || i} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="px-4 py-2.5 text-xs text-gray-500">
                            {new Date(r.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-semibold ${isIn ? 'text-green-600' : 'text-red-500'}`}>{typeLabel}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: isIn ? '#10b981' : '#ef4444' }}>
                            {isIn ? '+' : '−'}{r.qty}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-gray-600 font-mono">
                            {r.balanceUnits ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 hidden sm:table-cell truncate max-w-[120px]">{r.ref || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Wholesale price list modal ── */}
      {wholesaleModal && (
        <WholesaleModal products={products} onClose={() => setWholesaleModal(false)} />
      )}

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'error' ? 'toast-error' : 'toast-info'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function WholesaleModal({ products, onClose }) {
  const [shopInfo, setShopInfo] = useState({})

  useEffect(() => {
    ;(async () => {
      const sn = await getSetting('shop_name')
      const sp = await getSetting('shop_phones')
      setShopInfo({ name: sn, phones: sp?.split(',') || [] })
    })()
  }, [])

  // Box-first pricing: when a real box exists (size > 1 with a price) we quote the
  // box only — never the per-unit rate for that product. Items with no box fall
  // back to per-unit wholesale. Inventory order is preserved throughout, so both
  // the category sequence and the items inside each follow the database order.
  const priced = useMemo(() => products
    .filter(p => p.active)
    .map(p => {
      const hasBox = p.boxSize > 1 && p.boxPrice > 0
      if (hasBox) return { name: p.name, category: p.category, box: p.boxSize, price: parseFloat(p.boxPrice) }
      if (p.wholesalePrice > 0) return { name: p.name, category: p.category, box: null, price: parseFloat(p.wholesalePrice) }
      return null
    })
    .filter(Boolean), [products])

  // Categories in first-seen (inventory) order.
  const orderedCategories = useMemo(() => {
    const seen = []
    priced.forEach(p => { if (!seen.includes(p.category)) seen.push(p.category) })
    return seen
  }, [priced])

  // Which categories to include. null = uninitialised; defaults to everything.
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    if (selected === null && orderedCategories.length) setSelected(new Set(orderedCategories))
  }, [orderedCategories, selected])
  const sel = selected || new Set()

  const toggleCat = (cat) => setSelected(prev => {
    const next = new Set(prev || [])
    if (next.has(cat)) next.delete(cat); else next.add(cat)
    return next
  })
  const selectAll = () => setSelected(new Set(orderedCategories))
  const clearAll  = () => setSelected(new Set())

  // Selected categories → their priced items, dropping any empty group.
  const groups = useMemo(() => orderedCategories
    .filter(cat => sel.has(cat))
    .map(cat => ({ cat, items: priced.filter(p => p.category === cat) }))
    .filter(g => g.items.length > 0), [orderedCategories, sel, priced])

  const itemCount = groups.reduce((n, g) => n + g.items.length, 0)

  const buildText = () => {
    const lines = []
    lines.push(`*${shopInfo.name || 'PORTIONSPOT MOTORS'} — Wholesale Price List*`)
    const phoneList = Array.isArray(shopInfo.phones)
      ? shopInfo.phones.filter(Boolean).join(' / ')
      : ''
    if (phoneList) lines.push(phoneList)
    lines.push(`_Updated: ${new Date().toLocaleDateString('en-GB')}_`)

    groups.forEach(g => {
      lines.push('')
      lines.push(`*${g.cat.toUpperCase()}*`)
      g.items.forEach(p => {
        const unit = p.box ? ` (x${p.box})` : ''
        lines.push(`  ${p.name}${unit} — $${p.price.toFixed(2)}`)
      })
    })

    return lines.join('\n').trim()
  }

  const handleWhatsApp = () => {
    const text = buildText()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const handlePdf = () => {
    const body = groups.map(g => {
      const head = `<tr><td colspan="2" class="cat">${g.cat}</td></tr>`
      const items = g.items.map(p => {
        const unit = p.box ? ` <span class="u">(x${p.box})</span>` : ''
        return `<tr><td>${p.name}${unit}</td><td style="text-align:right">$${p.price.toFixed(2)}</td></tr>`
      }).join('')
      return head + items
    }).join('')
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Wholesale Price List</title>
<style>body{font-family:sans-serif;padding:20px;max-width:600px}h2{margin-bottom:4px}p{color:#666;font-size:13px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}th{text-align:left;border-bottom:2px solid #000;padding:6px}
td{padding:5px 6px;border-bottom:1px solid #eee}.u{color:#888;font-size:12px}
td.cat{font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.04em;background:#f1f1f1;border-bottom:1px solid #ccc;padding-top:10px}
@media print{@page{margin:10mm}}</style></head><body>
<h2>${shopInfo.name || 'PORTIONSPOT MOTORS'} — Wholesale Price List</h2>
<p>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
<table><thead><tr><th>Product</th><th style="text-align:right">Price</th></tr></thead>
<tbody>${body}</tbody></table>
<script>window.onload=function(){window.print()}<\/script></body></html>`
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const text = buildText()
  const allOn = orderedCategories.length > 0 && sel.size === orderedCategories.length

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-900 text-sm">Wholesale Price List</p>
            <p className="text-xs text-gray-400">{itemCount} item(s) · {sel.size}/{orderedCategories.length} categories</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={17} className="text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categories</p>
              <div className="flex gap-1.5">
                <button onClick={selectAll} className="text-xs font-medium text-brand-600 hover:text-brand-700 px-1.5 py-0.5">All</button>
                <button onClick={clearAll} className="text-xs font-medium text-gray-400 hover:text-gray-600 px-1.5 py-0.5">Clear</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {orderedCategories.map(cat => {
                const on = sel.has(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition active:scale-95 ${on ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {on && <Check size={11} aria-hidden="true" />}
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 rounded-xl p-3 leading-relaxed">
            {text || (allOn
              ? 'No items with box or wholesale pricing found.\nAdd box prices or wholesale prices in Inventory.'
              : 'No categories selected. Tap a category above to include it.')}
          </pre>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex gap-2 shrink-0">
          <button onClick={handlePdf} disabled={itemCount === 0} className="btn-secondary flex-1 gap-2 disabled:opacity-40 disabled:pointer-events-none">
            <Download size={14} />PDF
          </button>
          <button onClick={handleWhatsApp} disabled={itemCount === 0} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none">
            <Send size={14} />WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}
