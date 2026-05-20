import React, { useState } from 'react';
import { getAllUsers } from '../lib/db';
import { Shield, X } from 'lucide-react';

export default function PinDialog({ reason, onCancel, onApprove }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const onKey = async (k) => {
    if (k === 'C') { setPin(''); setError(''); return; }
    if (k === '←') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const newPin = pin + k;
    setPin(newPin);
    if (newPin.length === 4) {
      const users = await getAllUsers();
      const manager = users.find(u => u.pin === newPin && (u.role === 'manager' || u.role === 'admin'));
      if (manager) {
        onApprove(manager);
      } else {
        setError('Invalid manager PIN');
        setTimeout(() => { setPin(''); setError(''); }, 1200);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-xs shadow-modal animate-scale-in">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
            <Shield size={18} className="text-amber-700" />
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm">Manager Approval</div>
            <div className="text-xs text-gray-500 mt-0.5">{reason}</div>
          </div>
        </div>

        <div className="p-4">
          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-5">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pin.length > i ? 'bg-brand-600 border-brand-600 scale-110' : 'border-gray-300'}`} />
            ))}
          </div>

          {error && <div className="text-center text-xs text-red-600 font-medium mb-3 animate-pulse">{error}</div>}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','C','0','←'].map(k => (
              <button key={k} onClick={() => onKey(k)}
                className={`h-12 rounded-xl font-semibold text-lg transition active:scale-95 ${k==='C'||k==='←'?'bg-gray-100 text-gray-600 hover:bg-gray-200':'bg-gray-50 text-gray-900 hover:bg-gray-100 border border-gray-200'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-4">
          <button onClick={onCancel} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}
