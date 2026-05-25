import React, { useRef, useEffect, useState } from 'react'
import { X, Printer, Send, Download } from 'lucide-react'
import { fmt } from '../lib/utils'
import { getSetting } from '../lib/db'
import { printReceipt as driverPrint } from '../lib/printer'

export default function Receipt({ record, shop, onSendWhatsApp, onClose, readOnly = false }) {
  const printRef = useRef()
  const [settings, setSettings] = useState({
    show_logo: true, show_cashier: true, show_vat: true,
    show_payment: true, show_change: true, show_footer: true,
    show_email: true, show_website: true,
    footer_text: 'Thank you for shopping with us!\nGoods sold are not returnable.',
    same_template: true,
  })
  const [logo, setLogo] = useState(null)

  useEffect(() => {
    ;(async () => {
      const s = {}
      s.show_logo    = await getSetting('receipt_show_logo', true)
      s.show_cashier = await getSetting('receipt_show_cashier', true)
      s.show_vat     = await getSetting('receipt_show_vat', true)
      s.show_payment = await getSetting('receipt_show_payment', true)
      s.show_change  = await getSetting('receipt_show_change', true)
      s.show_footer  = await getSetting('receipt_show_footer', true)
      s.show_email   = await getSetting('receipt_show_email', true)
      s.show_website = await getSetting('receipt_show_website', true)
      s.footer_text  = await getSetting('receipt_footer_text', 'Thank you for shopping with us!\nGoods sold are not returnable.')
      s.same_template  = await getSetting('receipt_same_template', true)
      // Migrate from old font_size string if new keys not yet saved
      const oldSize = await getSetting('receipt_font_size', 'small')
      const defaultW = oldSize === 'large' ? 2 : 1
      const defaultH = oldSize === 'large' ? 2 : oldSize === 'medium' ? 2 : 1
      s.char_w         = await getSetting('receipt_char_w', defaultW)
      s.char_h         = await getSetting('receipt_char_h', defaultH)
      s.feed_lines     = await getSetting('receipt_feed_lines', 1)
      s.bold_headers   = await getSetting('receipt_bold_headers', true)
      s.bold_totals    = await getSetting('receipt_bold_totals', true)
      setSettings(s)
      const l = await getSetting('shop_logo')
      if (l) setLogo(l)
    })()
  }, [])

  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState(null)

  const doPrint = async () => {
    if (printing) return
    setPrinting(true)
    setPrintError(null)
    try {
      const htmlContent = printRef.current?.innerHTML || ''
      await driverPrint(record, shop, settings, htmlContent)
    } catch (e) {
      const msg = e.message || 'Print failed'
      setPrintError(msg)
      // Auto-clear error after 6s
      setTimeout(() => setPrintError(null), 6000)
    } finally {
      setPrinting(false)
    }
  }

  const doWhatsApp = async () => {
    if (onSendWhatsApp) { onSendWhatsApp(); return }
    const isQuote = record.type === 'quote'

    // Determine whether to use separate WhatsApp settings or the shared print settings
    const sameTemplate = await getSetting('receipt_same_template', true)
    const waShow = async (key, fallback = true) => {
      if (sameTemplate) return settings[key] ?? fallback
      return getSetting(`whatsapp_${key}`, fallback)
    }

    const showCashier  = await waShow('show_cashier')
    const showPayment  = await waShow('show_payment')
    const showChange   = await waShow('show_change')
    const showEmail    = await waShow('show_email')
    const showWebsite  = await waShow('show_website')
    const showFooter   = await waShow('show_footer')
    const showVat      = await waShow('show_vat')
    const waFooterRaw  = sameTemplate ? '' : (await getSetting('whatsapp_footer_text', '') || '')
    const footerText   = waFooterRaw.trim()
      ? waFooterRaw
      : await getSetting('receipt_footer_text', 'Thank you for shopping with us!\nGoods sold are not returnable.')

    const items = (record.items || []).map(item =>
      `• ${item.name} (${item.label}) ×${item.qty} = ${fmt((item.unitPrice * item.qty) - (item.lineDiscount || 0))}`
    ).join('\n')

    const payLines = (record.payments || []).length > 0
      ? record.payments.map(p => `  ${p.method}: ${fmt(p.amount)}`).join('\n')
      : `  ${record.payMethod || 'cash'}: ${fmt(record.amountPaid || record.grandTotal || 0)}`

    const shopPhoneList = Array.isArray(shop?.phones)
      ? shop.phones.join(', ')
      : (shop?.phones || '').split(',').filter(Boolean).join(', ')

    const text = [
      `*${shop?.name || 'PortionSpot'}*`,
      shop?.tagline ? `_${shop.tagline}_` : '',
      shop?.address || '',
      shopPhoneList || '',
      showEmail && shop?.email ? shop.email : '',
      showWebsite && shop?.website ? shop.website : '',
      '',
      `*${isQuote ? 'QUOTATION' : 'RECEIPT'} — ${record.ref || record.id}*`,
      `Date: ${new Date(record.createdAt).toLocaleString('en-GB')}`,
      `Customer: ${record.customer || 'Walk-in'}`,
      showCashier && record.cashier ? `Cashier: ${record.cashier}` : '',
      isQuote ? `Valid until: ${record.validUntil ? new Date(record.validUntil).toLocaleDateString('en-GB') : '7 days'}` : '',
      '',
      '*Items:*',
      items,
      '',
      `Subtotal: ${fmt(record.subtotal || 0)}`,
      (record.totalDiscount || 0) > 0 ? `Discount: -${fmt(record.totalDiscount)}` : '',
      showVat && record.vatEnabled ? `VAT (15%): ${fmt(record.vatAmount || 0)}` : '',
      `*TOTAL: ${fmt(record.grandTotal || record.total || 0)}*`,
      '',
      !isQuote && showPayment ? '*Payment:*' : '',
      !isQuote && showPayment ? payLines : '',
      !isQuote && showChange && (record.changeOwed || 0) > 0 ? `Change owed: ${fmt(record.changeOwed)}` : '',
      !isQuote && showChange && (record.changeStillOwed || 0) > 0 ? `Change still owed: ${fmt(record.changeStillOwed)}` : '',
      !isQuote && showChange && (record.amountOwing || 0) > 0 ? `Amount owing: ${fmt(record.amountOwing)}` : '',
      '',
      showFooter && footerText ? footerText : '',
    ].filter(l => l !== false && l !== undefined && l !== null && l !== '').join('\n').replace(/\n{3,}/g, '\n\n').trim()

    // Use saved customer phone if available (digits and + only, strip spaces/dashes)
    const rawPhone = (record.customerPhone || '').replace(/[\s\-().]/g, '')
    const phone = rawPhone.match(/^\+?\d{7,15}$/) ? rawPhone : ''
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const doPdf = () => {
    const html = printRef.current?.innerHTML || ''
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${record.ref || record.id}</title>
<style>
  body{font-family:monospace;font-size:12px;margin:0;padding:16px;max-width:320px}
  .bold{font-weight:700} .divider{border-top:1px dashed #999;margin:6px 0}
  .center{text-align:center} .flex{display:flex;justify-content:space-between}
  img.logo{max-width:120px;max-height:60px}
  @media print{@page{margin:4mm} body{padding:0}}
</style></head><body>${html}<script>window.onload=function(){window.print()}<\/script></body></html>`
    const blob = new Blob([doc], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  if (!record) return null
  const isQuote = record.type === 'quote'
  const shopPhones = Array.isArray(shop?.phones) ? shop.phones : (shop?.phones || '').split(',').filter(Boolean)
  const payments = record.payments?.length > 0 ? record.payments : [{ method: record.payMethod, amount: record.amountPaid || record.grandTotal || 0 }]

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
          <div className="font-bold text-gray-900 text-sm">
            {isQuote ? 'Quotation' : 'Receipt'} — {record.ref || record.id}
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Receipt content */}
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          <div ref={printRef} className="receipt-mono text-gray-800">
            {/* Logo */}
            {settings.show_logo && logo && (
              <div className="center mb-3">
                <img src={logo} alt="logo" className="logo mx-auto" />
              </div>
            )}

            {/* Shop header */}
            <div className="text-center mb-3">
              <div className="bold" style={{ fontSize: 13 }}>{shop?.name || 'PORTIONSPOT MOTORS'}</div>
              {shop?.tagline && <div className="text-gray-500">{shop.tagline}</div>}
              {shop?.address && <div className="text-gray-500">{shop.address}</div>}
              {shopPhones.map((p, i) => <div key={i} className="text-gray-500">{p.trim()}</div>)}
              {settings.show_email && shop?.email && <div className="text-gray-500">{shop.email}</div>}
              {settings.show_website && shop?.website && <div className="text-gray-500">{shop.website}</div>}
            </div>

            <div className="divider" />

            {/* Type + ref */}
            <div className="text-center bold mb-1" style={{ fontSize: 13 }}>
              {isQuote ? '*** QUOTATION ***' : '*** RECEIPT ***'}
            </div>
            <div className="flex justify-between text-gray-500" style={{ fontSize: 10 }}>
              <span>Ref: {record.ref || record.id}</span>
              <span>{new Date(record.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ fontSize: 10 }} className="text-gray-500">Customer: {record.customer || 'Walk-in'}</div>
            {settings.show_cashier && record.cashier && (
              <div style={{ fontSize: 10 }} className="text-gray-500">Cashier: {record.cashier}</div>
            )}
            {!isQuote && settings.show_payment && (
              <div style={{ fontSize: 10 }} className="text-gray-500">
                Payment: {payments.map(p => `${p.method || 'cash'} ${fmt(p.amount)}`).join(' + ')}
              </div>
            )}
            {isQuote && (
              <div style={{ fontSize: 10 }} className="text-gray-500">
                Valid until: {record.validUntil ? new Date(record.validUntil).toLocaleDateString('en-GB') : '7 days'}
              </div>
            )}

            <div className="divider" />

            {/* Items */}
            <div className="space-y-1 mb-2">
              {(record.items || []).map((item, i) => {
                const gross = (item.unitPrice || 0) * (item.qty || 0)
                const disc = item.lineDiscount || 0
                const net = gross - disc
                return (
                  <div key={i}>
                    <div style={{ fontSize: 11 }} className="bold leading-tight">{item.name}</div>
                    <div className="flex justify-between text-gray-500" style={{ fontSize: 10 }}>
                      <span>{item.label} ×{item.qty} @ {fmt(item.unitPrice)}</span>
                      <span className="bold">{fmt(net)}</span>
                    </div>
                    {disc > 0 && (
                      <div style={{ fontSize: 10 }} className="text-right text-red-600">disc: -{fmt(disc)}</div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="divider" />

            {/* Totals */}
            <div className="space-y-0.5" style={{ fontSize: 11 }}>
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt(record.subtotal || 0)}</span></div>
              {(record.lineDiscountTotal || 0) > 0 && (
                <div className="flex justify-between text-red-600"><span>Line discounts</span><span>-{fmt(record.lineDiscountTotal)}</span></div>
              )}
              {(record.saleDiscount || 0) > 0 && (
                <div className="flex justify-between text-red-600"><span>Sale discount</span><span>-{fmt(record.saleDiscount)}</span></div>
              )}
              {settings.show_vat && record.vatEnabled && (
                <div className="flex justify-between text-gray-500"><span>VAT (15%)</span><span>{fmt(record.vatAmount || 0)}</span></div>
              )}
              <div className="flex justify-between bold pt-1 border-t border-gray-300" style={{ fontSize: 13 }}>
                <span>TOTAL</span><span>{fmt(record.grandTotal || record.total || 0)}</span>
              </div>
            </div>

            {/* Payment details */}
            {!isQuote && settings.show_payment && payments.length > 0 && (
              <>
                <div className="divider" />
                <div style={{ fontSize: 10 }} className="space-y-0.5">
                  <div className="bold mb-1">Payment:</div>
                  {payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-gray-500">
                      <span className="capitalize">{p.method || "cash"}</span>
                      <span>{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Change / owing */}
            {!isQuote && settings.show_change && (
              <>
                {(record.changeOwed || 0) > 0 && (
                  <div className="flex justify-between bold" style={{ fontSize: 11 }}>
                    <span>Change owed</span><span>{fmt(record.changeOwed)}</span>
                  </div>
                )}
                {(record.changeGiven || 0) > 0 && (
                  <div className="flex justify-between text-gray-500" style={{ fontSize: 10 }}>
                    <span>Change given</span><span>{fmt(record.changeGiven)}</span>
                  </div>
                )}
                {(record.changeStillOwed || 0) > 0 && (
                  <div className="flex justify-between bold text-amber-600" style={{ fontSize: 11 }}>
                    <span>Change still owed</span><span>{fmt(record.changeStillOwed)}</span>
                  </div>
                )}
                {(record.amountOwing || 0) > 0 && (
                  <div className="flex justify-between bold text-red-600" style={{ fontSize: 11 }}>
                    <span>Amount owing</span><span>{fmt(record.amountOwing)}</span>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            {settings.show_footer && settings.footer_text && (
              <>
                <div className="divider" />
                <div className="text-center text-gray-400" style={{ fontSize: 10 }}>
                  {settings.footer_text.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-2 shrink-0">
          {printError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
              {printError}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={doPrint} disabled={printing} className="btn-secondary flex-1 gap-2 disabled:opacity-60">
              <Printer size={14} />{printing ? 'Printing…' : 'Print'}
            </button>
            <button onClick={doPdf} className="btn-secondary flex-1 gap-2">
              <Download size={14} />PDF
            </button>
            <button onClick={doWhatsApp} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition active:scale-95">
              <Send size={14} />WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
