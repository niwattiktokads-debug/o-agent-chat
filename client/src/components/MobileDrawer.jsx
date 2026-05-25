import React, { useEffect } from 'react'

export default function MobileDrawer({ open, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        className={`fixed left-0 top-0 z-40 h-full w-80 max-w-[85vw] bg-slate-900 shadow-xl transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-3 top-3 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          ✕
        </button>
        {children}
      </div>
    </>
  )
}
