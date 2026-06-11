import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SalesContextPanel from './SalesContextPanel.jsx'

const apiMocks = {
  fetchSalesContext: vi.fn(),
  searchEasyStoreProducts: vi.fn(),
}

vi.mock('../../lib/omniApi.js', () => ({
  fetchSalesContext: (...args) => apiMocks.fetchSalesContext(...args),
  searchEasyStoreProducts: (...args) => apiMocks.searchEasyStoreProducts(...args),
}))

const thread = { id: 'thread_1', customerId: 'cust_1', pageId: 'page_annalynn', platform: 'facebook' }

function salesContext() {
  return {
    ok: true,
    thread,
    customer: {
      match: { safeToUsePrivateData: true },
      memory: {},
    },
    product: {
      product: null,
      variants: [],
    },
    imagePicker: {
      images: [],
    },
  }
}

function poloVariants() {
  return [
    { id: 'v_s', productId: 'polo-woman-black', variantId: 'v_s', sku: 'poloดำS', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ S', variantTitle: 'ดำ / S', color: 'ดำ', size: 'S', imageUrl: 'https://cdn.example/polo-black.jpg', availableStock: 10, sellPrice: 590 },
    { id: 'v_m', productId: 'polo-woman-black', variantId: 'v_m', sku: 'poloดำM', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ M', variantTitle: 'ดำ / M', color: 'ดำ', size: 'M', imageUrl: 'https://cdn.example/polo-black.jpg', availableStock: 20, sellPrice: 590 },
    { id: 'v_l', productId: 'polo-woman-black', variantId: 'v_l', sku: 'poloดำL', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ L', variantTitle: 'ดำ / L', color: 'ดำ', size: 'L', imageUrl: 'https://cdn.example/polo-black.jpg', availableStock: 18, sellPrice: 590 },
    { id: 'v_xl', productId: 'polo-woman-black', variantId: 'v_xl', sku: 'poloดำXL', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ XL', variantTitle: 'ดำ / XL', color: 'ดำ', size: 'XL', imageUrl: 'https://cdn.example/polo-black.jpg', availableStock: 19, sellPrice: 590 },
  ]
}

describe('SalesContextPanel EasyStore product grouping', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    apiMocks.fetchSalesContext.mockResolvedValue(salesContext())
    apiMocks.searchEasyStoreProducts.mockResolvedValue({ ok: true, products: poloVariants() })
  })

  it('groups EasyStore variant rows into one parent product card with expandable variants', async () => {
    render(<SalesContextPanel thread={thread} onUseDraft={vi.fn()} />)

    const grid = await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })
    await waitFor(() => expect(within(grid).getAllByText('เสื้อเชิ้ตโปโลผู้หญิง')).toHaveLength(1))
    expect(within(grid).getByText('SKU แม่: poloดำ')).toBeInTheDocument()
    expect(within(grid).getByText('4 ตัวเลือก')).toBeInTheDocument()
    expect(within(grid).getByText('รวม 67 ชิ้น')).toBeInTheDocument()

    fireEvent.click(within(grid).getByRole('button', { name: /ดูตัวเลือก เสื้อเชิ้ตโปโลผู้หญิง/ }))

    expect(await within(grid).findByRole('button', { name: 'ใช้ตอบ poloดำS' })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'ใช้ตอบ poloดำXL' })).toBeInTheDocument()
  })

  it('separates products by derived parent sku even when EasyStore uses the same product id', async () => {
    apiMocks.searchEasyStoreProducts.mockResolvedValue({
      ok: true,
      products: [
        { id: 'v_black_s', productId: 'polo-woman', variantId: 'v_black_s', sku: 'poloดำS', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ S', variantTitle: 'ดำ / S', color: 'ดำ', size: 'S', imageUrl: 'https://cdn.example/polo-black.jpg', availableStock: 10, sellPrice: 590 },
        { id: 'v_black_m', productId: 'polo-woman', variantId: 'v_black_m', sku: 'poloดำM', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ M', variantTitle: 'ดำ / M', color: 'ดำ', size: 'M', imageUrl: 'https://cdn.example/polo-black.jpg', availableStock: 20, sellPrice: 590 },
        { id: 'v_navy_s', productId: 'polo-woman', variantId: 'v_navy_s', sku: 'poloน้ำเงินS', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', name: 'เสื้อเชิ้ตโปโลผู้หญิง สีน้ำเงิน S', variantTitle: 'น้ำเงิน / S', color: 'น้ำเงิน', size: 'S', imageUrl: 'https://cdn.example/polo-navy.jpg', availableStock: 8, sellPrice: 590 },
      ],
    })

    render(<SalesContextPanel thread={thread} onUseDraft={vi.fn()} />)

    const grid = await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })
    await waitFor(() => expect(within(grid).getAllByRole('gridcell')).toHaveLength(2))
    expect(within(grid).getByText('SKU แม่: poloดำ')).toBeInTheDocument()
    expect(within(grid).getByRole('gridcell', { name: /poloน้ำเงิน/ })).toBeInTheDocument()
  })

  it('pins a parent product group and keeps pinned groups at the top', async () => {
    apiMocks.searchEasyStoreProducts.mockResolvedValue({
      ok: true,
      products: [
        ...poloVariants(),
        { id: 'amd_1', productId: 'amanda', variantId: 'amd_1', sku: 'amd1', productName: 'Amanda Jumpsuit', name: 'Amanda Jumpsuit Size 1', variantTitle: 'น้ำตาล / Size 1', color: 'น้ำตาล', size: 'Size 1', imageUrl: 'https://cdn.example/amanda.jpg', availableStock: 11, sellPrice: 890 },
      ],
    })

    render(<SalesContextPanel thread={thread} onUseDraft={vi.fn()} />)
    const grid = await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })
    await waitFor(() => expect(within(grid).getAllByRole('gridcell')).toHaveLength(2))

    const amanda = within(grid).getByRole('gridcell', { name: /Amanda Jumpsuit/ })
    fireEvent.click(within(amanda).getByRole('button', { name: 'ปักหมุด Amanda Jumpsuit' }))

    expect(screen.getByText('ปักหมุดใช้บ่อย')).toBeInTheDocument()
    expect(within(grid).getAllByRole('gridcell')[0]).toHaveTextContent('Amanda Jumpsuit')
    expect(JSON.parse(localStorage.getItem('omni_pinned_easystore_products_v1'))).toContain('amanda')
  })
})
