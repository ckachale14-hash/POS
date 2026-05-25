import React, { useState, useEffect, useMemo } from 'react'
import { Search, Printer, Send, Download, X, History, ChevronLeft, ChevronRight } from 'lucide-react'
import { db, getSetting } from '../lib/db'
import { fmt, formatDate } from '../lib/utils'
import Receipt from '../components/Receipt.jsx'
import { printReceipt as driverPrint } from '../lib/printer'

const PAGE_SIZE = 30

export default function Receipts({ user }) {
  const [records, setRecords]     = useState([])
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(0)
  const [viewRecord, setViewRecord] = useState(null)
  const [shopInfo, setShopInfo]   = useState({})
  const [printing, setPrinting]   = useState(null) // sku of currently printing row

  useEffect(() => {
    ;(async () => {
      const sn = await getSetting('shop_name')
      const st = await getSetting('shop_tagline')
      const sa = await getSetting('shop_address')
      const sp = await getSetting('shop_phones')
      const sl = await getSetting('shop_logo')
      const se = await getSetting('shop_email')
      const sw = await getSetting('shop_website')
      setShopInfo({ name: sn, tagline: st, address: sa, phones: sp?.split(','), logo: sl, email: se, website: sw })

      const all = await db.sales
        .orderBy('createdAt')
        .reverse()
        .limit(500)
        .toArray()
      setRecords(all)
    })()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter(r =>
      (r.ref || '').toLowerCase().includes(q) ||
      (r.customer || '').toLowerCase().includes(q)
    )
  }, [records, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const rows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const handleSearch = (v) => { setSearch(v); setPage(0) }

  const handleReprint = async (record) => {
    if (printing) return
    setPrinting(record.ref || record.id)
    try {
      const s = {
        show_logo: await getSetting('receipt_show_logo', true),
        show_cashier: await getSetting('receipt_show_cashier', true),
        show_vat: await getSetting('receipt_show_vat', true),
        show_payment: await getSetting('receipt_show_payment', true),
        show_change: await getSetting('receipt_show_change', true),
        show_footer: await getSetting('receipt_show_footer', true),
        show_email: await getSetting('receipt_show_email', true),
        show_website: await getSetting('receipt_show_website', true),
        footer_text: await getSetting('receipt_footer_text', 'Thank you for shopping with us!\nGoods sold are not returnable.'),
        font_size: await getSetting('receipt_font_size', 'small'),
        bold_headers: await getSetting('receipt_bold_headers', true),
        bold_totals: await getSetting('receipt_bold_totals', true),
      }
      await driverPrint(record, shopInfo, s, '')
    } catch (e) {
      alert('Print failed: ' + (e.message || e))
    } finally {
      setPrinting(null)
    }
  }

  const handleWhatsApp = async (record) => {
    const phone = (record.customerPhone || '').replace(/[\s\-().]/g, '')
    const validPhone = phone.match(/^\+?\d{7,15}$/) ? phone : ''
    const isQuote = record.type === 'quote'
    const items = (record.items || []).map(item =>
      `• ${item.name} (${item.label}) ×${item.qty} = ${fmt((item.unitPrice * item.qty) - (item.lineDiscount || 0))}`
    ).join('\n')
    const shopPhoneList = Array.isArray(shopInfo?.phones)
      ? shopInfo.phones.join(', ')
      : (shopInfo?.phones || '').split(',').filter(Boolean).join(', ')
    const text = [
      `*${shopInfo?.name || 'PortionSpot'}*`,
      shopInfo?.tagline ? `_${shopInfo.tagline}_` : '',
      shopInfo?.address || '',
      shopPhoneList || '',
      '',
      `*${isQuote ? 'QUOTATION' : 'RECEIPT'} — ${record.ref || record.id}*`,
      `Date: ${new Date(record.createdAt).toLocaleString('en-GB')}`,
      `Customer: ${record.customer || 'Walk-in'}`,
      '',
      '*Items:*',
      items,
      '',
      `Subtotal: ${fmt(record.subtotal || 0)}`,
      (record.totalDiscount || 0) > 0 ? `Discount: -${fmt(record.totalDiscount)}` : '',
      `*TOTAL: ${fmt(record.grandTotal || record.total || 0)}*`,
    ].filter(l => l !== false && l !== undefined && l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    window.open(`https://wa.me/${validPhone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const handlePdf = (record) => {
    setViewRecord({ ...record, _pdfMode: true })
  }

  return (
    <div className="page-wrap">
      <div className="section-header">
        <div>
          <h1 className="font-black text-gray-900">Receipts</h1>
          <p className="text-xs text-gray-400">{filtered.length} receipt{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by ref or customer…"
            className="input pl-9 text-sm"
          />
          {search && (
            <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {rows.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <History size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No receipts found</p>
          </div>
        )}

        {rows.map(record => {
          const isQuote = record.type === 'quote'
          const isPrinting = printing === (record.ref || record.id)
          return (
            <div
              key={record.id}
              className="card p-3 cursor-pointer hover:border-brand-200 transition"
              onClick={() => setViewRecord(record)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm truncate">{record.ref || record.id}</span>
                    {isQuote && (
                      <span className="text-[9px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded">QUOTE</span>
                    )}
                    {record.status === 'returned' && (
                      <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">RETURNED</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {record.customer || 'Walk-in'} · {formatDate(record.createdAt)}
                  </div>
                  {(record.items || []).length > 0 && (
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {(record.items || []).slice(0, 2).map(i => i.name).join(', ')}
                      {(record.items || []).length > 2 && ` +${(record.items || []).length - 2} more`}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black text-brand-600 text-sm">{fmt(record.grandTotal || record.total || 0)}</div>
                  <div className="text-[10px] text-gray-400 capitalize">{record.payMethod || ''}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleReprint(record)}
                  disabled={!!printing}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition"
                >
                  <Printer size={12} />{isPrinting ? '...' : 'Print'}
                </button>
                <button
                  onClick={() => setViewRecord(record)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition"
                >
                  <Download size={12} />PDF
                </button>
                <button
                  onClick={() => handleWhatsApp(record)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 transition"
                >
                  <Send size={12} />WhatsApp
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-3 py-3 border-t border-gray-100">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-500">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Receipt detail modal */}
      {viewRecord && (
        <Receipt
          record={viewRecord}
          shop={shopInfo}
          onClose={() => setViewRecord(null)}
          readOnly
        />
      )}
    </div>
  )
}
