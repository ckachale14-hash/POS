/**
 * Vercel serverless function — /api/print?d=<url-safe-base64>
 *
 * RawBT fetches this URL when the POS triggers a rawbt://v1/print?url=... scheme.
 * We decode the URL-safe base64 back to raw ESC/POS bytes and return them as a
 * binary .prn file. RawBT receives the bytes and sends them straight to the
 * thermal printer — no A4 scaling, no HTML rendering, perfect crisp output.
 *
 * URL-safe base64 uses  -  instead of  +  and  _  instead of  /  with no = padding,
 * so it is safe in query strings without needing encodeURIComponent.
 */
export default function handler(req, res) {
  const { d } = req.query

  if (!d) {
    res.status(400).send('Missing ?d= parameter')
    return
  }

  try {
    // Restore standard base64 from URL-safe base64, then decode to binary
    const standard = d.replace(/-/g, '+').replace(/_/g, '/')
    const buf = Buffer.from(standard, 'base64')

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', 'attachment; filename="receipt.prn"')
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(buf)
  } catch {
    res.status(400).send('Invalid base64 data')
  }
}
