import React, { useState, useEffect } from 'react'
import { getAllUsers, getSetting } from '../lib/db'
import { Wifi, WifiOff, ChevronLeft } from 'lucide-react'

export default function Login({ onLogin, online }) {
  const [users, setUsers]           = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [pin, setPin]               = useState('')
  const [error, setError]           = useState('')
  const [shake, setShake]           = useState(false)
  const [logo, setLogo]             = useState(null)
  const [shopName, setShopName]     = useState('PortionSpot Motors')

  useEffect(() => {
    ;(async () => {
      const u = await getAllUsers()
      setUsers(u)
      const l = await getSetting('shop_logo')
      if (l) setLogo(l)
      const n = await getSetting('shop_name')
      if (n) setShopName(n)
    })()
  }, [])

  const tryLogin = (user, enteredPin) => {
    if (user.pin === enteredPin) {
      onLogin(user)
    } else {
      setError('Incorrect PIN')
      setShake(true)
      setPin('')
      setTimeout(() => { setError(''); setShake(false) }, 1500)
    }
  }

  const onKey = (k) => {
    if (k === 'C') { setPin(''); return }
    if (k === 'back') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const newPin = pin + k
    setPin(newPin)
    if (newPin.length === 4 && selectedUser) {
      setTimeout(() => tryLogin(selectedUser, newPin), 100)
    }
  }

  const roleColor = r =>
    r === 'admin'   ? 'bg-red-100 text-red-700' :
    r === 'manager' ? 'bg-accent-100 text-accent-700' : 'bg-gray-100 text-gray-600'

  const KEYS = ['1','2','3','4','5','6','7','8','9','C','0','back']

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header — uses clamp so it's compact on desktop, taller on small phones */}
      <div className="bg-brand-600 text-white px-6 shrink-0"
        style={{ paddingTop: 'clamp(1rem, 3.5vh, 2.5rem)', paddingBottom: 'clamp(1rem, 3.5vh, 2.5rem)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {logo ? (
              <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/20 flex items-center justify-center">
                <img src={logo} alt="logo" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="bg-white/20 rounded-xl px-3 py-1.5 font-black text-sm">PSM</div>
            )}
          </div>
          <div className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 font-semibold ${online ? 'bg-white/20' : 'bg-amber-400/30'}`}>
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? 'Online' : 'Offline'}
          </div>
        </div>
        <h1 className="text-xl font-black tracking-tight">{shopName}</h1>
        <p className="text-red-200 text-sm">Point of Sale</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedUser ? (
          /* User grid — responsive, shows all users */
          <div className="p-5">
            <h2 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">Select User</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
              {users.map(u => (
                <button key={u.id}
                  onClick={() => { setSelectedUser(u); setPin(''); setError('') }}
                  className="card p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-95"
                >
                  <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-black text-xl mb-3 uppercase">
                    {u.name?.[0]}
                  </div>
                  <div className="font-bold text-gray-900 text-sm leading-tight truncate">{u.name}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize mt-1.5 inline-block ${roleColor(u.role)}`}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* PIN entry */
          <div className="p-5 flex flex-col items-center">
            <div className="w-full max-w-xs mx-auto">
              <button
                onClick={() => { setSelectedUser(null); setPin(''); setError('') }}
                className="flex items-center gap-1 text-sm text-gray-400 mb-4 hover:text-gray-700 transition"
              >
                <ChevronLeft size={16} />Back
              </button>

              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center font-black text-2xl mx-auto mb-2 uppercase">
                  {selectedUser.name?.[0]}
                </div>
                <div className="font-bold text-gray-900">{selectedUser.name}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize mt-1 inline-block ${roleColor(selectedUser.role)}`}>
                  {selectedUser.role}
                </span>
              </div>

              <div className={`flex justify-center gap-4 mb-3 ${shake ? 'animate-pulse' : ''}`}>
                {[0,1,2,3].map(i => (
                  <div key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                      pin.length > i ? 'bg-red-600 border-red-600 scale-125' : 'border-gray-300'
                    }`}
                  />
                ))}
              </div>

              {error && <p className="text-center text-sm text-red-600 font-bold mb-3">{error}</p>}

              <div className="grid grid-cols-3 gap-2.5 mx-auto" style={{ maxWidth: '230px' }}>
                {KEYS.map(k => (
                  <button key={k} onClick={() => onKey(k)}
                    className={`h-14 rounded-2xl font-bold text-xl transition-all active:scale-90 ${
                      k === 'C' || k === 'back'
                        ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-red-300 shadow-sm'
                    }`}
                  >
                    {k === 'back' ? '←' : k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
