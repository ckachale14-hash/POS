import React, { useState, useEffect, useRef } from 'react'
import {
  Store, User, Percent, Printer, AlertTriangle, Image, ReceiptText,
  ShoppingCart, TrendingUp, Plus, Edit2, Trash2, Save, X, Eye, EyeOff,
  Bluetooth, BluetoothSearching, CheckCircle2, Upload, Wifi, Lock, ScrollText, Shield,
  Palette, Check, RotateCcw
} from 'lucide-react'
import { db, getSetting, setSetting, saveSetting, getAllUsers, logAudit } from '../lib/db'
import { useSession } from '../context/SessionContext'
import { fmt } from '../lib/utils'
import {
  ACCENT_PRESETS, BACKGROUND_PRESETS, SIDEBAR_PRESETS, DEFAULT_THEME,
  buildRamp, rgbString, applyTheme, getTheme, saveTheme,
} from '../lib/theme'

const PAGES_OPTIONS = [
  { id: 'pos',          label: 'Point of Sale' },
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'inventory',    label: 'Inventory' },
  { id: 'sales',        label: 'Sales & Reports' },
  { id: 'customers',    label: 'Customers' },
  { id: 'changeCredit', label: 'Change & Credit' },
  { id: 'sync',         label: 'Sync' },
  { id: 'settings',     label: 'Settings' },
]

export default function Settings({ user }) {
  const [tab, setTab] = useState('shop')
  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }

  const tabs = [
    { id: 'shop',     label: 'Shop',     icon: Store },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'logo',     label: 'Logo',     icon: Image },
    { id: 'receipt',  label: 'Receipt',  icon: ReceiptText },
    { id: 'users',    label: 'Users',    icon: User },
    { id: 'tax',      label: 'Tax',      icon: Percent },
    { id: 'printer',  label: 'Printer',  icon: Printer },
    { id: 'cart',     label: 'Cart HUD', icon: ShoppingCart },
    { id: 'margins',  label: 'Margins',  icon: TrendingUp },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'audit',    label: 'Audit',    icon: ScrollText },
    { id: 'danger',   label: 'Reset',    icon: AlertTriangle },
  ]

  return (
    <div className="page-wrap">
      <div className="section-header">
        <h1 className="font-black text-gray-900">Settings</h1>
        <p className="text-xs text-gray-400">Admin only · Changes saved automatically</p>
      </div>

      {/* Tab bar */}
      <div className="tab-bar shrink-0">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`tab-item ${tab === t.id ? 'tab-item-active' : 'tab-item-inactive'} ${t.id === 'danger' ? 'text-red-500' : ''}`}
            >
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'shop'    && <ShopTab showToast={showToast} />}
        {tab === 'appearance' && <AppearanceTab showToast={showToast} />}
        {tab === 'logo'    && <LogoTab showToast={showToast} />}
        {tab === 'receipt' && <ReceiptTab showToast={showToast} />}
        {tab === 'users'   && <UsersTab showToast={showToast} currentUser={user} />}
        {tab === 'tax'     && <TaxTab showToast={showToast} />}
        {tab === 'printer' && <PrinterTab showToast={showToast} />}
        {tab === 'cart'    && <CartHUDTab showToast={showToast} />}
        {tab === 'margins'  && <MarginsTab showToast={showToast} />}
        {tab === 'security' && <SecurityTab showToast={showToast} />}
        {tab === 'audit'    && <AuditTab />}
        {tab === 'danger'   && <DangerTab showToast={showToast} />}
      </div>

      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : toast.type === 'error' ? 'toast-error' : 'toast-info'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Shared components ──────────────────────────────────────────────────────
function Section({ title, desc, children }) {
  return (
    <div className="card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
        {desc && <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ value, onChange, label, hint }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <button onClick={() => onChange(!value)} className={`toggle ${value ? 'toggle-on' : 'toggle-off'}`}>
        <span className={`toggle-thumb ${value ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
      </button>
      <span className="text-sm text-gray-700">
        {label}
        {hint && <span className="block text-[10px] text-gray-400">{hint}</span>}
      </span>
    </div>
  )
}

// ── Shop Info ──────────────────────────────────────────────────────────────
function ShopTab({ showToast }) {
  const [form, setForm] = useState({ shop_name: '', shop_tagline: '', shop_address: '', shop_phones: '', shop_email: '', shop_website: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    ;(async () => {
      const keys = Object.keys(form)
      const vals = {}
      for (const k of keys) vals[k] = (await getSetting(k)) || ''
      setForm(vals)
    })()
  }, [])

  const save = async () => {
    for (const [k, v] of Object.entries(form)) await setSetting(k, v)
    showToast('Shop info saved')
  }

  return (
    <Section title="Shop Information" desc="Appears on receipts and the POS header">
      <Field label="Shop Name"><input value={form.shop_name} onChange={e => set('shop_name', e.target.value)} className="input text-sm" /></Field>
      <Field label="Tagline"><input value={form.shop_tagline} onChange={e => set('shop_tagline', e.target.value)} className="input text-sm" /></Field>
      <Field label="Address"><input value={form.shop_address} onChange={e => set('shop_address', e.target.value)} className="input text-sm" /></Field>
      <Field label="Phone numbers" hint="Separate multiple numbers with commas">
        <input value={form.shop_phones} onChange={e => set('shop_phones', e.target.value)} className="input text-sm" placeholder="077... , 071..." />
      </Field>
      <Field label="Email address" hint="Optional — shown on receipt if enabled in Receipt settings">
        <input value={form.shop_email} onChange={e => set('shop_email', e.target.value)} className="input text-sm" placeholder="info@yourshop.com" type="email" />
      </Field>
      <Field label="Website" hint="Optional — shown on receipt if enabled in Receipt settings">
        <input value={form.shop_website} onChange={e => set('shop_website', e.target.value)} className="input text-sm" placeholder="www.yourshop.com" />
      </Field>
      <button onClick={save} className="btn-primary w-full mt-2"><Save size={14} />Save Changes</button>
    </Section>
  )
}

// ── Appearance ─────────────────────────────────────────────────────────────
// Colors + backgrounds are applied live as the admin picks, for instant
// feedback across the whole app. Choices are only persisted on Save; navigating
// away without saving reverts to the last saved theme.
function AppearanceTab({ showToast }) {
  const [draft, setDraft]         = useState(DEFAULT_THEME)
  const [customHex, setCustomHex] = useState(DEFAULT_THEME.accentHex)
  const [loaded, setLoaded]       = useState(false)
  const savedRef = useRef(DEFAULT_THEME)

  useEffect(() => {
    getTheme().then(t => {
      savedRef.current = t
      setDraft(t)
      if (t.accent === 'custom') setCustomHex(t.accentHex || DEFAULT_THEME.accentHex)
      setLoaded(true)
    })
    // Discard any unsaved live preview when leaving the tab/page.
    return () => applyTheme(savedRef.current)
  }, [])

  const apply = (next) => { setDraft(next); applyTheme({ ...next, accentHex: customHex }) }

  const pickAccent = (id)       => apply({ ...draft, accent: id })
  const pickCustom = (hex)      => { setCustomHex(hex); const next = { ...draft, accent: 'custom', accentHex: hex }; setDraft(next); applyTheme(next) }
  const pickBackground = (id)   => apply({ ...draft, background: id })
  const pickSidebar = (id)      => apply({ ...draft, sidebar: id })

  const effectiveHex = draft.accent === 'custom'
    ? customHex
    : (ACCENT_PRESETS.find(p => p.id === draft.accent)?.hex || DEFAULT_THEME.accentHex)
  const ramp = buildRamp(effectiveHex)

  const save = async () => {
    const t = { ...draft, accentHex: customHex }
    await saveTheme(t)
    savedRef.current = t
    showToast('Appearance saved')
  }

  const reset = () => {
    setCustomHex(DEFAULT_THEME.accentHex)
    apply(DEFAULT_THEME)
    showToast('Reset to default. Tap Save to keep.', 'info')
  }

  if (!loaded) return <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />

  return (
    <>
      {/* Live preview */}
      <Section title="Live Preview" desc="This updates instantly as you choose. Changes apply everywhere only after you Save.">
        <div
          className="rounded-2xl p-4 border"
          style={{ background: BACKGROUND_PRESETS.find(b => b.id === draft.background)?.canvas, borderColor: 'var(--surface-border)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-[10px] text-white shrink-0"
              style={{ background: ramp[600], boxShadow: `0 8px 20px rgba(${rgbString(ramp[600])}, 0.22)` }}>
              PSM
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-2.5 w-24 rounded-full" style={{ background: ramp[600] }} />
              <div className="h-2 w-16 rounded-full mt-1.5" style={{ background: 'var(--surface-4)' }} />
            </div>
          </div>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: ramp[600] }}>Oils</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: ramp[50], color: ramp[700] }}>Filters</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--ink-tertiary)' }}>Brakes</span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white" style={{ background: ramp[600] }}>Charge $42.00</button>
            <button className="px-4 py-2.5 rounded-xl font-semibold text-sm" style={{ background: ramp[50], color: ramp[700] }}>Hold</button>
          </div>
        </div>
      </Section>

      {/* Accent color */}
      <Section title="Accent Color" desc="Drives buttons, highlights, active tabs and the brand badge across the whole app.">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {ACCENT_PRESETS.map(p => {
            const active = draft.accent === p.id
            return (
              <button
                key={p.id}
                onClick={() => pickAccent(p.id)}
                aria-pressed={active}
                title={p.name}
                className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={active ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${p.hex}` } : undefined}
              >
                <span
                  className="w-full aspect-square rounded-xl flex items-center justify-center transition-transform group-active:scale-95"
                  style={{ background: p.hex }}
                >
                  {active && <Check size={18} className="text-white" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="text-[10px] font-semibold truncate w-full text-center" style={{ color: active ? 'var(--ink-primary)' : 'var(--ink-tertiary)' }}>
                  {p.name}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700">Custom color</p>
              <p className="text-[10px] text-gray-400">Pick any shade. The full tint range is generated for you.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                value={customHex.toUpperCase()}
                onChange={e => { const v = e.target.value; if (/^#?[0-9a-fA-F]{0,6}$/.test(v.replace('#',''))) pickCustom(v.startsWith('#') ? v : '#' + v) }}
                className="input text-sm font-mono w-24 text-center"
                placeholder="#FF3830"
                maxLength={7}
                inputMode="text"
                spellCheck={false}
                autoComplete="off"
                aria-label="Custom accent hex code"
              />
              <input
                type="color"
                value={customHex}
                onChange={e => pickCustom(e.target.value)}
                aria-label="Custom accent color picker"
                style={{ touchAction: 'manipulation' }}
                className={`w-11 h-11 rounded-xl border-2 cursor-pointer bg-transparent p-0 ${draft.accent === 'custom' ? 'border-gray-900' : 'border-gray-200'}`}
              />
            </div>
          </label>
        </div>
      </Section>

      {/* Background */}
      <Section title="Background" desc="The canvas behind your cards. Designed to stay easy on the eyes during long shifts.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {BACKGROUND_PRESETS.map(b => {
            const active = draft.background === b.id
            return (
              <button
                key={b.id}
                onClick={() => pickBackground(b.id)}
                aria-pressed={active}
                className="rounded-xl overflow-hidden border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                style={{ borderColor: active ? ramp[500] : 'var(--surface-border)' }}
              >
                <div className="h-14 relative" style={{ background: b.canvas }}>
                  {/* tiny card hint so the user sees real contrast */}
                  <div className="absolute inset-2 rounded-lg bg-white shadow-sm" style={{ opacity: 0.9 }} />
                  {active && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: ramp[600] }}>
                      <Check size={12} className="text-white" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="py-1.5 text-[10px] font-semibold text-center bg-white" style={{ color: active ? 'var(--ink-primary)' : 'var(--ink-tertiary)' }}>
                  {b.name}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      {/* Sidebar */}
      <Section title="Sidebar Theme" desc="The desktop navigation rail. On phones the bottom bar always stays light.">
        <div className="grid grid-cols-2 gap-2.5">
          {SIDEBAR_PRESETS.map(s => {
            const active = draft.sidebar === s.id
            const swatch = s.id === 'accent' ? ramp[800] : '#111827'
            return (
              <button
                key={s.id}
                onClick={() => pickSidebar(s.id)}
                aria-pressed={active}
                className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition focus:outline-none focus-visible:ring-2"
                style={{ borderColor: active ? ramp[500] : 'var(--surface-border)' }}
              >
                <span className="w-10 h-10 rounded-lg shrink-0 flex flex-col justify-center gap-1 px-1.5" style={{ background: swatch }}>
                  <span className="h-1 rounded-full" style={{ background: ramp[500], width: '70%' }} />
                  <span className="h-1 rounded-full bg-white/30" style={{ width: '90%' }} />
                  <span className="h-1 rounded-full bg-white/30" style={{ width: '55%' }} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                  <p className="text-[10px] text-gray-400">{s.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      <div className="flex gap-2">
        <button onClick={reset} className="btn-secondary shrink-0"><RotateCcw size={14} />Reset</button>
        <button onClick={save} className="btn-primary flex-1"><Save size={14} />Save Appearance</button>
      </div>
    </>
  )
}

// ── Logo ───────────────────────────────────────────────────────────────────
function LogoTab({ showToast }) {
  const [logo, setLogo] = useState(null)
  const fileRef = useRef()

  useEffect(() => { getSetting('shop_logo').then(l => l && setLogo(l)) }, [])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 500000) { showToast('Logo must be under 500KB', 'error'); return }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const b64 = ev.target.result
      await setSetting('shop_logo', b64)
      setLogo(b64)
      showToast('Logo saved — will appear in sidebar and receipts')
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = async () => {
    await setSetting('shop_logo', '')
    setLogo(null)
    showToast('Logo removed')
  }

  return (
    <Section title="Shop Logo" desc="Replaces the PSM badge in the sidebar and appears on receipts">
      {logo ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-2xl border-2 border-gray-200 overflow-hidden flex items-center justify-center bg-white">
            <img src={logo} alt="Shop logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => fileRef.current.click()} className="btn-secondary text-xs gap-1.5">
              <Upload size={13} />Replace
            </button>
            <button onClick={removeLogo} className="btn-danger text-xs gap-1.5">
              <Trash2 size={13} />Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileRef.current.click()}
          className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition"
        >
          <Upload size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-gray-500">Click to upload logo</p>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG · Max 500KB</p>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </Section>
  )
}

// ── Receipt Templates ──────────────────────────────────────────────────────
function ReceiptTab({ showToast }) {
  const [sameTemplate, setSameTemplate]   = useState(true)
  const [printSettings, setPrintSettings] = useState({})
  const [waSettings, setWaSettings]       = useState({})
  const [footerText, setFooterText]       = useState('Thank you for shopping with us!\nGoods sold are not returnable.')
  const [waFooterText, setWaFooterText]   = useState('')
  const [charW, setCharW]                 = useState(1)
  const [charH, setCharH]                 = useState(1)
  const [feedLines, setFeedLines]         = useState(1)
  const [showCustomSize, setShowCustomSize] = useState(false)
  const [boldHeaders, setBoldHeaders]     = useState(true)
  const [boldTotals, setBoldTotals]       = useState(true)

  const SECTIONS = [
    { key: 'show_logo',     label: 'Show Logo' },
    { key: 'show_cashier',  label: 'Show Cashier Name' },
    { key: 'show_vat',      label: 'Show VAT Line' },
    { key: 'show_payment',  label: 'Show Payment Method' },
    { key: 'show_change',   label: 'Show Change/Owing' },
    { key: 'show_email',    label: 'Show Email Address' },
    { key: 'show_website',  label: 'Show Website' },
    { key: 'show_footer',   label: 'Show Footer Message' },
  ]

  useEffect(() => {
    ;(async () => {
      setSameTemplate(await getSetting('receipt_same_template', true))
      const ps = {}; const ws = {}
      for (const s of SECTIONS) {
        ps[s.key] = await getSetting(`receipt_${s.key}`, true)
        ws[s.key] = await getSetting(`whatsapp_${s.key}`, s.key !== 'show_logo')
      }
      setPrintSettings(ps)
      setWaSettings(ws)
      setFooterText(await getSetting('receipt_footer_text', 'Thank you for shopping with us!\nGoods sold are not returnable.'))
      setWaFooterText(await getSetting('whatsapp_footer_text', ''))
      // Migrate from old 'receipt_font_size' string setting if new keys not yet saved
      const oldSize = await getSetting('receipt_font_size', 'small')
      const defaultW = oldSize === 'large' ? 2 : 1
      const defaultH = oldSize === 'large' ? 2 : oldSize === 'medium' ? 2 : 1
      setCharW(await getSetting('receipt_char_w', defaultW))
      setCharH(await getSetting('receipt_char_h', defaultH))
      setFeedLines(await getSetting('receipt_feed_lines', 1))
      setBoldHeaders(await getSetting('receipt_bold_headers', true))
      setBoldTotals(await getSetting('receipt_bold_totals', true))
    })()
  }, [])

  const save = async () => {
    await setSetting('receipt_same_template', sameTemplate)
    await setSetting('receipt_footer_text', footerText)
    await setSetting('receipt_char_w', charW)
    await setSetting('receipt_char_h', charH)
    await setSetting('receipt_feed_lines', feedLines)
    await setSetting('receipt_bold_headers', boldHeaders)
    await setSetting('receipt_bold_totals', boldTotals)
    for (const [k, v] of Object.entries(printSettings)) await setSetting(`receipt_${k}`, v)
    if (!sameTemplate) {
      for (const [k, v] of Object.entries(waSettings)) await setSetting(`whatsapp_${k}`, v)
      await setSetting('whatsapp_footer_text', waFooterText)
    }
    showToast('Receipt settings saved')
  }

  const activePreset = charW === 1 && charH === 1 ? 'small'
                     : charW === 1 && charH === 2 ? 'medium'
                     : charW === 2 && charH === 2 ? 'large' : 'custom'

  const PresetBtn = ({ id, label, desc, w, h }) => (
    <button
      onClick={() => { setCharW(w); setCharH(h); setShowCustomSize(false) }}
      className={`flex-1 py-2 px-1 rounded-xl border text-xs font-semibold transition ${
        activePreset === id && !showCustomSize
          ? 'bg-brand-600 text-white border-brand-600'
          : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
      }`}
    >
      <div>{label}</div>
      <div className="font-normal opacity-60" style={{ fontSize: 9 }}>{desc}</div>
    </button>
  )

  return (
    <>
      <Section title="Print Layout" desc="Controls how the ESC/POS receipt is formatted on the thermal printer.">
        <Field label="Font Size" hint="Width and height multiply the base character size. 1×1 = normal. 2×2 = double.">
          <div className="flex gap-1.5 mb-2">
            <PresetBtn id="small"  label="Small"  desc="1×1" w={1} h={1} />
            <PresetBtn id="medium" label="Medium" desc="1×2 tall" w={1} h={2} />
            <PresetBtn id="large"  label="Large"  desc="2×2" w={2} h={2} />
            <button
              onClick={() => setShowCustomSize(true)}
              className={`flex-1 py-2 px-1 rounded-xl border text-xs font-semibold transition ${
                showCustomSize || activePreset === 'custom'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
              }`}
            >
              Custom
            </button>
          </div>
          {(showCustomSize || activePreset === 'custom') && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[10px] text-gray-500 font-medium mb-1 block">Width ×</label>
                <input
                  type="number" min="1" max="4" value={charW}
                  onChange={e => setCharW(Math.min(4, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-medium mb-1 block">Height ×</label>
                <input
                  type="number" min="1" max="4" value={charH}
                  onChange={e => setCharH(Math.min(4, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="input text-sm"
                />
              </div>
            </div>
          )}
        </Field>
        <Field label="Feed lines after print" hint="Blank lines of paper below the last line before cutting (0 = no extra space, 4 = more space to tear).">
          <input
            type="number" min="0" max="8" value={feedLines}
            onChange={e => setFeedLines(Math.min(8, Math.max(0, parseInt(e.target.value) || 0)))}
            className="input text-sm"
          />
        </Field>
        <Toggle value={boldHeaders} onChange={setBoldHeaders} label="Bold item names" />
        <Toggle value={boldTotals}  onChange={setBoldTotals}  label="Bold TOTAL line" />
      </Section>

      <Section title="Template Mode">
        <Toggle
          value={sameTemplate}
          onChange={setSameTemplate}
          label="Use same template for print and WhatsApp"
        />
        {!sameTemplate && <p className="text-xs text-gray-400 mt-2">Separate settings will appear below for each channel.</p>}
      </Section>

      <Section title={sameTemplate ? 'Receipt Sections' : 'Print Receipt Sections'}>
        {SECTIONS.map(s => (
          <Toggle
            key={s.key}
            value={printSettings[s.key] ?? true}
            onChange={v => setPrintSettings(p => ({ ...p, [s.key]: v }))}
            label={s.label}
          />
        ))}
        <Field label="Footer Message" hint="Appears at the bottom of the receipt. Use a new line for a second line.">
          <textarea
            rows={3}
            value={footerText}
            onChange={e => setFooterText(e.target.value)}
            className="input text-sm resize-none"
            placeholder="Thank you for shopping with us!"
          />
        </Field>
      </Section>

      {!sameTemplate && (
        <Section title="WhatsApp Receipt Sections">
          {SECTIONS.map(s => (
            <Toggle
              key={s.key}
              value={waSettings[s.key] ?? true}
              onChange={v => setWaSettings(p => ({ ...p, [s.key]: v }))}
              label={s.label}
            />
          ))}
          <Field label="WhatsApp Footer Message" hint="Leave blank to use the same footer as print.">
            <textarea
              rows={3}
              value={waFooterText}
              onChange={e => setWaFooterText(e.target.value)}
              className="input text-sm resize-none"
              placeholder="Same as print footer"
            />
          </Field>
        </Section>
      )}

      <button onClick={save} className="btn-primary w-full"><Save size={14} />Save Receipt Settings</button>
    </>
  )
}

// ── Users ──────────────────────────────────────────────────────────────────
function UsersTab({ showToast, currentUser }) {
  const [users, setUsers]     = useState([])
  const [editUser, setEditUser] = useState(null)
  const [showPin, setShowPin] = useState(false)
  const [form, setForm]       = useState({ name: '', username: '', role: 'cashier', pin: '' })

  const load = async () => setUsers(await getAllUsers())
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || !form.pin) { showToast('Name and PIN are required', 'error'); return }
    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) { showToast('PIN must be 4 digits', 'error'); return }
    const payload = { name: form.name, username: form.username || form.name.toLowerCase().replace(/\s/g, ''), role: form.role, pin: form.pin, active: 1 }
    if (editUser?.id) await db.users.update(editUser.id, payload)
    else await db.users.add(payload)
    await logAudit(editUser?.id ? 'user_edited' : 'user_added', currentUser, { name: form.name })
    setEditUser(null); setForm({ name: '', username: '', role: 'cashier', pin: '' })
    showToast('User saved')
    await load()
  }

  const deactivate = async (u) => {
    if (u.id === currentUser?.id) { showToast('Cannot deactivate yourself', 'error'); return }
    await db.users.update(u.id, { active: 0 })
    showToast('User deactivated')
    await load()
  }

  const roleColor = r => r === 'admin' ? 'badge-brand' : r === 'manager' ? 'badge-info' : 'bg-gray-100 text-gray-600 badge'

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm font-bold text-gray-900">{users.length} active users</p>
        <button onClick={() => { setEditUser({}); setForm({ name: '', username: '', role: 'cashier', pin: '' }) }} className="btn-primary text-xs py-1.5 px-3">
          <Plus size={13} />Add User
        </button>
      </div>

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-sm uppercase">{u.name?.[0]}</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">{u.name}</p>
              <span className={`${roleColor(u.role)} text-[10px] capitalize`}>{u.role}</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setEditUser(u); setForm({ name: u.name, username: u.username || '', role: u.role, pin: u.pin }) }} className="btn-ghost p-1.5 text-gray-400">
                <Edit2 size={13} />
              </button>
              {u.id !== currentUser?.id && (
                <button onClick={() => deactivate(u)} className="btn-ghost p-1.5 text-red-400 hover:bg-red-50">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editUser !== null && (
        <div className="modal-overlay animate-fade-in" onClick={() => setEditUser(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900">{editUser?.id ? 'Edit User' : 'Add User'}</p>
              <button onClick={() => setEditUser(null)}><X size={17} className="text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <Field label="Full Name"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input text-sm" /></Field>
              <Field label="Username (optional)"><input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="input text-sm" placeholder="auto-generated" /></Field>
              <Field label="Role">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input text-sm">
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="4-digit PIN">
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    maxLength={4}
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    className="input text-sm pr-10"
                    placeholder="••••"
                  />
                  <button onClick={() => setShowPin(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditUser(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} className="btn-primary flex-1">Save User</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Tax ────────────────────────────────────────────────────────────────────
function TaxTab({ showToast }) {
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate]       = useState('15')
  const [discThreshold, setDiscThreshold] = useState('5')
  const [wsRoundMode, setWsRoundMode] = useState('none')
  const [checkoutRounding, setCheckoutRounding] = useState(false)

  const ROUND_OPTIONS = [
    { id: 'none', label: 'No rounding' },
    { id: 'up10', label: 'Up to 10c' },
    { id: 'up25', label: 'Up to 25c' },
    { id: 'up50', label: 'Up to 50c' },
  ]

  useEffect(() => {
    getSetting('vat_enabled', false).then(v => setVatEnabled(!!v))
    getSetting('vat_rate', 0.15).then(v => setVatRate(String(parseFloat(v) * 100)))
    getSetting('discount_threshold', 5).then(v => setDiscThreshold(String(v)))
    getSetting('ws_round_mode', 'none').then(v => setWsRoundMode(v || 'none'))
    getSetting('checkout_rounding', false).then(v => setCheckoutRounding(!!v))
  }, [])

  const save = async () => {
    await setSetting('vat_enabled', vatEnabled)
    await setSetting('vat_rate', parseFloat(vatRate) / 100)
    await setSetting('discount_threshold', parseFloat(discThreshold) || 5)
    await setSetting('ws_round_mode', wsRoundMode)
    await setSetting('checkout_rounding', checkoutRounding)
    showToast('Tax & pricing settings saved')
  }

  return (
    <>
      <Section title="Tax & Discounts">
        <Toggle value={vatEnabled} onChange={setVatEnabled} label="Enable VAT on sales" />
        <Field label="VAT Rate (%)" hint="Default is 15%">
          <input type="number" min="0" max="100" value={vatRate} onChange={e => setVatRate(e.target.value)} className="input text-sm" disabled={!vatEnabled} />
        </Field>
        <Field label="Discount PIN threshold ($)" hint="Discounts above this amount require manager PIN">
          <input type="number" min="0" value={discThreshold} onChange={e => setDiscThreshold(e.target.value)} className="input text-sm" />
        </Field>
      </Section>

      <Section title="Pricing & Rounding">
        <Field label="Wholesale unit rounding" hint="When a per-unit price is derived from a box price, round it UP to this step so giving change is easy (seller's favour).">
          <div className="grid grid-cols-2 gap-2">
            {ROUND_OPTIONS.map(o => (
              <button key={o.id} onClick={() => setWsRoundMode(o.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition ${wsRoundMode === o.id ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-100 text-gray-600'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <Toggle value={checkoutRounding} onChange={setCheckoutRounding}
          label="Choose rounding in checkout popup"
          hint="Adds a rounding selector to the price popup so you can adjust per sale." />
        <button onClick={save} className="btn-primary w-full mt-2"><Save size={14} />Save</button>
      </Section>
    </>
  )
}

// ── Printer ────────────────────────────────────────────────────────────────
function PrinterTab({ showToast }) {
  const [printerType, setPrinterType]           = useState('browser')
  const [paperWidth, setPaperWidth]             = useState('58mm')
  const [savedPrinters, setSavedPrinters]       = useState([])
  const [scanning, setScanning]                 = useState(false)
  const [networkIp, setNetworkIp]               = useState('')
  const [networkPort, setNetworkPort]           = useState('9100')
  const [rawbtAddress, setRawbtAddress]         = useState('127.0.0.1:9100')
  const [nativeBtMac, setNativeBtMac]           = useState('')
  const [nativeBtDevices, setNativeBtDevices]   = useState([])
  const [isNativeBtReady, setIsNativeBtReady]   = useState(false)
  const [statusKey, setStatusKey]               = useState(0)

  useEffect(() => {
    getSetting('printer_type', 'browser').then(setPrinterType)
    getSetting('paper_width', '58mm').then(setPaperWidth)
    getSetting('saved_printers', []).then(p => setSavedPrinters(p || []))
    getSetting('network_printer_ip', '').then(setNetworkIp)
    getSetting('network_printer_port', '9100').then(setNetworkPort)
    getSetting('rawbt_server_address', '127.0.0.1:9100').then(setRawbtAddress)
    getSetting('native_bt_mac', '').then(setNativeBtMac)

    // Detect native BT bridge — check immediately then retry after 500 ms in case
    // the BRIDGE_JS injection hasn't finished by the time this component mounts.
    const detectNativeBT = () => {
      if (typeof window._NativeBT !== 'undefined') {
        setIsNativeBtReady(true)
        try { setNativeBtDevices(window._NativeBT.scan() || []) } catch {}
        return true
      }
      return false
    }
    if (!detectNativeBT()) {
      const t = setTimeout(() => detectNativeBT(), 500)
      return () => clearTimeout(t)
    }
  }, [])

  const save = async () => {
    await setSetting('printer_type', printerType)
    await setSetting('paper_width', paperWidth)
    await setSetting('network_printer_ip', networkIp)
    await setSetting('network_printer_port', networkPort)
    await setSetting('rawbt_server_address', rawbtAddress)
    await setSetting('native_bt_mac', nativeBtMac)
    showToast('Printer settings saved')
  }

  const scanBluetooth = async () => {
    if (!navigator.bluetooth) {
      showToast('Web Bluetooth not available — use Chrome on Android or desktop', 'error')
      return
    }
    setScanning(true)
    try {
      // Try the standard BT printer service first, then fall back to all devices
      let device
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
        })
      } catch {
        device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true,
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] })
      }
      const list = [...savedPrinters.filter(p => p.id !== device.id), { id: device.id, name: device.name || 'Unknown device' }]
      setSavedPrinters(list)
      await setSetting('saved_printers', list)
      await setSetting('bt_printer_name', device.name)
      showToast(`Paired: ${device.name}`)
    } catch (e) {
      if (!e.message?.includes('cancelled') && !e.message?.includes('chosen')) {
        showToast('Bluetooth scan failed: ' + e.message, 'error')
      }
    }
    setScanning(false)
  }

  const removeSaved = async (id) => {
    const list = savedPrinters.filter(p => p.id !== id)
    setSavedPrinters(list)
    await setSetting('saved_printers', list)
    showToast('Printer removed')
  }

  const PRINTER_TYPES = [
    {
      id: 'sunmi',
      name: 'Sunmi Built-in',
      desc: 'Inner thermal printer — uses RawBT bridge when running in Chrome',
    },
    {
      id: 'bluetooth',
      name: 'Bluetooth Printer',
      desc: 'Any Bluetooth thermal printer — works on phones too',
    },
    {
      id: 'network',
      name: 'Network / USB',
      desc: 'Wired thermal printer with a network IP address',
    },
    {
      id: 'browser',
      name: 'Browser Print',
      desc: 'System print dialog — works on any device, any printer',
    },
  ]

  const isNativeBt         = isNativeBtReady
  const isSunmiApiPresent  = typeof window.SunmiPrinter !== 'undefined'
  // statusKey forces re-evaluation when the user taps "Check status"
  // eslint-disable-next-line no-unused-expressions
  void statusKey
  const isSunmiServiceReady = isSunmiApiPresent && window.SunmiPrinter.isReady?.() === true

  return (
    <>
      <Section title="Printer Type" desc="Choose how receipts are sent to the printer">
        <div className="space-y-2">
          {PRINTER_TYPES.map(pt => (
            <button
              key={pt.id}
              onClick={() => setPrinterType(pt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${printerType === pt.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${printerType === pt.id ? 'border-brand-600' : 'border-gray-300'}`}>
                {printerType === pt.id && <div className="w-2 h-2 rounded-full bg-brand-600" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{pt.name}</p>
                <p className="text-[10px] text-gray-400">{pt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Paper Width">
        <div className="flex gap-2">
          {['58mm', '80mm'].map(w => (
            <button
              key={w}
              onClick={() => setPaperWidth(w)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition ${paperWidth === w ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}
            >
              {w}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Sunmi guide ── */}
      {printerType === 'sunmi' && (
        <Section title="Sunmi Setup" desc="Using the Sunmi V1s-G built-in printer">
          {/* Live detection badge */}
          {isSunmiApiPresent ? (
            isSunmiServiceReady ? (
              <div className="p-3 bg-green-50 rounded-xl border border-green-200 mb-3 flex items-start gap-2">
                <span className="text-green-600 text-base leading-none mt-0.5">✓</span>
                <div>
                  <p className="text-xs font-bold text-green-800">Sunmi printer ready</p>
                  <p className="text-[10px] text-green-700 leading-relaxed">
                    Printer service connected. Receipts will print directly to the built-in thermal printer.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mb-3 flex items-start gap-2">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-800">Printer service connecting…</p>
                  <p className="text-[10px] text-amber-700 leading-relaxed mb-2">
                    The Sunmi API is present but the printer service hasn't connected yet. Wait a few seconds, then tap <strong>Check status</strong>. If it stays stuck, try closing and reopening the app.
                  </p>
                  <button
                    onClick={() => setStatusKey(k => k + 1)}
                    className="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition"
                  >
                    Check status
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mb-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                <p className="text-xs font-bold text-amber-800">Chrome detected — RawBT needed for direct printing</p>
              </div>
              <p className="text-[10px] text-amber-700 leading-relaxed mb-2">
                The Sunmi JSAPI only works in RawBT's built-in browser, not Chrome. Use one of these methods:
              </p>

              {/* Method A */}
              <div className="bg-white rounded-lg border border-amber-200 p-2 mb-2">
                <p className="text-[10px] font-bold text-amber-900 mb-1">⭐ Method A (Recommended) — Open POS inside RawBT</p>
                <p className="text-[10px] text-amber-700 leading-relaxed mb-1">
                  RawBT has a built-in browser. Open the POS inside it so printing goes straight to the thermal printer — no share sheet needed.
                </p>
                <ol className="text-[10px] text-amber-700 space-y-0.5 list-decimal list-inside leading-relaxed">
                  <li>Open <strong>RawBT</strong> on this Sunmi</li>
                  <li>On the home screen tap <strong>"Open URL"</strong></li>
                  <li>Enter: <code className="bg-amber-100 px-0.5 rounded">https://portionspot-v11-5.vercel.app</code></li>
                  <li>The POS opens inside RawBT — bookmark it for next time</li>
                  <li>Make sure RawBT has the <strong>Sunmi built-in printer</strong> selected</li>
                  <li>Tap Print in the POS — receipt prints directly, no dialogs</li>
                </ol>
              </div>

              {/* Method B */}
              <div className="bg-white rounded-lg border border-amber-200 p-2">
                <p className="text-[10px] font-bold text-amber-900 mb-1">Method B — Chrome + RawBT Web Share</p>
                <p className="text-[10px] text-amber-700 leading-relaxed mb-1">
                  Keep using Chrome. When you tap Print, Android's share sheet appears — pick RawBT to send the receipt to the printer.
                </p>
                <ol className="text-[10px] text-amber-700 space-y-0.5 list-decimal list-inside leading-relaxed">
                  <li>Install <strong>RawBT</strong> from Google Play (free or Premium)</li>
                  <li>Open RawBT and select the <strong>Sunmi built-in printer (DRIVER_AIDL_WOYOU_JIUIV5)</strong></li>
                  <li>Keep RawBT <strong>open in the background</strong> while using the POS</li>
                  <li>Tap Print in the POS — a <strong>share sheet</strong> will appear</li>
                  <li>Select <strong>RawBT</strong> from the share sheet</li>
                </ol>
                <p className="text-[10px] text-amber-700 mt-1 italic">
                  If the share fails, make sure RawBT is open, then tap Print again.
                </p>
              </div>
            </div>
          )}
          {/* Server for RawBT address */}
          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1.5">
              <Wifi size={13} className="text-gray-500" />
              Server for RawBT — Address
            </p>
            <p className="text-[10px] text-gray-500 mb-2">
              Open the <strong>Server for RawBT</strong> app — it shows the current IP:port (e.g. 192.168.1.x:9100).
              Paste it here. Set <strong>Data share type → RAW Mode</strong> and keep the service running.
            </p>
            <input
              value={rawbtAddress}
              onChange={e => setRawbtAddress(e.target.value)}
              className="input text-sm font-mono"
              placeholder="192.168.x.x:9100"
            />
          </div>

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mt-3">
            <p className="text-xs font-bold text-blue-800 mb-1">Connecting phones to print via this Sunmi</p>
            <ol className="text-[10px] text-blue-700 space-y-1 list-decimal list-inside leading-relaxed">
              <li>On the Sunmi: Settings → Printer → select <strong>Sunmi Built-in</strong>, open in Sunmi Browser</li>
              <li>On phones: Settings → Printer → select <strong>Bluetooth Printer</strong></li>
              <li>On phones: tap <strong>Scan for Printers</strong> and select the Sunmi device</li>
              <li>The POS on phones sends ESC/POS data to the Sunmi via Bluetooth</li>
            </ol>
          </div>
        </Section>
      )}

      {/* ── Bluetooth pairing ── */}
      {printerType === 'bluetooth' && (
        <Section title="Bluetooth Pairing" desc="Pair this device with a Bluetooth thermal printer">
          {isNativeBt ? (
            /* ── Native Classic BT (APK) path ── */
            <>
              <div className="p-3 bg-green-50 rounded-xl border border-green-200 mb-4 flex items-start gap-2">
                <span className="text-green-600 text-base leading-none mt-0.5">✓</span>
                <div>
                  <p className="text-xs font-bold text-green-800">Classic Bluetooth available</p>
                  <p className="text-[10px] text-green-700 leading-relaxed">
                    Running in the PortionSpot app — uses Classic Bluetooth (SPP/RFCOMM) which works with virtually all thermal printers.
                  </p>
                </div>
              </div>

              {nativeBtDevices.length > 0 ? (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-gray-500">Paired devices — tap to select your printer</p>
                  {nativeBtDevices.map(d => (
                    <button
                      key={d.address}
                      onClick={() => { setNativeBtMac(d.address); setSetting('native_bt_mac', d.address) }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition ${nativeBtMac === d.address ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${nativeBtMac === d.address ? 'border-brand-600' : 'border-gray-300'}`}>
                        {nativeBtMac === d.address && <div className="w-2 h-2 rounded-full bg-brand-600" />}
                      </div>
                      <Bluetooth size={14} className={nativeBtMac === d.address ? 'text-brand-500 shrink-0' : 'text-gray-400 shrink-0'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{d.address}</p>
                      </div>
                      {nativeBtMac === d.address && <CheckCircle2 size={14} className="text-brand-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 mb-4">
                  <p className="text-[10px] text-amber-700 leading-relaxed">
                    No paired Bluetooth devices found. Go to <strong>Android Settings → Bluetooth</strong>, pair your printer, then come back here.
                  </p>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-bold text-gray-700 mb-1">How it works</p>
                <ol className="text-[10px] text-gray-500 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Pair your printer in <strong>Android Settings → Bluetooth</strong></li>
                  <li>Come back here and tap it in the list above to select it</li>
                  <li>Tap Print on any receipt — sends directly to the selected printer over SPP</li>
                  <li>No share sheet, no picker dialog every time</li>
                </ol>
              </div>
            </>
          ) : (
            /* ── Web Bluetooth (Chrome / browser) path ── */
            <>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mb-4">
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  <strong>Chrome on Android</strong> supports Web Bluetooth (BLE printers only). Most cheap thermal printers use Classic Bluetooth — if your printer doesn't appear in the scan, install the <strong>PortionSpot APK</strong> for Classic BT support. Safari (iOS) does not support this — use Browser Print instead.
                </p>
              </div>
              <button
                onClick={scanBluetooth}
                disabled={scanning}
                className="btn-primary w-full mb-4 disabled:opacity-60"
              >
                {scanning
                  ? <><BluetoothSearching size={15} className="animate-pulse" />Scanning…</>
                  : <><Bluetooth size={15} />Scan for Printers</>}
              </button>

              {savedPrinters.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-gray-500">Paired printers</p>
                  {savedPrinters.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                      <Bluetooth size={14} className="text-blue-500 shrink-0" />
                      <span className="text-sm text-gray-900 flex-1 font-medium">{p.name}</span>
                      <button onClick={() => removeSaved(p.id)} className="text-gray-300 hover:text-red-400 transition">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-bold text-gray-700 mb-1">How it works</p>
                <ol className="text-[10px] text-gray-500 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Power on your Bluetooth thermal printer</li>
                  <li>Enable Bluetooth on this phone/device</li>
                  <li>Tap <strong>Scan for Printers</strong> above and select yours</li>
                  <li>Each time you print, the device picker appears — select the same printer</li>
                  <li>Compatible with BLE 58mm/80mm Bluetooth thermal printers</li>
                </ol>
              </div>
            </>
          )}
        </Section>
      )}

      {/* ── Network printer config ── */}
      {printerType === 'network' && (
        <Section title="Network Printer" desc="Enter the IP address of your thermal printer">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 mb-4">
            <p className="text-[10px] text-amber-700 leading-relaxed">
              Direct TCP printing from a browser is blocked by most networks. If the printer is not reachable,
              the app will download a <code>.bin</code> ESC/POS file you can send manually. For reliable
              network printing, use a print bridge app (e.g. <strong>PrintNode</strong> or a local proxy).
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Printer IP Address</label>
              <input
                className="input"
                placeholder="e.g. 192.168.1.100"
                value={networkIp}
                onChange={e => setNetworkIp(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Port</label>
              <input
                className="input"
                placeholder="9100"
                value={networkPort}
                onChange={e => setNetworkPort(e.target.value)}
              />
            </div>
          </div>
        </Section>
      )}

      {/* ── Browser guide ── */}
      {printerType === 'browser' && (
        <Section title="Browser Print" desc="Uses the system print dialog">
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mb-3">
            <p className="text-xs font-bold text-blue-800 mb-1">How it works</p>
            <p className="text-[10px] text-blue-700 leading-relaxed">
              When you tap Print, the system print dialog opens. On a desktop computer this lets you select
              any connected printer directly. Set paper size to <strong>58mm</strong> or <strong>80mm</strong> roll
              in the printer driver for best results.
            </p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs font-bold text-amber-800 mb-1">On Android / Sunmi Chrome</p>
            <p className="text-[10px] text-amber-700 leading-relaxed">
              Android Chrome's print dialog shows <strong>"Save as PDF"</strong> and <strong>"Scan for printers"</strong>.
              This is normal — Android does not expose connected printers directly to the browser.
            </p>
            <p className="text-[10px] text-amber-700 leading-relaxed mt-1">
              To print directly to the Sunmi's built-in thermal printer without any dialog:
            </p>
            <ol className="text-[10px] text-amber-700 space-y-0.5 list-decimal list-inside leading-relaxed mt-1">
              <li>Switch to <strong>Sunmi Built-in</strong> printer mode (above)</li>
              <li>Open this app in the <strong>Sunmi Browser app</strong> (not Chrome)</li>
              <li>Printing will then go directly to the thermal printer — no dialog</li>
            </ol>
          </div>
        </Section>
      )}


      <button onClick={save} className="btn-primary w-full"><Save size={14} />Save Printer Settings</button>
    </>
  )
}

// ── Cart HUD ───────────────────────────────────────────────────────────────
function CartHUDTab({ showToast }) {
  const { floatPages, setFloatPages, floatAction, setFloatAction } = useSession()

  const save = async () => {
    await setSetting('float_cart_pages', floatPages)
    await setSetting('float_cart_action', floatAction)
    showToast('Cart HUD settings saved')
  }

  return (
    <>
      <Section title="Where to Show Cart HUD" desc="The floating cart pill will appear on selected pages">
        <div className="space-y-2">
          {PAGES_OPTIONS.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700">{p.label}</span>
              <button
                onClick={() => setFloatPages(prev =>
                  prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                )}
                className={`toggle ${floatPages.includes(p.id) ? 'toggle-on' : 'toggle-off'}`}
              >
                <span className={`toggle-thumb ${floatPages.includes(p.id) ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="When You Tap a Held Receipt" desc="What happens when you select a held sale from the HUD">
        <div className="space-y-2">
          {[
            { id: 'navigate', label: 'Go to POS', desc: 'Navigate to POS and load the held sale' },
            { id: 'peek',     label: 'Preview Only', desc: 'Show the sale details without navigating' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFloatAction(opt.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${floatAction === opt.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${floatAction === opt.id ? 'border-brand-600' : 'border-gray-300'}`}>
                {floatAction === opt.id && <div className="w-2 h-2 rounded-full bg-brand-600" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                <p className="text-[10px] text-gray-400">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <button onClick={save} className="btn-primary w-full"><Save size={14} />Save Cart HUD Settings</button>
    </>
  )
}

// ── Margins ────────────────────────────────────────────────────────────────
function MarginsTab({ showToast }) {
  const [formula, setFormula] = useState('gross')
  const [autoConvert, setAutoConvert] = useState(true)

  useEffect(() => {
    getSetting('margin_formula', 'gross').then(setFormula)
    getSetting('auto_convert_stock', true).then(v => setAutoConvert(!!v))
  }, [])

  const save = async () => {
    await setSetting('margin_formula', formula)
    await setSetting('auto_convert_stock', autoConvert)
    showToast('Margin & stock settings saved')
  }

  return (
    <>
      <Section title="Margin Formula" desc="Used in Sales & Reports margins tab. Can be changed at any time.">
        <div className="space-y-2">
          {[
            {
              id: 'gross',
              label: 'Gross Margin %',
              formula: '(Revenue − Cost) ÷ Revenue × 100',
              desc: 'Industry standard for retail. Shows what % of each dollar is profit.',
              example: '$100 sale, $60 cost → 40% gross margin',
            },
            {
              id: 'markup',
              label: 'Markup %',
              formula: '(Revenue − Cost) ÷ Cost × 100',
              desc: 'Common in wholesale. Shows how much you marked up from cost price.',
              example: '$100 sale, $60 cost → 66.7% markup',
            },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFormula(opt.id)}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition ${formula === opt.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${formula === opt.id ? 'border-brand-600' : 'border-gray-300'}`}>
                {formula === opt.id && <div className="w-2 h-2 rounded-full bg-brand-600" />}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                <p className="text-xs text-brand-600 font-mono my-0.5">{opt.formula}</p>
                <p className="text-[10px] text-gray-500">{opt.desc}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 italic">{opt.example}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Stock Auto-Conversion" desc="When loose units equal or exceed box size, automatically convert to boxes">
        <Toggle
          value={autoConvert}
          onChange={setAutoConvert}
          label="Auto-convert units to boxes"
        />
        <p className="text-[10px] text-gray-400 mt-2">
          Example: 24 loose units with box size 12 → 2 boxes + 0 units
        </p>
      </Section>

      <button onClick={save} className="btn-primary w-full"><Save size={14} />Save Settings</button>
    </>
  )
}

// ── Security ───────────────────────────────────────────────────────────────
function SecurityTab({ showToast }) {
  const [timeoutMins, setTimeoutMins] = useState(30)
  const [forcingLock, setForcingLock] = useState(false)

  useEffect(() => {
    getSetting('session_timeout_mins', 30).then(v => setTimeoutMins(Number(v)))
  }, [])

  const save = async () => {
    await setSetting('session_timeout_mins', Number(timeoutMins))
    showToast('Security settings saved')
  }

  const forceLogoutAll = async () => {
    setForcingLock(true)
    try {
      const now = new Date().toISOString()
      await setSetting('force_lock_at', now)
      // Also push directly to Supabase if connected so other devices see it immediately
      try {
        const { getSupabaseClient } = await import('../lib/sync')
        const sb = await getSupabaseClient()
        if (sb) await sb.from('settings').upsert({ key: 'force_lock_at', value: now }, { onConflict: 'key' })
      } catch {}
      showToast('All sessions will lock within 30 seconds', 'success')
    } finally {
      setForcingLock(false)
    }
  }

  return (
    <>
      <Section title="Session Timeout" desc="Lock the screen after this period of inactivity. The cashier must re-enter their PIN to continue.">
        <Field label="Lock after">
          <select value={timeoutMins} onChange={e => setTimeoutMins(Number(e.target.value))} className="input text-sm">
            <option value={0}>Never (disabled)</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </Field>
        <p className="text-[10px] text-gray-400 mt-2">
          Activity (taps, key presses) resets the timer. Set to 0 to keep the session open until manual logout.
        </p>
      </Section>
      <button onClick={save} className="btn-primary w-full"><Save size={14} />Save Security Settings</button>

      <Section title="Force Lock All Devices" desc="Immediately lock all active sessions on every device. Useful if a cashier left a device unattended.">
        <button
          onClick={forceLogoutAll}
          disabled={forcingLock}
          className="btn-danger w-full"
          style={{ marginTop: 4 }}
        >
          <Shield size={14} />{forcingLock ? 'Locking sessions…' : 'Force Lock All Sessions'}
        </button>
        <p className="text-[10px] text-gray-400 mt-2">
          Each connected device will lock within 30 seconds. Staff must re-enter their PIN to continue.
        </p>
      </Section>
    </>
  )
}

// ── Audit log ──────────────────────────────────────────────────────────────
function AuditTab() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    db.auditLog.orderBy('timestamp').reverse().limit(200).toArray().then(r => {
      setRows(r)
      setLoading(false)
    })
  }, [])

  const filtered = rows.filter(r =>
    !search ||
    r.action?.toLowerCase().includes(search.toLowerCase()) ||
    r.userName?.toLowerCase().includes(search.toLowerCase())
  )

  const ACTION_COLORS = {
    return_completed: '#f59e0b',
    stock_adjusted:   '#3b82f6',
    product_edited:   '#8b5cf6',
    product_added:    '#10b981',
    sale_voided:      '#ef4444',
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter by action or user…" className="input text-sm w-full" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ScrollText size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No audit entries found</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r, i) => {
            const color = ACTION_COLORS[r.action] || '#6b7280'
            let details = ''
            try { details = r.details ? JSON.stringify(JSON.parse(r.details), null, 0).replace(/[{}"]/g, '').replace(/,/g, ' · ') : '' } catch {}
            return (
              <div key={r.id || i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-gray-900">{r.action?.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {new Date(r.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{r.userName || 'system'}{details ? ' · ' + details : ''}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[10px] text-gray-400 text-center">Showing last 200 entries</p>
    </div>
  )
}

// ── Danger ─────────────────────────────────────────────────────────────────
function DangerTab({ showToast }) {
  const [confirm, setConfirm] = useState('')

  const wipeAll = async () => {
    if (confirm !== 'WIPE') { showToast('Type WIPE to confirm', 'error'); return }
    await db.sales.clear()
    await db.creditTransactions.clear()
    await db.stockMovements.clear()
    await db.auditLog.clear()
    showToast('Sales data cleared', 'success')
    setConfirm('')
  }

  const wipePrices = async () => {
    const products = await db.products.toArray()
    for (const p of products) {
      await db.products.update(p.id, { stockBoxes: 0, stockUnits: 0 })
    }
    showToast('Stock reset to zero', 'success')
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-red-600" />
          <p className="font-bold text-red-800 text-sm">Danger Zone</p>
        </div>
        <p className="text-xs text-red-600">These actions are irreversible. Use with caution.</p>
      </div>

      <div className="card p-4">
        <p className="font-bold text-gray-900 text-sm mb-1">Reset All Stock to Zero</p>
        <p className="text-xs text-gray-500 mb-3">Sets all product stock boxes and units to 0. Products are kept.</p>
        <button onClick={wipePrices} className="btn-danger text-xs py-2 px-4">Reset Stock</button>
      </div>

      <div className="card p-4">
        <p className="font-bold text-gray-900 text-sm mb-1">Wipe All Sales Data</p>
        <p className="text-xs text-gray-500 mb-3">Deletes all sales, credit transactions, stock movements, and audit logs. Products and users are kept.</p>
        <Field label="Type WIPE to confirm">
          <input value={confirm} onChange={e => setConfirm(e.target.value)} className="input text-sm mb-3" placeholder="WIPE" />
        </Field>
        <button onClick={wipeAll} className="btn-danger text-xs py-2 px-4">Wipe Sales Data</button>
      </div>
    </div>
  )
}

