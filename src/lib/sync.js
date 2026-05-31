import { createClient } from '@supabase/supabase-js'
import { db, getSetting, setSetting, genRef } from './db'

// Default shared database
export const DEFAULT_SUPABASE_URL = 'https://ucgvvxlhdooevngtraje.supabase.co'
export const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjZ3Z2eGxoZG9vZXZuZ3RyYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDc3NDAsImV4cCI6MjA5NDUyMzc0MH0.7SW2dSXqyRN8jfK6Dho0XlOfvSkXblJ4pdJ3FEXv96U'

let _client = null
let _autoSyncInterval = null

export async function getSupabaseClient() {
  if (_client) return _client
  const url = await getSetting('supabase_url', '')
  const key = await getSetting('supabase_key', '')
  if (!url || !key) return null
  try {
    _client = createClient(url, key)
    return _client
  } catch { return null }
}

export function resetClient() { _client = null }

export async function testConnection(url, key) {
  try {
    const client = createClient(url, key)
    const { error } = await client.from('settings').select('key').limit(1)
    return { ok: !error, error: error?.message }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── Auto-sync (Option B: every 2 min) ─────────────────────────────────────
export function startAutoSync(onTick) {
  stopAutoSync()
  _autoSyncInterval = setInterval(async () => {
    const url = await getSetting('supabase_url', '')
    const key = await getSetting('supabase_key', '')
    if (!url || !key || !navigator.onLine) return
    try {
      await runSync(onTick)
    } catch {}
  }, 2 * 60 * 1000) // 2 minutes
}

export function stopAutoSync() {
  if (_autoSyncInterval) { clearInterval(_autoSyncInterval); _autoSyncInterval = null }
}

// ── Push helpers ───────────────────────────────────────────────────────────
async function pushProducts(sb, log) {
  const products = await db.products.filter(p => !p.syncedAt || (p.updatedAt && p.updatedAt > p.syncedAt)).toArray()
  if (!products.length) return { pushed: 0 }
  const rows = products.map(p => ({
    sku: p.sku, name: p.name, category: p.category,
    product_type: p.productType || 'box',
    box_price: p.boxPrice || 0, box_size: p.boxSize || 1,
    wholesale_price: p.wholesalePrice || 0, retail_price: p.retailPrice || 0,
    cost_price: p.costPrice || 0, stock_boxes: p.stockBoxes || 0,
    stock_units: p.stockUnits || 0, low_stock_threshold: p.lowStockThreshold || 5,
    active: !!p.active, updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('products').upsert(rows, { onConflict: 'sku' })
  if (error) throw new Error('products: ' + error.message)
  const now = new Date().toISOString()
  for (const p of products) await db.products.update(p.id, { syncedAt: now, updatedAt: now })
  log && log(`✓ Pushed ${products.length} product(s)`)
  return { pushed: products.length }
}

async function pushSales(sb, log) {
  const sales = await db.sales.filter(s => s.status !== 'held' && !s.syncedAt).toArray()
  if (!sales.length) return { pushed: 0 }
  const rows = sales.map(s => ({
    id: s.ref || String(s.id), ref: s.ref, type: s.type, status: s.status,
    customer_id: String(s.customerId || ''), customer_name: s.customer || '',
    items: s.items || [], subtotal: s.subtotal || 0,
    line_discount_total: s.lineDiscountTotal || 0, sale_discount: s.saleDiscount || 0,
    total_discount: s.totalDiscount || 0, vat_enabled: !!s.vatEnabled,
    vat_amount: s.vatAmount || 0, grand_total: s.grandTotal || 0,
    payments: s.payments || [], amount_paid: s.amountPaid || 0,
    change_owed: s.changeOwed || 0, change_given: s.changeGiven || 0,
    amount_owing: s.amountOwing || 0, pay_method: s.payMethod || 'cash',
    cashier: s.cashier || '', cashier_id: String(s.cashierId || ''),
    notes: s.notes || '', created_at: s.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('sales').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error('sales: ' + error.message)
  const now = new Date().toISOString()
  for (const s of sales) await db.sales.update(s.id, { syncedAt: now })
  log && log(`✓ Pushed ${sales.length} sale(s)`)
  return { pushed: sales.length }
}

async function pushCustomers(sb, log) {
  const customers = await db.customers.filter(c => !c.syncedAt).toArray()
  if (!customers.length) return { pushed: 0 }
  const rows = customers.map(c => ({
    local_id: c.localId || genRef('CUST'), name: c.name, phone: c.phone || '',
    email: c.email || '', address: c.address || '', credit_limit: c.creditLimit || 0,
    balance: c.balance || 0, is_trade_account: !!c.isTradeAccount, notes: c.notes || '',
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('customers').upsert(rows, { onConflict: 'local_id' })
  if (error) throw new Error('customers: ' + error.message)
  const now = new Date().toISOString()
  for (const c of customers) await db.customers.update(c.id, { syncedAt: now })
  log && log(`✓ Pushed ${customers.length} customer(s)`)
  return { pushed: customers.length }
}

async function pushCreditTransactions(sb, log) {
  const txs = await db.creditTransactions.filter(t => !t.syncedAt).toArray()
  if (!txs.length) return { pushed: 0 }
  const rows = txs.map(t => ({
    local_id: t.localId, customer_id: String(t.customerId || ''),
    customer_name: t.customerName || '', type: t.type, amount: t.amount || 0,
    note: t.note || '', cashier: t.cashier || '', settled: !!t.settled,
    settled_at: t.settledAt || null, created_at: t.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('credit_transactions').upsert(rows, { onConflict: 'local_id' })
  if (error) throw new Error('credit: ' + error.message)
  const now = new Date().toISOString()
  for (const t of txs) await db.creditTransactions.update(t.id, { syncedAt: now })
  log && log(`✓ Pushed ${txs.length} credit transaction(s)`)
  return { pushed: txs.length }
}

// ── Pull helpers ───────────────────────────────────────────────────────────
async function pullProducts(sb, log) {
  const lastSync = await getSetting('last_pull_products', '2000-01-01T00:00:00Z')
  const { data, error } = await sb.from('products').select('*').gt('updated_at', lastSync)
  if (error) throw new Error('pull products: ' + error.message)
  if (!data?.length) return { pulled: 0 }

  for (const row of data) {
    const existing = await db.products.where('sku').equals(row.sku).first()
    const mapped = {
      sku: row.sku, name: row.name, category: row.category,
      productType: row.product_type || 'box',
      boxPrice: row.box_price, boxSize: row.box_size,
      wholesalePrice: row.wholesale_price, retailPrice: row.retail_price,
      costPrice: row.cost_price, stockBoxes: row.stock_boxes,
      stockUnits: row.stock_units, lowStockThreshold: row.low_stock_threshold,
      active: row.active ? 1 : 0, syncedAt: new Date().toISOString(),
      updatedAt: row.updated_at,
    }
    if (existing) {
      // Conflict resolution: only pull if remote is newer than local edits.
      // If localUpdatedAt > remote updated_at, our local change wins — skip.
      const localUpdatedAt = existing.updatedAt || existing.syncedAt || '2000-01-01T00:00:00Z'
      if (row.updated_at <= localUpdatedAt) continue
      await db.products.update(existing.id, mapped)
    } else {
      await db.products.add(mapped)
    }
  }
  await setSetting('last_pull_products', new Date().toISOString())
  log && log(`↓ Pulled ${data.length} product(s)`)
  return { pulled: data.length }
}

async function pullSales(sb, log) {
  const lastSync = await getSetting('last_pull_sales', '2000-01-01T00:00:00Z')
  const { data, error } = await sb.from('sales').select('*').gt('created_at', lastSync).order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error('pull sales: ' + error.message)
  if (!data?.length) return { pulled: 0 }

  for (const row of data) {
    const existing = await db.sales.where('ref').equals(row.ref || '').first()
    if (!existing) {
      await db.sales.add({
        ref: row.ref, type: row.type, status: row.status,
        customer: row.customer_name, customerId: row.customer_id,
        items: row.items || [], subtotal: row.subtotal,
        lineDiscountTotal: row.line_discount_total, saleDiscount: row.sale_discount,
        totalDiscount: row.total_discount, vatEnabled: row.vat_enabled,
        vatAmount: row.vat_amount, grandTotal: row.grand_total,
        payments: row.payments || [], amountPaid: row.amount_paid,
        changeOwed: row.change_owed, changeGiven: row.change_given,
        amountOwing: row.amount_owing, payMethod: row.pay_method,
        cashier: row.cashier, cashierId: row.cashier_id,
        createdAt: row.created_at, syncedAt: new Date().toISOString(),
      })
    }
  }
  await setSetting('last_pull_sales', new Date().toISOString())
  log && log(`↓ Pulled ${data.length} sale(s)`)
  return { pulled: data.length }
}

async function pullCustomers(sb, log) {
  const lastSync = await getSetting('last_pull_customers', '2000-01-01T00:00:00Z')
  const { data, error } = await sb.from('customers').select('*').gt('updated_at', lastSync)
  if (error) throw new Error('pull customers: ' + error.message)
  if (!data?.length) return { pulled: 0 }

  for (const row of data) {
    const existing = row.local_id ? await db.customers.where('localId').equals(row.local_id).first() : null
    const mapped = {
      localId: row.local_id, name: row.name, phone: row.phone || '',
      email: row.email || '', address: row.address || '',
      creditLimit: row.credit_limit, balance: row.balance,
      isTradeAccount: row.is_trade_account, notes: row.notes || '',
      syncedAt: new Date().toISOString(),
    }
    if (existing) {
      // Conflict resolution: local edit (syncedAt=null) beats a remote pull.
      // If we have an unsynced local change, skip overwriting with remote data.
      if (!existing.syncedAt) continue
      // If remote record was updated before our last sync, skip (we already have newer).
      const lastKnownSync = existing.syncedAt || '2000-01-01T00:00:00Z'
      if (row.updated_at <= lastKnownSync) continue
      await db.customers.update(existing.id, mapped)
    } else {
      await db.customers.add(mapped)
    }
  }
  await setSetting('last_pull_customers', new Date().toISOString())
  log && log(`↓ Pulled ${data.length} customer(s)`)
  return { pulled: data.length }
}

// ── Stock reconciliation check ─────────────────────────────────────────────
export async function checkStockReconciliation(sb) {
  try {
    const { data } = await sb.from('products').select('sku, stock_boxes, stock_units')
    if (!data) return []
    const alerts = []
    for (const remote of data) {
      const local = await db.products.where('sku').equals(remote.sku).first()
      if (!local) continue
      const localTotal = (local.stockBoxes || 0) * (local.boxSize || 1) + (local.stockUnits || 0)
      const remoteTotal = (remote.stock_boxes || 0) * (local.boxSize || 1) + (remote.stock_units || 0)
      if (Math.abs(localTotal - remoteTotal) > 0) {
        alerts.push({ sku: remote.sku, name: local.name, local: localTotal, remote: remoteTotal })
      }
    }
    return alerts
  } catch { return [] }
}

// ── Force-pull: pull ALL records regardless of last-sync timestamp ────────
// Use this when you've edited data directly in Supabase dashboard and want
// those changes pulled down immediately without waiting for timestamps.
export async function forcePullAll(log) {
  const sb = await getSupabaseClient()
  if (!sb) return { ok: false, errors: ['No Supabase connection configured'] }

  const errors = []
  let pulled = 0

  // Products — full overwrite of every row
  try {
    log && log('Force-pulling products…')
    const { data, error } = await sb.from('products').select('*')
    if (error) throw new Error(error.message)
    for (const row of (data || [])) {
      const existing = await db.products.where('sku').equals(row.sku).first()
      const mapped = {
        sku: row.sku, name: row.name, category: row.category,
        productType: row.product_type || 'box',
        boxPrice: row.box_price, boxSize: row.box_size,
        wholesalePrice: row.wholesale_price, retailPrice: row.retail_price,
        costPrice: row.cost_price, stockBoxes: row.stock_boxes,
        stockUnits: row.stock_units, lowStockThreshold: row.low_stock_threshold,
        active: row.active ? 1 : 0,
        syncedAt: new Date().toISOString(), updatedAt: row.updated_at,
      }
      if (existing) await db.products.update(existing.id, mapped)
      else          await db.products.add(mapped)
    }
    await setSetting('last_pull_products', new Date().toISOString())
    pulled += data?.length || 0
    log && log(`↓ Force-pulled ${data?.length || 0} product(s)`)
  } catch (e) { errors.push('products: ' + e.message); log && log('⚠ ' + e.message) }

  // Customers — full overwrite
  try {
    log && log('Force-pulling customers…')
    const { data, error } = await sb.from('customers').select('*')
    if (error) throw new Error(error.message)
    for (const row of (data || [])) {
      const existing = row.local_id ? await db.customers.where('localId').equals(row.local_id).first() : null
      const mapped = {
        localId: row.local_id, name: row.name, phone: row.phone || '',
        email: row.email || '', address: row.address || '',
        creditLimit: row.credit_limit, balance: row.balance,
        isTradeAccount: row.is_trade_account, notes: row.notes || '',
        syncedAt: new Date().toISOString(),
      }
      if (existing) await db.customers.update(existing.id, mapped)
      else          await db.customers.add(mapped)
    }
    await setSetting('last_pull_customers', new Date().toISOString())
    pulled += data?.length || 0
    log && log(`↓ Force-pulled ${data?.length || 0} customer(s)`)
  } catch (e) { errors.push('customers: ' + e.message); log && log('⚠ ' + e.message) }

  const now = new Date().toISOString()
  await setSetting('last_sync', now)
  log && log(`✓ Force pull complete — ${pulled} records updated`)
  return { ok: errors.length === 0, errors, pulled }
}

// ── Main sync runner ───────────────────────────────────────────────────────
export async function runSync(log) {
  const sb = await getSupabaseClient()
  if (!sb) return { ok: false, errors: ['No Supabase connection configured'] }

  const errors = []
  const results = { pushed: 0, pulled: 0 }

  const steps = [
    () => pushProducts(sb, log),
    () => pushSales(sb, log),
    () => pushCustomers(sb, log),
    () => pushCreditTransactions(sb, log),
    () => pullProducts(sb, log),
    () => pullSales(sb, log),
    () => pullCustomers(sb, log),
  ]

  for (const step of steps) {
    try {
      const r = await step()
      if (r?.pushed) results.pushed += r.pushed
      if (r?.pulled) results.pulled += r.pulled
    } catch (e) {
      errors.push(e.message)
      log && log(`⚠ ${e.message}`)
    }
  }

  const now = new Date().toISOString()
  await setSetting('last_sync', now)
  log && log(`✓ Sync complete — ${results.pushed} pushed, ${results.pulled} pulled`)
  return { ok: errors.length === 0, errors, lastSync: now, ...results }
}

// ── First-time setup: pull everything from Supabase ────────────────────────
export async function initialPull(url, key, log) {
  const sb = createClient(url, key)

  log('Connecting to database…')

  // Products
  log('Pulling products…')
  const { data: products, error: pe } = await sb.from('products').select('*')
  if (pe) throw new Error('Cannot read products: ' + pe.message)

  if (products?.length) {
    await db.products.clear()
    for (const row of products) {
      await db.products.add({
        sku: row.sku, name: row.name, category: row.category,
        productType: row.product_type || 'box',
        boxPrice: row.box_price, boxSize: row.box_size,
        wholesalePrice: row.wholesale_price, retailPrice: row.retail_price,
        costPrice: row.cost_price, stockBoxes: row.stock_boxes,
        stockUnits: row.stock_units, lowStockThreshold: row.low_stock_threshold,
        active: row.active ? 1 : 0, syncedAt: new Date().toISOString(),
      })
    }
    log(`✓ ${products.length} products loaded`)
  }

  // Sales (last 90 days)
  log('Pulling recent sales…')
  const since = new Date(Date.now() - 90 * 86400000).toISOString()
  const { data: sales } = await sb.from('sales').select('*').gt('created_at', since).order('created_at', { ascending: false })
  if (sales?.length) {
    for (const row of sales) {
      const exists = row.ref ? await db.sales.where('ref').equals(row.ref).first() : null
      if (!exists) {
        await db.sales.add({
          ref: row.ref, type: row.type, status: row.status,
          customer: row.customer_name, customerId: row.customer_id,
          items: row.items || [], subtotal: row.subtotal,
          lineDiscountTotal: row.line_discount_total, saleDiscount: row.sale_discount,
          totalDiscount: row.total_discount, vatEnabled: row.vat_enabled,
          vatAmount: row.vat_amount, grandTotal: row.grand_total,
          payments: row.payments || [], amountPaid: row.amount_paid,
          changeOwed: row.change_owed, changeGiven: row.change_given,
          amountOwing: row.amount_owing, payMethod: row.pay_method,
          cashier: row.cashier, cashierId: row.cashier_id,
          createdAt: row.created_at, syncedAt: new Date().toISOString(),
        })
      }
    }
    log(`✓ ${sales.length} recent sales loaded`)
  }

  // Customers
  log('Pulling customers…')
  const { data: customers } = await sb.from('customers').select('*')
  if (customers?.length) {
    for (const row of customers) {
      const exists = row.local_id ? await db.customers.where('localId').equals(row.local_id).first() : null
      if (!exists) {
        await db.customers.add({
          localId: row.local_id, name: row.name, phone: row.phone || '',
          email: row.email || '', address: row.address || '',
          creditLimit: row.credit_limit, balance: row.balance,
          isTradeAccount: row.is_trade_account, notes: row.notes || '',
          syncedAt: new Date().toISOString(),
        })
      }
    }
    log(`✓ ${customers.length} customers loaded`)
  }

  // Settings from cloud
  log('Loading settings…')
  const { data: settings } = await sb.from('settings').select('*')
  if (settings?.length) {
    for (const row of settings) {
      // Don't overwrite connection settings
      if (row.key === 'supabase_url' || row.key === 'supabase_key') continue
      await setSetting(row.key, row.value)
    }
    log(`✓ ${settings.length} setting(s) applied`)
  }

  // Save timestamps
  const now = new Date().toISOString()
  await setSetting('last_sync', now)
  await setSetting('last_pull_products', now)
  await setSetting('last_pull_sales', now)
  await setSetting('last_pull_customers', now)
  await setSetting('setup_complete', true)

  log('✓ Setup complete! Reloading…')
}
