import React, { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Wifi, WifiOff, Download,
  Database, Copy, Check, ChevronDown, ChevronUp, AlertTriangle, Zap,
  Activity, Users, Package, ReceiptText, Shield
} from 'lucide-react'
import { db, getSetting, setSetting } from '../lib/db'
import { runSync, forcePullAll, testConnection, resetClient, checkStockReconciliation } from '../lib/sync'
import { fmt } from '../lib/utils'

const SQL_SCHEMA = `-- PortionSpot Motors POS — Supabase Schema
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  category TEXT, box_price NUMERIC DEFAULT 0, box_size INTEGER DEFAULT 1,
  wholesale_price NUMERIC DEFAULT 0, retail_price NUMERIC DEFAULT 0,
  cost_price NUMERIC DEFAULT 0, stock_boxes INTEGER DEFAULT 0,
  stock_units INTEGER DEFAULT 0, low_stock_threshold INTEGER DEFAULT 5,
  active BOOLEAN DEFAULT true, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, ref TEXT, type TEXT DEFAULT 'sale',
  status TEXT DEFAULT 'completed', customer_id TEXT, customer_name TEXT,
  items JSONB NOT NULL DEFAULT '[]', subtotal NUMERIC DEFAULT 0,
  line_discount_total NUMERIC DEFAULT 0, sale_discount NUMERIC DEFAULT 0,
  total_discount NUMERIC DEFAULT 0, vat_enabled BOOLEAN DEFAULT false,
  vat_amount NUMERIC DEFAULT 0, grand_total NUMERIC DEFAULT 0,
  payments JSONB DEFAULT '[]', amount_paid NUMERIC DEFAULT 0,
  change_owed NUMERIC DEFAULT 0, change_given NUMERIC DEFAULT 0,
  amount_owing NUMERIC DEFAULT 0, pay_method TEXT, cashier TEXT,
  cashier_id TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY, local_id TEXT UNIQUE, name TEXT NOT NULL,
  phone TEXT, email TEXT, address TEXT, credit_limit NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0, is_trade_account BOOLEAN DEFAULT false,
  notes TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_transactions (
  id BIGSERIAL PRIMARY KEY, local_id TEXT UNIQUE, customer_id TEXT,
  customer_name TEXT, type TEXT NOT NULL, amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT, cashier TEXT, settled BOOLEAN DEFAULT false,
  settled_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_products" ON products FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sales" ON sales FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_customers" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_credit" ON credit_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_settings" ON settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);`

function StatTile({ label, count, Icon, color, bg, pending }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: pending > 0 ? '1px solid rgba(245,158,11,0.25)' : '1px solid var(--surface-border)',
      borderRadius: 16,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{count ?? '—'}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', fontWeight: 500 }}>{label}</div>
        {pending > 0 && (
          <div style={{ fontSize: 9, color: '#d97706', fontWeight: 700, marginTop: 2 }}>{pending} unsynced</div>
        )}
      </div>
    </div>
  )
}

function SCard({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--surface-border)',
      borderRadius: 18,
      padding: '16px 18px',
      boxShadow: 'var(--shadow-sm)',
      ...style
    }}>
      {children}
    </div>
  )
}

function SCardTitle({ title, Icon, color = 'var(--brand-600)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      {Icon && <Icon size={14} style={{ color }} />}
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.01em' }}>{title}</span>
    </div>
  )
}

export default function Sync({ user, online }) {
  const [sbUrl, setSbUrl]       = useState('')
  const [sbKey, setSbKey]       = useState('')
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncLog, setSyncLog]   = useState([])
  const [lastSync, setLastSync] = useState(null)
  const [tableStats, setTableStats] = useState({})
  const [schemaCopied, setSchemaCopied] = useState(false)
  const [showSchema, setShowSchema] = useState(false)
  const [autoSyncStatus, setAutoSyncStatus] = useState('idle')

  useEffect(() => {
    getSetting('supabase_url', '').then(v => setSbUrl(v || ''))
    getSetting('supabase_key', '').then(v => setSbKey(v || ''))
    getSetting('last_sync', null).then(setLastSync)
    loadStats()
  }, [])

  const loadStats = async () => {
    const products      = await db.products.count()
    const sales         = await db.sales.filter(s => s.status !== 'held').count()
    const customers     = await db.customers.count()
    const credit        = await db.creditTransactions.count()
    const unsynced      = await db.products.filter(p => !p.syncedAt).count()
    const unsyncedSales = await db.sales.filter(s => s.status !== 'held' && !s.syncedAt).count()
    setTableStats({ products, sales, customers, credit, unsynced, unsyncedSales })
  }

  const saveConfig = async () => {
    await setSetting('supabase_url', sbUrl.trim())
    await setSetting('supabase_key', sbKey.trim())
    resetClient()
    setTestResult(null)
  }

  const handleTest = async () => {
    await saveConfig()
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(sbUrl.trim(), sbKey.trim())
    setTestResult(result)
    setTesting(false)
  }

  const handleSync = async () => {
    await saveConfig()
    setSyncing(true)
    setSyncLog([])
    setAutoSyncStatus('syncing')
    const result = await runSync((msg) => setSyncLog(prev => [...prev, msg]))
    const now = result.lastSync || new Date().toISOString()
    setLastSync(now)
    if (result.errors?.length) {
      setSyncLog(prev => [...prev, ...result.errors.map(e => `! ${e}`)])
    }
    setSyncing(false)
    setAutoSyncStatus(result.ok ? 'ok' : 'error')
    await loadStats()
  }

  const [forcePulling, setForcePulling] = useState(false)
  const handleForcePull = async () => {
    if (!online || !sbUrl) return
    setForcePulling(true)
    setSyncLog([])
    const result = await forcePullAll((msg) => setSyncLog(prev => [...prev, msg]))
    if (result.errors?.length) {
      setSyncLog(prev => [...prev, ...result.errors.map(e => `! ${e}`)])
    }
    setLastSync(new Date().toISOString())
    setForcePulling(false)
    setAutoSyncStatus(result.ok ? 'ok' : 'error')
    await loadStats()
  }

  const copySchema = () => {
    navigator.clipboard.writeText(SQL_SCHEMA).then(() => {
      setSchemaCopied(true)
      setTimeout(() => setSchemaCopied(false), 2500)
    })
  }

  const pendingTotal = (tableStats.unsynced || 0) + (tableStats.unsyncedSales || 0)

  const statusColor = autoSyncStatus === 'syncing' ? { bg: 'rgba(59,130,246,0.1)', color: '#2563eb' }
    : autoSyncStatus === 'ok' ? { bg: 'rgba(16,185,129,0.1)', color: '#059669' }
    : autoSyncStatus === 'error' ? { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' }
    : online ? { bg: 'rgba(16,185,129,0.1)', color: '#059669' }
    : { bg: 'rgba(245,158,11,0.1)', color: '#d97706' }

  return (
    <div className="page-wrap">
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', background: 'var(--surface-1)', borderBottom: '1px solid var(--surface-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink-primary)', letterSpacing: '-0.02em', margin: 0 }}>Sync</h1>
            <p style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginTop: 2 }}>Cloud sync via Supabase · auto every 2 min</p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: statusColor.bg, color: statusColor.color,
          }}>
            {autoSyncStatus === 'syncing'
              ? <RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
              : online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {autoSyncStatus === 'syncing' ? 'Syncing…' : autoSyncStatus === 'ok' ? 'Synced' : autoSyncStatus === 'error' ? 'Error' : online ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, paddingBottom: 80, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Sync Now — hero action */}
        <div style={{
          background: 'rgba(0,0,0,0.03)',
          border: '1px solid rgba(0,0,0,0.05)',
          padding: 5,
          borderRadius: 22,
        }}>
          <div style={{
            background: 'var(--surface-1)',
            borderRadius: 18,
            padding: '18px 20px',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.8)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <Zap size={14} style={{ color: 'var(--brand-600)' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-primary)' }}>Manual Sync</span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--ink-tertiary)', margin: 0 }}>Push local changes &amp; pull from cloud instantly</p>
              </div>
              {pendingTotal > 0 && (
                <span style={{ padding: '3px 9px', borderRadius: 9999, fontSize: 10, fontWeight: 800, background: 'rgba(245,158,11,0.12)', color: '#d97706', flexShrink: 0 }}>
                  {pendingTotal} pending
                </span>
              )}
            </div>

            <button
              onClick={handleSync}
              disabled={syncing || forcePulling || !online || !sbUrl}
              className="btn-primary"
              style={{ width: '100%', padding: '11px', fontSize: 13, justifyContent: 'center', opacity: (syncing || forcePulling || !online || !sbUrl) ? 0.45 : 1 }}
            >
              {syncing
                ? <><RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />Syncing…</>
                : <><Zap size={14} />Sync Now</>}
            </button>

            {/* Force Pull — pulls all cloud records regardless of timestamps */}
            <button
              onClick={handleForcePull}
              disabled={syncing || forcePulling || !online || !sbUrl}
              style={{
                width: '100%', marginTop: 8, padding: '10px', fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 12, border: '1.5px solid rgba(59,130,246,0.3)',
                background: 'rgba(59,130,246,0.06)', color: '#2563eb',
                fontWeight: 700, cursor: (syncing || forcePulling || !online || !sbUrl) ? 'not-allowed' : 'pointer',
                opacity: (syncing || forcePulling || !online || !sbUrl) ? 0.45 : 1,
              }}
            >
              {forcePulling
                ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />Pulling from cloud…</>
                : <><Download size={13} />Pull All from Cloud</>}
            </button>
            <p style={{ fontSize: 9, color: 'var(--ink-tertiary)', textAlign: 'center', marginTop: 5 }}>
              Use this after editing products or stock directly in Supabase dashboard
            </p>

            {!online && (
              <p style={{ fontSize: 10, color: '#d97706', textAlign: 'center', marginTop: 8, fontWeight: 600 }}>Device is offline — connect to sync</p>
            )}
            {!sbUrl && (
              <p style={{ fontSize: 10, color: 'var(--ink-tertiary)', textAlign: 'center', marginTop: 8 }}>Configure Supabase connection below first</p>
            )}
          </div>
        </div>

        {/* Local database stats */}
        <SCard>
          <SCardTitle title="Local Database" Icon={Database} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatTile label="Products"      count={tableStats.products}  Icon={Package}    color="#3b82f6" bg="rgba(59,130,246,0.1)"  pending={tableStats.unsynced} />
            <StatTile label="Sales"         count={tableStats.sales}     Icon={ReceiptText} color="#10b981" bg="rgba(16,185,129,0.1)" pending={tableStats.unsyncedSales} />
            <StatTile label="Customers"     count={tableStats.customers} Icon={Users}      color="#8b5cf6" bg="rgba(139,92,246,0.1)" />
            <StatTile label="Credit & Change" count={tableStats.credit}  Icon={Database}   color="#f59e0b" bg="rgba(245,158,11,0.1)" />
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: lastSync ? 'var(--ink-tertiary)' : '#d97706', fontWeight: lastSync ? 400 : 600 }}>
            {lastSync ? <Clock size={10} /> : <AlertTriangle size={10} />}
            {lastSync
              ? `Last synced: ${new Date(lastSync).toLocaleString('en-GB')}`
              : 'Never synced — run Sync Now to get started'}
          </div>
        </SCard>

        {/* Supabase config */}
        <SCard>
          <SCardTitle title="Supabase Connection" Icon={Database} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Project API URL
              </label>
              <input
                value={sbUrl}
                onChange={e => { setSbUrl(e.target.value); setTestResult(null) }}
                className="input"
                style={{ fontSize: 12, fontFamily: 'monospace' }}
                placeholder="https://xxxx.supabase.co"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--ink-tertiary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Anon Public Key
              </label>
              <input
                value={sbKey}
                onChange={e => { setSbKey(e.target.value); setTestResult(null) }}
                className="input"
                style={{ fontSize: 10, fontFamily: 'monospace' }}
                placeholder="eyJhbGciOiJIUzI1NiIs…"
                type="password"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleTest} disabled={testing || !sbUrl || !sbKey}
                className="btn-secondary" style={{ flex: 1, opacity: testing || !sbUrl || !sbKey ? 0.5 : 1 }}>
                {testing ? <><RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} />Testing…</> : 'Test Connection'}
              </button>
              <button onClick={saveConfig} className="btn-secondary" style={{ padding: '0 16px' }}>Save</button>
            </div>
            {testResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
                background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: testResult.ok ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
                color: testResult.ok ? '#059669' : '#dc2626',
              }}>
                {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {testResult.ok ? 'Connection successful' : testResult.error}
              </div>
            )}
          </div>
        </SCard>

        {/* Sync log */}
        {syncLog.length > 0 && (
          <SCard>
            <SCardTitle title="Sync Log" Icon={Activity} />
            <div style={{ background: '#111827', borderRadius: 12, padding: '12px 14px', maxHeight: 160, overflowY: 'auto' }}>
              {syncLog.map((entry, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.7, color: entry.startsWith('!') ? '#fbbf24' : '#34d399' }}>
                  {entry}
                </div>
              ))}
              {syncing && <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b7280', animation: 'pulse 2s ease-in-out infinite' }}>…</div>}
            </div>
          </SCard>
        )}

        {/* Sync protection */}
        <SCard>
          <SCardTitle title="Sync Protection" Icon={Shield} color="#10b981" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              [CheckCircle2, '#10b981', 'rgba(16,185,129,0.1)', 'Sales are immutable — never deleted or overwritten during sync'],
              [RefreshCw,   '#3b82f6', 'rgba(59,130,246,0.1)', 'Offline changes queue locally and sync automatically on reconnect'],
              [Zap,         '#f59e0b', 'rgba(245,158,11,0.1)', 'Auto-sync runs every 2 minutes when online (no action needed)'],
              [Shield,      '#8b5cf6', 'rgba(139,92,246,0.1)', 'Duplicate records are detected and skipped, not duplicated'],
              [AlertTriangle,'#ef4444','rgba(239,68,68,0.1)',  'Stock discrepancies between devices show as alerts here'],
            ].map(([Icon, color, bg, text], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Icon size={11} style={{ color }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </SCard>

        {/* SQL Schema — collapsible */}
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--surface-border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <button
            onClick={() => setShowSchema(s => !s)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Database size={13} style={{ color: 'var(--ink-tertiary)' }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-primary)' }}>SQL Schema</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--ink-tertiary)' }}>
              Copy to set up Supabase tables
              {showSchema ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </div>
          </button>
          {showSchema && (
            <div style={{ borderTop: '1px solid var(--surface-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px', borderBottom: '1px solid var(--surface-border)' }}>
                <button onClick={copySchema} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 11, gap: 5 }}>
                  {schemaCopied ? <><Check size={11} />Copied</> : <><Copy size={11} />Copy SQL</>}
                </button>
              </div>
              <pre style={{ padding: '14px', fontSize: 9, fontFamily: 'monospace', color: 'var(--ink-secondary)', overflowX: 'auto', maxHeight: 240, background: 'var(--surface-3)', margin: 0, lineHeight: 1.6 }}>
                {SQL_SCHEMA}
              </pre>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
