import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PageRail from './PageRail.jsx'

describe('PageRail', () => {
  it('uses real page profile images before falling back to initials', () => {
    render(
      <PageRail
        pages={[
          { id: 'page_annalynn', name: 'Anna Lynn', avatarUrl: 'https://cdn.example/anna.jpg' },
          { id: 'page_mankynd', name: 'MAN KYND' },
          { id: 'page_des', name: 'เพจเดส' },
        ]}
        accounts={[
          { id: 'acct_anna', pageId: 'page_annalynn', platform: 'facebook', providerAccountId: '122106446570001676' },
          { id: 'acct_mk', pageId: 'page_mankynd', platform: 'facebook', providerAccountId: '189971841184132' },
        ]}
        threads={[]}
        activePageId="all"
        onSelect={vi.fn()}
      />,
    )

    const images = screen.getAllByRole('presentation', { hidden: true })
    expect(images[0]).toHaveAttribute('src', 'https://cdn.example/anna.jpg')
    expect(images[1]).toHaveAttribute('src', 'https://graph.facebook.com/v23.0/189971841184132/picture?type=large')
    expect(images[2]).toHaveAttribute('src', 'https://graph.facebook.com/v23.0/1137894522741329/picture?type=large')
  })
})
