import React, { useState, useEffect, useRef } from 'react'
import {
  Store, User, Percent, Printer, AlertTriangle, Image, ReceiptText,
  ShoppingCart, TrendingUp, Plus, Edit2, Trash2, Save, X, Eye, EyeOff,
  Bluetooth, BluetoothSearching, CheckCircle2, Upload, Wifi
} from 'lucide-react'
import { db, getSetting, setSetting, saveSetting, getAllUsers, logAudit } from '../lib/db'
import { useSession } from '../context/SessionContext'
import { fmt } from '../lib/utils'

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
    { id: 'logo',     label: 'Logo',     icon: Image },
    { id: 'receipt',  label: 'Receipt',  icon: ReceiptText },
    { id: 'users',    label: 'Users',    icon: User },
    { id: 'tax',      label: 'Tax',      icon: Percent },
    { id: 'printer',  label: 'Printer',  icon: Printer },
    { id: 'cart',     label: 'Cart HUD', icon: ShoppingCart },
    { id: 'margins',  label: 'Margins',  icon: TrendingUp },
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
        {tab === 'logo'    && <LogoTab showToast={showToast} />}
        {tab === 'receipt' && <ReceiptTab showToast={showToast} />}
        {tab === 'users'   && <UsersTab showToast={showToast} currentUser={user} />}
        {tab === 'tax'     && <TaxTab showToast={showToast} />}
        {tab === 'printer' && <PrinterTab showToast={showToast} />}
        {tab === 'cart'    && <CartHUDTab showToast={showToast} />}
        {tab === 'margins' && <MarginsTab showToast={showToast} />}
        {tab === 'danger'  && <DangerTab showToast={showToast} />}
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

function Toggle({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <button onClick={() => onChange(!value)} className={`toggle ${value ? 'toggle-on' : 'toggle-off'}`}>
        <span className={`toggle-thumb ${value ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
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
    })()
  }, [])

  const save = async () => {
    await setSetting('receipt_same_template', sameTemplate)
    await setSetting('receipt_footer_text', footerText)
    for (const [k, v] of Object.entries(printSettings)) await setSetting(`receipt_${k}`, v)
    if (!sameTemplate) {
      for (const [k, v] of Object.entries(waSettings)) await setSetting(`whatsapp_${k}`, v)
      await setSetting('whatsapp_footer_text', waFooterText)
    }
    showToast('Receipt settings saved')
  }

  return (
    <>
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

  useEffect(() => {
    getSetting('vat_enabled', false).then(v => setVatEnabled(!!v))
    getSetting('vat_rate', 0.15).then(v => setVatRate(String(parseFloat(v) * 100)))
    getSetting('discount_threshold', 5).then(v => setDiscThreshold(String(v)))
  }, [])

  const save = async () => {
    await setSetting('vat_enabled', vatEnabled)
    await setSetting('vat_rate', parseFloat(vatRate) / 100)
    await setSetting('discount_threshold', parseFloat(discThreshold) || 5)
    showToast('Tax settings saved')
  }

  return (
    <Section title="Tax & Discounts">
      <Toggle value={vatEnabled} onChange={setVatEnabled} label="Enable VAT on sales" />
      <Field label="VAT Rate (%)" hint="Default is 15%">
        <input type="number" min="0" max="100" value={vatRate} onChange={e => setVatRate(e.target.value)} className="input text-sm" disabled={!vatEnabled} />
      </Field>
      <Field label="Discount PIN threshold ($)" hint="Discounts above this amount require manager PIN">
        <input type="number" min="0" value={discThreshold} onChange={e => setDiscThreshold(e.target.value)} className="input text-sm" />
      </Field>
      <button onClick={save} className="btn-primary w-full mt-2"><Save size={14} />Save</button>
    </Section>
  )
}

// ── Printer ────────────────────────────────────────────────────────────────
function PrinterTab({ showToast }) {
  const [printerType, setPrinterType] = useState('browser')
  const [paperWidth, setPaperWidth]   = useState('58mm')
  const [savedPrinters, setSavedPrinters] = useState([])
  const [scanning, setScanning]       = useState(false)
  const [networkIp, setNetworkIp]     = useState('')
  const [networkPort, setNetworkPort] = useState('9100')

  useEffect(() => {
    getSetting('printer_type', 'browser').then(setPrinterType)
    getSetting('paper_width', '58mm').then(setPaperWidth)
    getSetting('saved_printers', []).then(p => setSavedPrinters(p || []))
    getSetting('network_printer_ip', '').then(setNetworkIp)
    getSetting('network_printer_port', '9100').then(setNetworkPort)
  }, [])

  const save = async () => {
    await setSetting('printer_type', printerType)
    await setSetting('paper_width', paperWidth)
    await setSetting('network_printer_ip', networkIp)
    await setSetting('network_printer_port', networkPort)
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
          {typeof window.SunmiPrinter !== 'undefined' ? (
            <div className="p-3 bg-green-50 rounded-xl border border-green-200 mb-3 flex items-start gap-2">
              <span className="text-green-600 text-base leading-none mt-0.5">✓</span>
              <div>
                <p className="text-xs font-bold text-green-800">Sunmi printer detected</p>
                <p className="text-[10px] text-green-700 leading-relaxed">
                  The Sunmi JSAPI is available. Printing will go directly to the built-in thermal printer.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mb-3 flex items-start gap-2">
              <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
              <div>
                <p className="text-xs font-bold text-amber-800">Using Chrome — install RawBT for direct printing</p>
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  Chrome cannot access the Sunmi built-in printer directly. Install <strong>RawBT</strong> (free, Google Play)
                  to enable direct thermal printing from Chrome.
                </p>
                <ol className="text-[10px] text-amber-700 space-y-0.5 list-decimal list-inside leading-relaxed mt-1.5">
                  <li>Install <strong>RawBT</strong> from Google Play on this Sunmi</li>
                  <li>Open RawBT → Settings → enable <strong>HTTP API</strong></li>
                  <li>In RawBT, select the <strong>built-in printer</strong></li>
                  <li>Come back here and print — it will work automatically</li>
                </ol>
                <p className="text-[10px] text-amber-700 leading-relaxed mt-1.5">
                  Without RawBT, printing will fall back to the Chrome print dialog.
                </p>
              </div>
            </div>
          )}
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
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
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mb-4">
            <p className="text-[10px] text-blue-700 leading-relaxed">
              <strong>Chrome on Android</strong> supports Web Bluetooth. Safari (iOS) does not — use the Browser print option on iPhone/iPad.
              The printer must be powered on and in pairing mode.
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
              <li>Compatible with most 58mm/80mm Bluetooth thermal printers</li>
            </ol>
          </div>
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

