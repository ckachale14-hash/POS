import React, { useState } from 'react'
import { Database, Wifi, WifiOff, CheckCircle2, XCircle, RefreshCw, ChevronRight, Server, Globe } from 'lucide-react'
import { setSetting } from '../lib/db'
import { testConnection, initialPull, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY } from '../lib/sync'

const STEPS = ['choose', 'connect', 'loading', 'done']

export default function SetupWizard({ online, onComplete }) {
  const [step, setStep]           = useState('choose')
  const [useDefault, setUseDefault] = useState(true)
  const [customUrl, setCustomUrl] = useState('')
  const [customKey, setCustomKey] = useState('')
  const [testing, setTesting]     = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [logs, setLogs]           = useState([])
  const [error, setError]         = useState(null)

  const addLog = (msg) => setLogs(prev => [...prev, msg])

  const url = useDefault ? DEFAULT_SUPABASE_URL : customUrl.trim()
  const key = useDefault ? DEFAULT_SUPABASE_KEY : customKey.trim()

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError(null)
    const result = await testConnection(url, key)
    setTestResult(result)
    setTesting(false)
  }

  const handleConnect = async () => {
    if (!testResult?.ok) {
      // Test first if not tested
      setTesting(true)
      const result = await testConnection(url, key)
      setTesting(false)
      if (!result.ok) { setError(result.error); return }
    }
    // Save credentials
    await setSetting('supabase_url', url)
    await setSetting('supabase_key', key)
    // Start initial pull
    setStep('loading')
    setLogs([])
    try {
      await initialPull(url, key, addLog)
      setTimeout(() => setStep('done'), 800)
    } catch (e) {
      setError(e.message)
      setStep('connect')
    }
  }

  const handleSkip = async () => {
    await setSetting('setup_complete', true)
    await setSetting('setup_skipped', true)
    onComplete()
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-box" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="px-6 py-5 shrink-0" style={{ background: 'var(--brand-600)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Database size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-black text-white text-lg leading-tight">Welcome to PortionSpot</h2>
              <p className="text-red-200 text-xs">First-time setup — connect to your database</p>
            </div>
          </div>
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mt-4">
            {['Choose database', 'Connect', 'Load data'].map((s, i) => {
              const stepIdx = STEPS.indexOf(step)
              const active = i <= stepIdx - 1
              return (
                <React.Fragment key={s}>
                  <div className={`flex items-center gap-1.5 text-[11px] font-semibold transition-all ${active ? 'text-white' : 'text-white/40'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${active ? 'bg-white text-red-600' : 'bg-white/20 text-white'}`}>
                      {i + 1}
                    </div>
                    {s}
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-white/20" />}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step: Choose */}
          {step === 'choose' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">How would you like to set up this device?</p>

              {!online && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <WifiOff size={14} className="text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 font-medium">No internet connection. You can set up offline and sync later.</p>
                </div>
              )}

              {/* Default database option */}
              <button
                onClick={() => { setUseDefault(true); setTestResult(null); setError(null) }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${useDefault ? 'border-red-400 bg-red-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <Globe size={16} className="text-red-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">PortionSpot Shared Database</p>
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">Recommended</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Use the default shared database. All your devices will sync automatically. Best for most shops.</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${useDefault ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                    {useDefault && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </div>
              </button>

              {/* Custom database option */}
              <button
                onClick={() => { setUseDefault(false); setTestResult(null); setError(null) }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${!useDefault ? 'border-red-400 bg-red-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Server size={16} className="text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">Custom Supabase Database</p>
                    <p className="text-xs text-gray-500 mt-1">Connect to your own Supabase project. For advanced setups or data privacy.</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${!useDefault ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                    {!useDefault && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </div>
              </button>

              {/* Custom fields */}
              {!useDefault && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Supabase Project URL</label>
                    <input value={customUrl} onChange={e => { setCustomUrl(e.target.value); setTestResult(null) }}
                      className="input text-sm font-mono" placeholder="https://xxxx.supabase.co" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Anon Public Key</label>
                    <input value={customKey} onChange={e => { setCustomKey(e.target.value); setTestResult(null) }}
                      className="input text-sm font-mono text-[11px]" placeholder="eyJhbGciOiJIUzI1NiIs..." type="password" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Connect */}
          {step === 'connect' && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-1">Database</p>
                <p className="text-sm font-bold text-gray-900 break-all">{useDefault ? 'PortionSpot Shared Database' : url}</p>
              </div>

              {testResult && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${testResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  {testResult.ok ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <XCircle size={16} className="text-red-500 shrink-0" />}
                  <p className={`text-sm font-semibold ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {testResult.ok ? 'Connection successful!' : testResult.error}
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={handleTest} disabled={testing || !online}
                  className="btn-secondary flex-1 disabled:opacity-40">
                  {testing ? <><RefreshCw size={13} className="animate-spin" />Testing…</> : 'Test Connection'}
                </button>
                <button onClick={handleConnect} disabled={testing || !online}
                  className="btn-primary flex-1 disabled:opacity-40">
                  {testing ? <><RefreshCw size={13} className="animate-spin" />Connecting…</> : <><Database size={13} />Load Data</>}
                </button>
              </div>

              {!online && (
                <p className="text-xs text-amber-600 text-center font-medium">Connect to the internet to load data from the cloud.</p>
              )}
            </div>
          )}

          {/* Step: Loading */}
          {step === 'loading' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-4">
                <RefreshCw size={28} className="animate-spin text-red-600" />
              </div>
              <div className="bg-gray-900 rounded-xl p-4 space-y-1.5 font-mono text-xs max-h-52 overflow-y-auto">
                {logs.length === 0 && <div className="text-gray-400 animate-pulse">Starting…</div>}
                {logs.map((l, i) => (
                  <div key={i} className={l.startsWith('⚠') ? 'text-amber-400' : 'text-emerald-400'}>{l}</div>
                ))}
                <div className="text-gray-400 animate-pulse">…</div>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg">All set!</h3>
                <p className="text-sm text-gray-500 mt-1">Your device is connected and data has been loaded. The app will sync automatically every 2 minutes when online.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
          {step === 'done' ? (
            <button onClick={onComplete} className="btn-primary flex-1 py-3">
              Open PortionSpot POS <ChevronRight size={16} />
            </button>
          ) : step === 'choose' ? (
            <>
              <button onClick={handleSkip} className="text-xs text-gray-400 hover:text-gray-600 transition">
                Skip — use offline only
              </button>
              <button onClick={() => setStep('connect')} className="btn-primary">
                Next <ChevronRight size={14} />
              </button>
            </>
          ) : step === 'connect' ? (
            <>
              <button onClick={() => { setStep('choose'); setTestResult(null); setError(null) }}
                className="btn-secondary">Back</button>
              {!online && (
                <button onClick={handleSkip} className="btn-primary">
                  Continue offline <ChevronRight size={14} />
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
