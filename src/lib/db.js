import Dexie from 'dexie'

export const db = new Dexie('PortionSpotPOS')

// v2: adds stockBoxes/stockUnits split, creditTransactions, updated sync fields
db.version(2).stores({
  products:   '++id, sku, name, category, active, stockBoxes, stockUnits',
  sales:      '++id, ref, type, status, cashier, payMethod, customerId, createdAt, syncedAt',
  users:      '++id, &username, role, active',
  customers:  '++id, localId, name, phone, isTradeAccount, syncedAt',
  creditTransactions: '++id, localId, saleId, customerId, type, settled, createdAt, syncedAt',
  suppliers:  '++id, name, phone',
  purchaseOrders: '++id, ref, supplierId, status, createdAt',
  expenses:   '++id, category, date',
  auditLog:   '++id, action, userId, timestamp',
  settings:   '&key',
  stockMovements: '++id, productId, type, timestamp',
  syncQueue:  '++id, table, recordId, createdAt',
}).upgrade(tx => {
  // Migrate existing products: stock → stockBoxes=0, stockUnits=existing stock
  return tx.table('products').toCollection().modify(product => {
    if (product.stockBoxes === undefined) {
      product.stockUnits = product.stock || 0
      product.stockBoxes = 0
      delete product.stock
    }
  })
})

// ── Settings ──────────────────────────────────────────────────────────────
export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key)
  return row ? row.value : fallback
}
export async function setSetting(key, value) {
  await db.settings.put({ key, value })
}
export const saveSetting = setSetting

// ── Audit ──────────────────────────────────────────────────────────────────
export async function logAudit(action, user, details = {}) {
  await db.auditLog.add({
    action,
    userId:   user?.id   || null,
    userName: user?.name || 'system',
    details:  JSON.stringify(details),
    timestamp: new Date().toISOString(),
  })
}

// ── Sync queue ─────────────────────────────────────────────────────────────
export async function queueSync(table, recordId, op, payload) {
  await db.syncQueue.add({
    table, recordId, op,
    payload: JSON.stringify(payload),
    attempts: 0,
    createdAt: new Date().toISOString(),
  })
}

// ── Reference generator ────────────────────────────────────────────────────
export function genRef(prefix = 'PSM') {
  const d = new Date()
  const dp = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  return `${prefix}-${dp}-${Math.floor(Math.random() * 9000 + 1000)}`
}

// ── Products ───────────────────────────────────────────────────────────────
export async function getAllProducts() {
  return db.products.where('active').notEqual(0).toArray()
}

/**
 * Get total units for a product (boxes × boxSize + loose units)
 */
export function getTotalUnits(product) {
  return ((product.stockBoxes || 0) * (product.boxSize || 1)) + (product.stockUnits || 0)
}

/**
 * Auto-convert loose units → boxes when units >= boxSize.
 * Returns { stockBoxes, stockUnits } after conversion.
 */
export function autoConvert(stockBoxes, stockUnits, boxSize, autoConvertEnabled = true) {
  if (!autoConvertEnabled || !boxSize || boxSize <= 1) {
    return { stockBoxes, stockUnits }
  }
  const extraBoxes = Math.floor(stockUnits / boxSize)
  return {
    stockBoxes: stockBoxes + extraBoxes,
    stockUnits: stockUnits % boxSize,
  }
}

/**
 * Deduct stock when a sale is made.
 * mode: 'box' | 'wholesale' | 'retail' (wholesale/retail = unit sale)
 * qty: number of boxes or units being purchased
 * Returns { stockBoxes, stockUnits, ok, shortage }
 */
export function deductStock(product, mode, qty) {
  let { stockBoxes = 0, stockUnits = 0, boxSize = 1 } = product
  const totalUnits = stockBoxes * boxSize + stockUnits

  if (mode === 'box') {
    const unitsNeeded = qty * boxSize
    if (unitsNeeded > totalUnits) return { stockBoxes, stockUnits, ok: false, shortage: unitsNeeded - totalUnits }

    let boxesNeeded = qty
    if (stockBoxes >= boxesNeeded) {
      stockBoxes -= boxesNeeded
    } else {
      // Borrow from units
      const boxesFromUnits = boxesNeeded - stockBoxes
      stockBoxes = 0
      stockUnits -= boxesFromUnits * boxSize
      if (stockUnits < 0) return { stockBoxes: 0, stockUnits: 0, ok: false, shortage: Math.abs(stockUnits) }
    }
  } else {
    // Unit sale
    if (qty > totalUnits) return { stockBoxes, stockUnits, ok: false, shortage: qty - totalUnits }

    if (stockUnits >= qty) {
      stockUnits -= qty
    } else {
      const remaining = qty - stockUnits
      stockUnits = 0
      const boxesToBreak = Math.ceil(remaining / boxSize)
      if (boxesToBreak > stockBoxes) return { stockBoxes: 0, stockUnits: 0, ok: false, shortage: qty - totalUnits }
      stockBoxes -= boxesToBreak
      stockUnits = boxesToBreak * boxSize - remaining
    }
  }

  // Auto-convert after deduction
  const converted = autoConvert(stockBoxes, stockUnits, boxSize, true)
  return { ...converted, ok: true, shortage: 0 }
}

export async function adjustStock(productId, delta, ref, userId) {
  const product = await db.products.get(productId)
  if (!product) throw new Error('Product not found')

  const newUnits = Math.max(0, (product.stockUnits || 0) + delta)
  const autoConvertEnabled = await getSetting('auto_convert_stock', true)
  const { stockBoxes, stockUnits } = autoConvert(
    product.stockBoxes || 0, newUnits, product.boxSize || 1, autoConvertEnabled
  )

  await db.products.update(productId, { stockBoxes, stockUnits })
  await db.stockMovements.add({
    productId,
    type: delta > 0 ? 'adjustment-in' : 'adjustment-out',
    qty: Math.abs(delta),
    balanceUnits: stockBoxes * (product.boxSize || 1) + stockUnits,
    ref: ref || '',
    userId: userId || null,
    timestamp: new Date().toISOString(),
  })
  return { stockBoxes, stockUnits }
}

// ── Sales ──────────────────────────────────────────────────────────────────
export async function saveSale(saleData) {
  const id = await db.sales.add({
    ...saleData,
    type:      'sale',
    status:    'completed',
    createdAt: new Date().toISOString(),
    syncedAt:  null,
  })
  return id
}

export async function saveQuote(quoteData) {
  const id = await db.sales.add({
    ...quoteData,
    type:      'quote',
    status:    'quote',
    createdAt: new Date().toISOString(),
    syncedAt:  null,
  })
  return id
}

export async function holdSale(holdData) {
  const id = await db.sales.add({
    ...holdData,
    type:      'sale',
    status:    'held',
    createdAt: new Date().toISOString(),
  })
  return id
}

export async function getHeldSales() {
  return db.sales.where('status').equals('held').toArray()
}

export async function removeHeldSale(id) {
  await db.sales.delete(id)
}

// ── Credit / Change transactions ───────────────────────────────────────────
export async function saveCreditTransaction(txData) {
  const localId = genRef('CTX')
  const id = await db.creditTransactions.add({
    ...txData,
    localId,
    settled:   txData.settled || false,
    createdAt: new Date().toISOString(),
    syncedAt:  null,
  })
  return { id, localId }
}

export async function getCreditTransactions(filters = {}) {
  let q = db.creditTransactions.toCollection()
  const all = await q.toArray()
  return all.filter(tx => {
    if (filters.customerId && tx.customerId !== filters.customerId) return false
    if (filters.settled !== undefined && tx.settled !== filters.settled) return false
    if (filters.type && tx.type !== filters.type) return false
    return true
  })
}

export async function settleCreditTransaction(id, amountPaid, cashier) {
  const tx = await db.creditTransactions.get(id)
  if (!tx) return
  await db.creditTransactions.update(id, {
    settled: true,
    settledAt: new Date().toISOString(),
    amountPaid: (tx.amountPaid || 0) + amountPaid,
    settledBy: cashier,
    syncedAt: null,
  })
}

// ── Users ──────────────────────────────────────────────────────────────────
export async function getAllUsers() {
  return db.users.where('active').notEqual(0).toArray()
}

// ── Customers ──────────────────────────────────────────────────────────────
export async function getAllCustomers() {
  return db.customers.toArray()
}

export async function getCustomerSales(customerId) {
  return db.sales
    .where('customerId').equals(String(customerId))
    .filter(s => s.status === 'completed')
    .toArray()
}

// ── Seed ───────────────────────────────────────────────────────────────────
export async function seedIfEmpty(initialInventory = [], initialUsers = [], defaultSettings = {}) {
  const count = await db.users.count()
  if (count > 0) return

  if (initialUsers.length > 0) {
    await db.users.bulkAdd(initialUsers.map(u => ({ ...u, username: u.id, active: 1 })))
  } else {
    await db.users.add({ username: 'admin', name: 'Admin', role: 'admin', pin: '1234', active: 1 })
  }

  if (initialInventory.length > 0) {
    await db.products.bulkAdd(
      initialInventory.map(p => ({
        ...p,
        stockBoxes: 0,
        stockUnits: p.stock || 0,
        active: 1,
      }))
    )
  }

  const settingEntries = Object.entries(defaultSettings).map(([key, value]) => ({ key, value }))
  if (settingEntries.length > 0) await db.settings.bulkPut(settingEntries)

  await db.settings.bulkPut([
    { key: 'shopName',  value: 'PortionSpot Motors' },
    { key: 'currency',  value: 'USD' },
    { key: 'auto_convert_stock', value: true },
    { key: 'margin_formula', value: 'gross' }, // 'gross' | 'markup'
    { key: 'float_cart_pages', value: ['pos','dashboard','inventory','sales','customers','settings','sync','changeCredit'] },
    { key: 'float_cart_action', value: 'navigate' }, // 'navigate' | 'peek'
    { key: 'receipt_same_template', value: true },
    { key: 'supabase_url', value: '' },
    { key: 'supabase_key', value: '' },
  ])
}
