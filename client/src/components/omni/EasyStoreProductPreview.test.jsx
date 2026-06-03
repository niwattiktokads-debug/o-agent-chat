import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import EasyStoreProductPreview from './EasyStoreProductPreview.jsx'

const apiMocks = {
  fetchEasyStoreProductPreview: vi.fn(),
}

vi.mock('../../lib/omniApi.js', () => ({
  fetchEasyStoreProductPreview: (...args) => apiMocks.fetchEasyStoreProductPreview(...args),
}))

describe('EasyStoreProductPreview', () => {
  beforeEach(() => {
    apiMocks.fetchEasyStoreProductPreview.mockReset()
    window.fbq = vi.fn()
    apiMocks.fetchEasyStoreProductPreview.mockResolvedValue({
      ok: true,
      product: {
        id: '16462646',
        title: 'Amanda Jumpsuit',
        descriptionText: 'ชุดจั๊มสูทพร้อมส่ง',
        price: { amount: 890, currency: 'THB', formatted: '฿890' },
        stock: { totalQuantity: 51, status: 'in_stock' },
        images: [{ url: 'https://cdn.example/amanda.jpg', alt: 'Amanda Jumpsuit' }],
        variants: [
          { id: '76015276', sku: 'amd1', title: 'น้ำตาลBrown, Size 1', quantity: 11, price: { amount: 890, currency: 'THB', formatted: '฿890' } },
          { id: '76015277', sku: 'amd2', title: 'น้ำตาลBrown, Size 2', quantity: 40, price: { amount: 890, currency: 'THB', formatted: '฿890' } },
        ],
        links: { storefrontUrl: 'https://annalynna.easy.co/products/amanda-jumpsuit' },
      },
      tracking: { pixelId: '401272399141441' },
    })
  })

  it('shows product media, stock, variants, and fires Meta Pixel view content', async () => {
    render(<EasyStoreProductPreview productId="16462646" threadId="thread_1" />)

    expect(await screen.findByRole('heading', { name: 'Amanda Jumpsuit' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Amanda Jumpsuit' })).toHaveAttribute('src', 'https://cdn.example/amanda.jpg')
    expect(screen.getByText('฿890')).toBeInTheDocument()
    expect(screen.getByText('พร้อมส่ง 51 ชิ้น')).toBeInTheDocument()
    expect(screen.getByText('น้ำตาลBrown, Size 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ให้แอดมินช่วยสั่งในแชท' })).toHaveAttribute('href', expect.stringContaining('m.me/annalynn751'))

    await waitFor(() => expect(window.fbq).toHaveBeenCalledWith('init', '401272399141441'))
    expect(window.fbq).toHaveBeenCalledWith(
      'track',
      'ViewContent',
      expect.objectContaining({ content_ids: ['16462646'], content_name: 'Amanda Jumpsuit', value: 890, currency: 'THB' }),
      expect.any(Object),
    )
  })

  it('fires a contact pixel event when the customer taps the single chat CTA', async () => {
    render(<EasyStoreProductPreview productId="16462646" />)

    const cta = await screen.findByRole('link', { name: 'ให้แอดมินช่วยสั่งในแชท' })
    cta.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(cta)

    expect(window.fbq).toHaveBeenCalledWith(
      'track',
      'Contact',
      expect.objectContaining({ content_ids: ['16462646'], content_name: 'Amanda Jumpsuit' }),
      expect.any(Object),
    )
  })
})
