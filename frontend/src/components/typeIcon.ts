import type { SyntheticEvent } from 'react'

const IMAGE_SERVER = 'https://images.evetech.net/types'

/**
 * The EVE image server's icon for a type. It answers 400 to `/icon` for
 * blueprints, which have `/bp` instead, so pair this with `iconFallback`.
 */
export const typeIconUrl = (typeId: number, size = 32) => `${IMAGE_SERVER}/${typeId}/icon?size=${size}`

/** `onError` for a type icon: retry once as a blueprint image, then hide. */
export function iconFallback(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  if (img.src.includes('/icon?')) {
    img.src = img.src.replace('/icon?', '/bp?')
  } else {
    img.hidden = true
    img.style.display = 'none'
  }
}
