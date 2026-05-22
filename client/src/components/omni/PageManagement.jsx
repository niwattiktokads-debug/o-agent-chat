import React from 'react'

export default function PageManagement({ pages }) {
  return (
    <section className="p-4">
      <h2 className="text-sm font-semibold">Page Management</h2>
      <p className="mt-2 text-xs text-slate-500">{pages.length} configured pages. Add, pause, archive, and soft-delete actions come after the read-only foundation.</p>
    </section>
  )
}
