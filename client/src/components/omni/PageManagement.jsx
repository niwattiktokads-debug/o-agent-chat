import React from 'react'

export default function PageManagement({ pages }) {
  return (
    <section className="p-4">
      <h2 className="text-sm font-semibold text-[#24362f]">Page Management</h2>
      <p className="mt-2 rounded-xl border border-[#dfe8e4] bg-white p-3 text-xs leading-5 text-[#7a8b84] shadow-sm">{pages.length} configured pages. Add, pause, archive, and soft-delete actions come after the read-only foundation.</p>
    </section>
  )
}
