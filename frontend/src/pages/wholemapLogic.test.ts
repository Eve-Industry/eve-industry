import { addHistory, clearHistory, getHistory, isWormholeSystem, looksLikeSignatureData, MAX_HISTORY, parseWormholeInfo } from './wholemapLogic'

describe('parseWormholeInfo', () => {
  it('reads size, lifetime and mass from the info window', () => {
    const text = 'Maximum Ship Size: Very Large\nLifetime: This wormhole is reaching the end of its natural lifetime\nMass Stability: has had its stability reduced'
    expect(parseWormholeInfo(text)).toEqual({ size: 'xlarge', life: 'critical', mass: 'destab' })
  })

  it('maps the other wordings', () => {
    expect(parseWormholeInfo('Maximum Ship Size: Large\nLifetime: more than a day\nMass Stability: stable')).toEqual({
      size: 'large',
      life: 'stable',
      mass: 'stable',
    })
    expect(parseWormholeInfo('Maximum Ship Size: Medium\nMass Stability: on the verge of collapse').mass).toBe('critical')
    expect(parseWormholeInfo('Maximum Ship Size: Small').size).toBe('small')
  })

  it('leaves fields it does not find unset', () => {
    expect(parseWormholeInfo('nothing useful here')).toEqual({})
  })
})

describe('looksLikeSignatureData', () => {
  it('accepts probe scanner rows and rejects other text', () => {
    expect(looksLikeSignatureData('ABC-123\tCosmic Signature\tData Site\t\t100%')).toBe(true)
    expect(looksLikeSignatureData('hello world')).toBe(false)
    expect(looksLikeSignatureData('ABC-123 only')).toBe(false)
    expect(looksLikeSignatureData('abc-123\ta\tb')).toBe(false)
  })
})

describe('isWormholeSystem', () => {
  it('is true for J-space ids only', () => {
    expect(isWormholeSystem(31000005)).toBe(true)
    expect(isWormholeSystem(30000142)).toBe(false)
    expect(isWormholeSystem(32000000)).toBe(false)
  })
})

describe('location history', () => {
  beforeEach(() => clearHistory())

  it('keeps the newest first and at most twenty', () => {
    for (let i = 0; i < MAX_HISTORY + 5; i++) addHistory({ id: i, name: `S${i}` })
    const list = getHistory()
    expect(list).toHaveLength(MAX_HISTORY)
    expect(list[0]?.name).toBe(`S${MAX_HISTORY + 4}`)
    clearHistory()
    expect(getHistory()).toEqual([])
  })
})
