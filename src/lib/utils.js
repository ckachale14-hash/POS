export const money = (n) => `$${(Number(n) || 0).toFixed(2)}`
export const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`
export const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Round a price UP to the nearest step so change is easy to give (seller's favour).
// mode: 'none' | 'up10' | 'up25' | 'up50'. 'none' just snaps to whole cents.
export const ROUND_STEPS = { none: 0, up10: 0.10, up25: 0.25, up50: 0.50 }
export function roundUpStep(value, mode = 'none') {
  const v = Number(value) || 0
  const step = ROUND_STEPS[mode] || 0
  if (step <= 0) return round2(v)
  return round2(Math.ceil((v - 1e-9) / step) * step)
}

export function genId(prefix = 'PSM') {
  const d = new Date();
  const datePart = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${datePart}-${rand}`;
}

export const formatDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
};

export const formatDateOnly = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
};

export const DISCOUNT_THRESHOLD = 5;

export function calculateTotals(itemsOrObj = [], opts = {}) {
  let items, saleDiscountAmt, saleDiscountPct, vatEnabled, vatRate;
  if (Array.isArray(itemsOrObj)) {
    items = itemsOrObj;
    saleDiscountPct = opts.saleDiscountPct || 0;
    vatEnabled = opts.vatEnabled || false;
    vatRate = opts.vatRate || 0.15;
    saleDiscountAmt = null;
  } else {
    items = itemsOrObj.items || [];
    saleDiscountAmt = itemsOrObj.saleDiscount || 0;
    saleDiscountPct = null;
    vatEnabled = itemsOrObj.vatEnabled || false;
    vatRate = itemsOrObj.vatRate || 0.15;
  }
  const subtotal = items.reduce((sum, l) => sum + round2((l.unitPrice || 0) * (l.qty || 0)), 0);
  const lineDiscountTotal = items.reduce((sum, l) => sum + round2(l.lineDiscount || l.discount || 0), 0);
  const afterLineDiscounts = round2(subtotal - lineDiscountTotal);
  let saleDiscount;
  if (saleDiscountAmt !== null) {
    saleDiscount = round2(saleDiscountAmt);
    saleDiscountPct = afterLineDiscounts > 0 ? round2((saleDiscount / afterLineDiscounts) * 100) : 0;
  } else {
    saleDiscount = round2(afterLineDiscounts * ((saleDiscountPct || 0) / 100));
  }
  const afterSaleDiscount = round2(afterLineDiscounts - saleDiscount);
  const vatAmount = vatEnabled ? round2(afterSaleDiscount * vatRate) : 0;
  const grandTotal = round2(afterSaleDiscount + vatAmount);
  const totalDiscount = round2(lineDiscountTotal + saleDiscount);
  const discountPct = subtotal > 0 ? round2((totalDiscount / subtotal) * 100) : 0;
  return { subtotal, lineDiscountTotal, saleDiscount, saleDiscountPct, vatAmount, vatEnabled, grandTotal, totalDiscount, discountPct };
}
