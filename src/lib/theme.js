// ── Theme engine ────────────────────────────────────────────────────────────
// Customizable colors + backgrounds, applied at runtime by writing CSS custom
// properties onto <html>. The whole design system (index.css + tailwind.config)
// already reads from these variables, so changing them re-skins the entire app
// instantly with zero component changes.
//
// Persistence lives in the same settings store as everything else (Dexie +
// Supabase sync via getSetting/setSetting), so a chosen theme follows the shop
// across devices.

import { getSetting, setSetting } from './db'

// ── Color math ──────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Mix a base color toward white (amt>0) or black (amt<0) by a 0..1 ratio.
function mix(hex, target, amt) {
  const a = hexToRgb(hex)
  const b = target === 'white' ? { r: 255, g: 255, b: 255 } : { r: 17, g: 18, b: 20 }
  return rgbToHex(
    a.r + (b.r - a.r) * amt,
    a.g + (b.g - a.g) * amt,
    a.b + (b.b - a.b) * amt,
  )
}

// Build the full 50→800 ramp from a single signature hex (anchored at 500).
// Tints lean toward white; shades toward near-black so they stay rich, not muddy.
export function buildRamp(hex) {
  return {
    50:  mix(hex, 'white', 0.92),
    100: mix(hex, 'white', 0.84),
    200: mix(hex, 'white', 0.68),
    400: mix(hex, 'white', 0.26),
    500: hex,
    600: mix(hex, 'black', 0.14),
    700: mix(hex, 'black', 0.30),
    800: mix(hex, 'black', 0.42),
  }
}

export function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex)
  return `${r}, ${g}, ${b}`
}

// Relative luminance → pick readable ink on an arbitrary background.
export function readableInk(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#111827' : '#f9fafb'
}

// ── Presets ─────────────────────────────────────────────────────────────────
// Accent presets are just signature hexes; the ramp is generated from each.
// Bases are chosen deep enough that the generated 600 stop (the white-text fill)
// keeps readable contrast. The 500 you see in the swatch is the vivid version.
export const ACCENT_PRESETS = [
  { id: 'red',     name: 'Signature Red', hex: '#ff3830' },
  { id: 'crimson', name: 'Crimson',       hex: '#e11d48' },
  { id: 'rose',    name: 'Rose',          hex: '#db2777' },
  { id: 'orange',  name: 'Sunset',        hex: '#ea580c' },
  { id: 'amber',   name: 'Amber',         hex: '#d97706' },
  { id: 'gold',    name: 'Gold',          hex: '#b8860b' },
  { id: 'emerald', name: 'Emerald',       hex: '#059669' },
  { id: 'teal',    name: 'Teal',          hex: '#0d9488' },
  { id: 'blue',    name: 'Ocean',         hex: '#2563eb' },
  { id: 'navy',    name: 'Navy',          hex: '#1e3a8a' },
  { id: 'indigo',  name: 'Indigo',        hex: '#4f46e5' },
  { id: 'violet',  name: 'Violet',        hex: '#7c3aed' },
  { id: 'slate',   name: 'Graphite',      hex: '#475569' },
]

// Background presets target the app canvas (the area behind the white cards).
// All stay light or softly tinted so the dark-ink content keeps strong contrast.
// `canvas` is the painted surface; `surface0` is the solid fallback token.
export const BACKGROUND_PRESETS = [
  { id: 'cloud',  name: 'Cloud',   surface0: '#f3f4f6', canvas: '#f3f4f6' },
  { id: 'paper',  name: 'Paper',   surface0: '#ffffff', canvas: '#ffffff' },
  { id: 'sand',   name: 'Sand',    surface0: '#f5f1ea', canvas: '#f5f1ea' },
  { id: 'mist',   name: 'Mist',    surface0: '#eef1f6', canvas: '#eef1f6' },
  { id: 'sky',    name: 'Sky',     surface0: '#eef4fb', canvas: 'linear-gradient(160deg, #f3f8ff 0%, #e6eefb 100%)' },
  { id: 'mint',   name: 'Mint',    surface0: '#eef6f1', canvas: 'linear-gradient(160deg, #f1faf4 0%, #e4f1e9 100%)' },
  { id: 'dawn',   name: 'Dawn',    surface0: '#fbf1ef', canvas: 'linear-gradient(160deg, #fdf3f0 0%, #f7e8ef 100%)' },
  { id: 'dusk',   name: 'Dusk',    surface0: '#f0f0f7', canvas: 'linear-gradient(160deg, #f4f3fb 0%, #eae8f5 100%)' },
]

// Sidebar can stay on the signature dark slate or follow the chosen accent.
export const SIDEBAR_PRESETS = [
  { id: 'dark',   name: 'Graphite', desc: 'Dark neutral slate' },
  { id: 'accent', name: 'Accent',   desc: 'Tinted with your color' },
]

export const DEFAULT_THEME = {
  accent: 'red',
  accentHex: '#ff3830',
  background: 'cloud',
  sidebar: 'dark',
}

// ── Apply ───────────────────────────────────────────────────────────────────
// Writes every derived token onto <html>. Idempotent and cheap — safe to call
// on boot and on every change for a live preview.
export function applyTheme(theme = {}) {
  const t = { ...DEFAULT_THEME, ...theme }
  const root = document.documentElement
  const accentHex = t.accent === 'custom'
    ? (t.accentHex || DEFAULT_THEME.accentHex)
    : (ACCENT_PRESETS.find(p => p.id === t.accent)?.hex || DEFAULT_THEME.accentHex)

  // Brand ramp
  const ramp = buildRamp(accentHex)
  for (const [stop, val] of Object.entries(ramp)) {
    root.style.setProperty(`--brand-${stop}`, val)
  }
  // Brand rgb channels + tinted glow shadow so chips/HUD/focus rings track the accent.
  root.style.setProperty('--brand-rgb', rgbString(accentHex))
  root.style.setProperty('--shadow-red', `0 8px 20px rgba(${rgbString(accentHex)}, 0.22)`)
  root.style.setProperty('--ink-red', ramp[700])

  // Background canvas + solid fallback
  const bg = BACKGROUND_PRESETS.find(p => p.id === t.background) || BACKGROUND_PRESETS[0]
  root.style.setProperty('--surface-0', bg.surface0)
  root.style.setProperty('--app-canvas', bg.canvas)

  // Sidebar surface
  if (t.sidebar === 'accent') {
    root.style.setProperty('--nav-bg', mix(accentHex, 'black', 0.62))
    root.style.setProperty('--nav-ink', readableInk(mix(accentHex, 'black', 0.62)))
  } else {
    root.style.setProperty('--nav-bg', '#111827')
    root.style.setProperty('--nav-ink', '#f9fafb')
  }
}

// ── Load / save ─────────────────────────────────────────────────────────────
export async function getTheme() {
  return {
    accent:     await getSetting('theme_accent', DEFAULT_THEME.accent),
    accentHex:  await getSetting('theme_accent_hex', DEFAULT_THEME.accentHex),
    background: await getSetting('theme_background', DEFAULT_THEME.background),
    sidebar:    await getSetting('theme_sidebar', DEFAULT_THEME.sidebar),
  }
}

export async function saveTheme(theme) {
  await setSetting('theme_accent', theme.accent)
  await setSetting('theme_accent_hex', theme.accentHex)
  await setSetting('theme_background', theme.background)
  await setSetting('theme_sidebar', theme.sidebar)
  applyTheme(theme)
}

// Read persisted theme and apply it. Call once on app boot.
export async function loadAndApplyTheme() {
  try {
    const t = await getTheme()
    applyTheme(t)
    return t
  } catch {
    applyTheme(DEFAULT_THEME)
    return DEFAULT_THEME
  }
}
