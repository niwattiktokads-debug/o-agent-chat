import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useResponsive.js'

describe('useIsMobile', () => {
  beforeEach(() => {
    window.innerWidth = 1024
    window.dispatchEvent(new Event('resize'))
  })

  it('returns false on desktop width', () => {
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns true when resized below 768', () => {
    const { result } = renderHook(() => useIsMobile())
    act(() => {
      window.innerWidth = 500
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(true)
  })
})
