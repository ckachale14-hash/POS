/**
 * PortionSpot Unified Printer Driver
 * Handles: Sunmi inner printer (JSAPI), Bluetooth ESC/POS, Network/USB, Browser fallback
 *
 * Usage:
 *   import { printReceipt } from '../lib/printer'
 *   await printReceipt(record, shop, settings)
 */

import { getSetting } from './db'

// ── ESC/POS byte commands ──────────────────────────────────────────────────
const ESC = 0x1b
const GS  = 0x1d

const CMD = {
  INIT:          [ESC, 0x40],
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  ALIGN_RIGHT:   [ESC, 0x61, 0x02],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  DOUBLE_ON:     [GS,  0x21, 0x11],  // double width + height
  DOUBLE_OFF:    [GS,  0x21, 0x00],
  CUT:           [GS,  0x56, 0x41, 0x10],
  FEED_3:        [ESC, 0x64, 0x03],
  LF:            [0x0a],
}

function bytes(...cmds) {
  return new Uint8Array(cmds.flat())
}

function textBytes(str) {
  return new TextEncoder().encode(str)
}

function pad(str, len) {
  return String(str).padEnd(len).slice(0, len)
}

function center(str, width = 32) {
  const s = String(str)
  if (s.length >= width) return s.slice(0, width)
  const pad = Math.floor((width - s.length) / 2)
  return ' '.repeat(pad) + s
}

function twoCol(left, right, width = 32) {
  const l = String(left)
  const r = String(right)
  if (l.length + r.length + 1 > width) {
    return l.slice(0, width - r.length - 1) + ' ' + r
  }
  return l + ' '.repeat(width - l.length - r.length) + r
}

function dashes(width = 32) {
  return '-'.repeat(width)
}

// ── Format currency (simple, no import to keep this file standalone) ───────
function fmt(n) {
  const num = parseFloat(n) || 0
  return `$${num.toFixed(2)}`
}

// ── Build ESC/POS byte array from a receipt record ─────────────────────────
export function buildEscPos(record, shop, settings = {}, paperWidth = '58mm') {
  const W = paperWidth === '80mm' ? 48 : 32
  const isQuote = record.type === 'quote'
  const payments = record.payments?.length > 0
    ? record.payments
    : [{ method: record.payMethod || 'cash', amount: record.amountPaid || record.grandTotal || 0 }]
  const shopPhones = Array.isArray(shop?.phones)
    ? shop.phones
    : (shop?.phones || '').split(',').filter(Boolean)

  const chunks = []
  const push = (...parts) => chunks.push(...parts)
  const line = (str = '') => push(textBytes(str + '\n'))
  const cmd = (...c) => push(bytes(...c))

  // Init
  cmd(CMD.INIT)

  // Header — shop name centered bold large
  cmd(CMD.ALIGN_CENTER)
  cmd(CMD.BOLD_ON, CMD.DOUBLE_ON)
  line(shop?.name || 'PORTIONSPOT MOTORS')
  cmd(CMD.DOUBLE_OFF, CMD.BOLD_OFF)

  if (shop?.tagline) line(shop.tagline)
  if (shop?.address) line(shop.address)
  shopPhones.forEach(p => line(p.trim()))
  if (settings.show_email && shop?.email) line(shop.email)
  if (settings.show_website && shop?.website) line(shop.website)

  cmd(CMD.ALIGN_LEFT)
  line(dashes(W))

  // Type + ref
  cmd(CMD.ALIGN_CENTER, CMD.BOLD_ON)
  line(isQuote ? '*** QUOTATION ***' : '*** RECEIPT ***')
  cmd(CMD.BOLD_OFF, CMD.ALIGN_LEFT)

  const dateStr = new Date(record.createdAt).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  line(twoCol(`Ref: ${record.ref || record.id}`, dateStr, W))
  line(`Customer: ${record.customer || 'Walk-in'}`)
  if (settings.show_cashier && record.cashier) line(`Cashier: ${record.cashier}`)
  if (!isQuote && settings.show_payment) {
    line(`Payment: ${payments.map(p => `${p.method} ${fmt(p.amount)}`).join(' + ')}`)
  }
  if (isQuote) {
    const valid = record.validUntil
      ? new Date(record.validUntil).toLocaleDateString('en-GB')
      : '7 days'
    line(`Valid until: ${valid}`)
  }

  line(dashes(W))

  // Items
  ;(record.items || []).forEach(item => {
    const gross = (item.unitPrice || 0) * (item.qty || 0)
    const disc = item.lineDiscount || 0
    const net = gross - disc
    cmd(CMD.BOLD_ON)
    line(item.name.slice(0, W))
    cmd(CMD.BOLD_OFF)
    line(twoCol(`  ${item.label} x${item.qty} @ ${fmt(item.unitPrice)}`, fmt(net), W))
    if (disc > 0) line(twoCol('  Discount', `-${fmt(disc)}`, W))
  })

  line(dashes(W))

  // Totals
  line(twoCol('Subtotal', fmt(record.subtotal || 0), W))
  if ((record.lineDiscountTotal || 0) > 0)
    line(twoCol('Line discounts', `-${fmt(record.lineDiscountTotal)}`, W))
  if ((record.saleDiscount || 0) > 0)
    line(twoCol('Sale discount', `-${fmt(record.saleDiscount)}`, W))
  if (settings.show_vat && record.vatEnabled)
    line(twoCol('VAT (15%)', fmt(record.vatAmount || 0), W))

  cmd(CMD.BOLD_ON, CMD.DOUBLE_ON)
  line(twoCol('TOTAL', fmt(record.grandTotal || record.total || 0), W))
  cmd(CMD.DOUBLE_OFF, CMD.BOLD_OFF)

  // Payment breakdown
  if (!isQuote && settings.show_payment && payments.length > 0) {
    line(dashes(W))
    line('Payment:')
    payments.forEach(p => line(twoCol(`  ${p.method || 'cash'}`, fmt(p.amount), W)))
  }

  // Change / owing
  if (!isQuote && settings.show_change) {
    if ((record.changeOwed || 0) > 0) line(twoCol('Change owed', fmt(record.changeOwed), W))
    if ((record.changeGiven || 0) > 0) line(twoCol('Change given', fmt(record.changeGiven), W))
    if ((record.changeStillOwed || 0) > 0) line(twoCol('Change still owed', fmt(record.changeStillOwed), W))
    if ((record.amountOwing || 0) > 0) line(twoCol('AMOUNT OWING', fmt(record.amountOwing), W))
  }

  // Footer
  if (settings.show_footer && settings.footer_text) {
    line(dashes(W))
    cmd(CMD.ALIGN_CENTER)
    settings.footer_text.split('\n').forEach(l => line(l))
    cmd(CMD.ALIGN_LEFT)
  }

  // Feed + cut
  cmd(CMD.FEED_3)
  cmd(CMD.CUT)

  // Merge all chunks into one Uint8Array
  const totalLen = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// ── Detect Sunmi JSAPI availability ───────────────────────────────────────
// The JSAPI (window.SunmiPrinter) is ONLY injected when the app runs inside
// the Sunmi device's built-in WebView browser, NOT in Chrome/Firefox.
// Running via `npm run dev` and opening in Chrome on the Sunmi = no JSAPI.
export function isSunmiDevice() {
  const ua = navigator.userAgent || ''
  return /sunmi/i.test(ua) || typeof window.SunmiPrinter !== 'undefined'
}

export function hasSunmiJSAPI() {
  return typeof window.SunmiPrinter !== 'undefined' && window.SunmiPrinter !== null
}

// ── Sunmi inner printer via JSAPI ──────────────────────────────────────────
async function printViaSunmiJSAPI(record, shop, settings) {
  const api = window.SunmiPrinter
  if (!api) throw new Error('Sunmi JSAPI not available')

  const isQuote = record.type === 'quote'
  const payments = record.payments?.length > 0
    ? record.payments
    : [{ method: record.payMethod || 'cash', amount: record.amountPaid || record.grandTotal || 0 }]
  const shopPhones = Array.isArray(shop?.phones)
    ? shop.phones
    : (shop?.phones || '').split(',').filter(Boolean)

  await api.printerInit()
  await api.setAlignment(1) // center
  await api.setPrinterStyle(8, 1) // bold on
  await api.setFontSize(28)
  await api.printText((shop?.name || 'PORTIONSPOT MOTORS') + '\n')
  await api.setFontSize(24)
  await api.setPrinterStyle(8, 0) // bold off

  if (shop?.tagline) await api.printText(shop.tagline + '\n')
  if (shop?.address)  await api.printText(shop.address + '\n')
  for (const p of shopPhones) await api.printText(p.trim() + '\n')
  if (settings.show_email && shop?.email) await api.printText(shop.email + '\n')
  if (settings.show_website && shop?.website) await api.printText(shop.website + '\n')

  await api.setAlignment(0) // left
  await api.printText('-'.repeat(32) + '\n')

  await api.setAlignment(1)
  await api.setPrinterStyle(8, 1)
  await api.printText((isQuote ? '*** QUOTATION ***' : '*** RECEIPT ***') + '\n')
  await api.setPrinterStyle(8, 0)
  await api.setAlignment(0)

  const dateStr = new Date(record.createdAt).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  await api.printText(`Ref: ${record.ref || record.id}   ${dateStr}\n`)
  await api.printText(`Customer: ${record.customer || 'Walk-in'}\n`)
  if (settings.show_cashier && record.cashier) await api.printText(`Cashier: ${record.cashier}\n`)
  if (!isQuote && settings.show_payment) {
    await api.printText(`Payment: ${payments.map(p => `${p.method} $${parseFloat(p.amount).toFixed(2)}`).join(' + ')}\n`)
  }
  if (isQuote) {
    const valid = record.validUntil ? new Date(record.validUntil).toLocaleDateString('en-GB') : '7 days'
    await api.printText(`Valid until: ${valid}\n`)
  }

  await api.printText('-'.repeat(32) + '\n')

  for (const item of (record.items || [])) {
    const net = (item.unitPrice || 0) * (item.qty || 0) - (item.lineDiscount || 0)
    await api.setPrinterStyle(8, 1)
    await api.printText(item.name + '\n')
    await api.setPrinterStyle(8, 0)
    await api.printColumnsText(
      [`  ${item.label} x${item.qty} @ $${parseFloat(item.unitPrice).toFixed(2)}`, `$${net.toFixed(2)}`],
      [24, 8], [0, 2]
    )
    if ((item.lineDiscount || 0) > 0) {
      await api.printColumnsText(['  Discount', `-$${item.lineDiscount.toFixed(2)}`], [24, 8], [0, 2])
    }
  }

  await api.printText('-'.repeat(32) + '\n')
  await api.printColumnsText(['Subtotal', fmt(record.subtotal || 0)], [24, 8], [0, 2])
  if ((record.lineDiscountTotal || 0) > 0)
    await api.printColumnsText(['Line discounts', `-${fmt(record.lineDiscountTotal)}`], [24, 8], [0, 2])
  if ((record.saleDiscount || 0) > 0)
    await api.printColumnsText(['Sale discount', `-${fmt(record.saleDiscount)}`], [24, 8], [0, 2])
  if (settings.show_vat && record.vatEnabled)
    await api.printColumnsText(['VAT (15%)', fmt(record.vatAmount || 0)], [24, 8], [0, 2])

  await api.setFontSize(28)
  await api.setPrinterStyle(8, 1)
  await api.printColumnsText(
    ['TOTAL', fmt(record.grandTotal || record.total || 0)],
    [24, 8], [0, 2]
  )
  await api.setPrinterStyle(8, 0)
  await api.setFontSize(24)

  if (!isQuote && settings.show_payment && payments.length > 0) {
    await api.printText('-'.repeat(32) + '\n')
    await api.printText('Payment:\n')
    for (const p of payments) {
      await api.printColumnsText([`  ${p.method || 'cash'}`, fmt(p.amount)], [24, 8], [0, 2])
    }
  }

  if (!isQuote && settings.show_change) {
    if ((record.changeOwed || 0) > 0) await api.printColumnsText(['Change owed', fmt(record.changeOwed)], [24, 8], [0, 2])
    if ((record.changeGiven || 0) > 0) await api.printColumnsText(['Change given', fmt(record.changeGiven)], [24, 8], [0, 2])
    if ((record.changeStillOwed || 0) > 0) await api.printColumnsText(['Change still owed', fmt(record.changeStillOwed)], [24, 8], [0, 2])
    if ((record.amountOwing || 0) > 0) await api.printColumnsText(['AMOUNT OWING', fmt(record.amountOwing)], [24, 8], [0, 2])
  }

  if (settings.show_footer && settings.footer_text) {
    await api.printText('-'.repeat(32) + '\n')
    await api.setAlignment(1)
    for (const l of settings.footer_text.split('\n')) await api.printText(l + '\n')
    await api.setAlignment(0)
  }

  await api.lineWrap(4)
  await api.cutPaper(1)
}

// ── Bluetooth ESC/POS ──────────────────────────────────────────────────────
async function printViaBluetooth(record, shop, settings, paperWidth) {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported on this browser/device')

  // Try to use a previously saved device first (by name match from saved_printers)
  const data = buildEscPos(record, shop, settings, paperWidth)

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
  }).catch(() =>
    // Fallback: accept all devices (some printers don't advertise the standard service)
    navigator.bluetooth.requestDevice({ acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] })
  )

  const server  = await device.gatt.connect()

  // Try the standard BT printer service UUID first
  let characteristic
  try {
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
    characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
  } catch {
    // Some printers expose a different service — try the first writable characteristic
    const services = await server.getPrimaryServices()
    for (const svc of services) {
      const chars = await svc.getCharacteristics()
      const writable = chars.find(c => c.properties.write || c.properties.writeWithoutResponse)
      if (writable) { characteristic = writable; break }
    }
  }

  if (!characteristic) throw new Error('No writable characteristic found on printer')

  // Write in 512-byte chunks (BT MTU limit)
  const CHUNK = 512
  for (let i = 0; i < data.length; i += CHUNK) {
    await characteristic.writeValueWithoutResponse(data.slice(i, i + CHUNK))
    await new Promise(r => setTimeout(r, 30)) // small gap between chunks
  }

  await device.gatt.disconnect()
}

// ── RawBT local print bridge (Android app) ────────────────────────────────
// RawBT runs a local HTTP server on the device (port 7584).
// Install from Google Play, open it, enable HTTP API, select the built-in printer.
//
// IMPORTANT: The app is served over HTTPS (Vercel), so we CANNOT use
// Content-Type: application/octet-stream — that triggers a CORS preflight
// OPTIONS request which RawBT doesn't handle, causing Chrome to block the
// request before it's ever sent. Fix: send a no-cors simple request using
// a text/plain Blob. RawBT reads the raw bytes regardless of content-type.
async function printViaRawBT(record, shop, settings, paperWidth) {
  const data = buildEscPos(record, shop, settings, paperWidth)
  // Wrap in a text/plain Blob — simple content-type = no preflight needed.
  const blob = new Blob([data], { type: 'text/plain' })
  await fetch('http://127.0.0.1:7584/rawbt', {
    method: 'POST',
    mode: 'no-cors',   // bypasses CORS; response is opaque but data is sent
    body: blob,
    signal: AbortSignal.timeout(3000),
  })
  // With no-cors the response is always opaque (status 0), but a network-level
  // error (connection refused = RawBT not running) still rejects the promise.
}

// ── Network/USB print via raw TCP socket proxy or fetch ────────────────────
async function printViaNetwork(record, shop, settings, paperWidth) {
  const printerIp = await getSetting('network_printer_ip', '')
  const printerPort = await getSetting('network_printer_port', '9100')

  if (!printerIp) throw new Error('No network printer IP configured in Settings → Printer')

  const data = buildEscPos(record, shop, settings, paperWidth)
  const b64 = btoa(String.fromCharCode(...data))

  // Attempt to reach a local print bridge (optional, see docs)
  // Falls back to showing raw ESC/POS data download
  try {
    const res = await fetch(`http://${printerIp}:${printerPort}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Printer returned HTTP ${res.status}`)
  } catch (e) {
    // Raw TCP not available from browser — download the ESC/POS file instead
    const blob = new Blob([data], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${record.ref || record.id}.bin`
    a.click()
    URL.revokeObjectURL(url)
    throw new Error('Network printer not reachable directly. ESC/POS file downloaded — send it manually via your print bridge.')
  }
}

// ── Browser fallback ───────────────────────────────────────────────────────
// Opens a Blob URL in a new tab. The receipt HTML includes an inline script
// that calls window.print() on itself — this guarantees Android Chrome prints
// the receipt tab, not the main POS window (w.print() from the parent does
// not reliably target the child window on Android Chrome).
function printViaBrowser(htmlContent) {
  return new Promise((resolve) => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 12px; padding: 8px; }
      hr, .divider { border: none; border-top: 1px dashed #000; margin: 4px 0; display: block; }
      .center { text-align: center; }
      .right  { text-align: right; }
      .bold   { font-weight: bold; }
      .flex   { display: flex; justify-content: space-between; }
      .space-y-1 > * + * { margin-top: 4px; }
      .space-y-0\\.5 > * + * { margin-top: 2px; }
      .text-gray-500, .text-gray-400 { color: #666; }
      .text-red-600  { color: #dc2626; }
      .text-amber-600 { color: #d97706; }
      .leading-tight { line-height: 1.2; }
      img.logo { max-width: 80px; max-height: 60px; object-fit: contain; display: block; }
      .mx-auto { margin-left: auto; margin-right: auto; }
      .mb-3 { margin-bottom: 8px; }
      .mb-1 { margin-bottom: 4px; }
      .mb-2 { margin-bottom: 6px; }
      .pt-1 { padding-top: 4px; }
      .border-t { border-top: 1px solid #d1d5db; }
      @media print { @page { margin: 4mm; size: 58mm auto; } }
    </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        window.addEventListener('load', function () {
          var img = document.querySelector('img');
          function doPrint() {
            window.print();
            setTimeout(function () { window.close(); }, 1000);
          }
          if (img && !img.complete) {
            var done = false;
            function once() { if (!done) { done = true; doPrint(); } }
            img.onload = once; img.onerror = once;
            setTimeout(once, 1200);
          } else {
            setTimeout(doPrint, 300);
          }
        });
      <\/script>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const w    = window.open(url, '_blank')

    // Resolve and clean up after the tab has had time to print and close
    setTimeout(() => { URL.revokeObjectURL(url); resolve() }, 6000)
    if (!w) { URL.revokeObjectURL(url); resolve() }  // popup blocked
  })
}

// ── Main entry point ───────────────────────────────────────────────────────
/**
 * printReceipt — call this from Receipt.jsx instead of window.open
 * @param {object} record   - sale/quote record from DB
 * @param {object} shop     - shop info object
 * @param {object} settings - receipt settings (show_cashier, show_vat, etc.)
 * @param {string} htmlContent - innerHTML of the receipt DOM node (for browser fallback)
 * @returns {Promise<{ok: boolean, method: string, error?: string}>}
 */
export async function printReceipt(record, shop, settings, htmlContent) {
  const printerType = await getSetting('printer_type', 'browser')
  const paperWidth  = await getSetting('paper_width', '58mm')

  // ── 1. Sunmi inner printer ───────────────────────────────────────────────
  if (printerType === 'sunmi') {
    // JSAPI only works inside a native WebView, not Chrome.
    if (hasSunmiJSAPI()) {
      try {
        await printViaSunmiJSAPI(record, shop, settings)
        return { ok: true, method: 'sunmi-jsapi' }
      } catch (e) {
        throw new Error(`Sunmi printer error: ${e.message}`)
      }
    }
    // No JSAPI (Chrome on Sunmi) — try RawBT print bridge, then browser fallback.
    try {
      await printViaRawBT(record, shop, settings, paperWidth)
      return { ok: true, method: 'rawbt' }
    } catch {
      await printViaBrowser(htmlContent)
      return { ok: true, method: 'browser' }
    }
  }

  // ── 2. Bluetooth ─────────────────────────────────────────────────────────
  if (printerType === 'bluetooth') {
    try {
      await printViaBluetooth(record, shop, settings, paperWidth)
      return { ok: true, method: 'bluetooth' }
    } catch (e) {
      if (e.message?.includes('cancelled') || e.message?.includes('chosen')) {
        return { ok: false, method: 'bluetooth', error: 'Bluetooth cancelled' }
      }
      throw e
    }
  }

  // ── 3. Network / USB ──────────────────────────────────────────────────────
  if (printerType === 'network') {
    try {
      await printViaNetwork(record, shop, settings, paperWidth)
      return { ok: true, method: 'network' }
    } catch (e) {
      throw e
    }
  }

  // ── 4. Browser (default) ──────────────────────────────────────────────────
  await printViaBrowser(htmlContent)
  return { ok: true, method: 'browser' }
}
