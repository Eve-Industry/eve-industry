import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { iconFallback, typeIconUrl } from './typeIcon'

describe('typeIcon', () => {
  it('builds the image server icon url', () => {
    expect(typeIconUrl(34)).toBe('https://images.evetech.net/types/34/icon?size=32')
    expect(typeIconUrl(34, 64)).toBe('https://images.evetech.net/types/34/icon?size=64')
  })

  it('retries a failed icon as a blueprint image, then hides it', () => {
    const { container } = render(<img alt="" src={typeIconUrl(77402)} onError={iconFallback} />)
    const img = container.querySelector('img')!

    fireEvent.error(img)
    expect(img.src).toBe('https://images.evetech.net/types/77402/bp?size=32')
    expect(img.hidden).toBe(false)

    fireEvent.error(img)
    expect(img.hidden).toBe(true)
  })
})
