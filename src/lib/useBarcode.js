import { useEffect, useRef } from 'react'

// Sunmi V1s-G scanner emits chars at ~5-20 ms per char then sends Enter.
// Human fast-typing rarely goes below 60-80 ms between chars.
// Using 30 ms as the burst threshold is safe and accurate.
const BURST_MS  = 30
const MIN_CHARS = 4   // ignore codes shorter than this (most SKUs are 4+)

/**
 * Detects hardware barcode scanner input and calls onScan(code).
 *
 * Works by listening for keydown events in capture phase. Chars arriving
 * faster than BURST_MS from each other are treated as scanner output.
 * The scan completes on Enter (or after 150 ms silence).
 *
 * The callback ref pattern means the listener is never re-attached when
 * onScan changes, keeping this cheap even in frequently re-rendering parents.
 *
 * @param {(code: string) => void} onScan - called with the decoded barcode
 * @param {{ enabled?: boolean }} options
 */
export function useBarcodeScanner(onScan, { enabled = true } = {}) {
  // Always call latest onScan without re-attaching the global listener
  const cbRef  = useRef(onScan)
  cbRef.current = onScan

  const buf    = useRef([])
  const lastMs = useRef(0)
  const timer  = useRef(null)

  useEffect(() => {
    if (!enabled) return

    const flush = () => {
      const code = buf.current.join('')
      buf.current = []
      if (code.length >= MIN_CHARS) cbRef.current(code)
    }

    const onKeyDown = (e) => {
      const now = Date.now()
      const gap = now - lastMs.current

      // ── Enter terminates the scan ──
      if (e.key === 'Enter') {
        if (buf.current.length >= MIN_CHARS) {
          clearTimeout(timer.current)
          flush()
          // Don't preventDefault — if an input had focus, Enter may submit a
          // form the user intended. The scanner's Enter is a side-effect.
        } else {
          buf.current = []
        }
        return
      }

      // Only care about printable chars
      if (e.key.length !== 1) return

      lastMs.current = now

      // First char in empty buffer → start tentative scan
      if (buf.current.length === 0) {
        buf.current = [e.key]
        return
      }

      if (gap <= BURST_MS) {
        // Fast char → scanner mode, keep accumulating
        buf.current.push(e.key)
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, 150) // flush if scanner omits Enter
      } else {
        // Slow char → previous sequence was human typing, start fresh
        buf.current = [e.key]
        clearTimeout(timer.current)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      clearTimeout(timer.current)
    }
  }, [enabled])
}
