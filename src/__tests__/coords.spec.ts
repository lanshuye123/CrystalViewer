import { describe, expect, it } from 'vitest'
import {
  dedupePositions,
  evaluateCoordinates,
  evaluateExpression,
  parseLinearExpression,
  periodicDistance,
  wrapFractional,
} from '@/lib/coords'

describe('coordinate expressions', () => {
  it('parses simple variables and constants', () => {
    expect(parseLinearExpression('x')).toEqual({ x: 1, y: 0, z: 0, c: 0 })
    expect(parseLinearExpression('-x+1/2')).toEqual({ x: -1, y: 0, z: 0, c: 0.5 })
    expect(parseLinearExpression('2x')).toEqual({ x: 2, y: 0, z: 0, c: 0 })
    expect(parseLinearExpression('x-y')).toEqual({ x: 1, y: -1, z: 0, c: 0 })
  })

  it('evaluates expressions and triples', () => {
    expect(evaluateExpression('-x+1/2', { x: 0.2, y: 0, z: 0 })).toBeCloseTo(0.3)
    expect(evaluateCoordinates('x, y+1/2, -z', { x: 0.1, y: 0.2, z: 0.3 })).toEqual([
      0.1, 0.7, -0.3,
    ])
  })

  it('wraps fractional coordinates into [0, 1)', () => {
    expect(wrapFractional(-0.3)).toBeCloseTo(0.7)
    expect(wrapFractional(1.25)).toBeCloseTo(0.25)
    expect(wrapFractional(0)).toBe(0)
  })

  it('measures periodic distance and removes duplicates', () => {
    expect(periodicDistance([0, 0, 0], [0.1, 0, 0])).toBeCloseTo(0.1)
    expect(periodicDistance([0, 0, 0], [0.9, 0, 0])).toBeCloseTo(0.1)
    const unique = dedupePositions([
      [0, 0, 0],
      [0, 0, 0],
      [0.5, 0.5, 0.5],
    ])
    expect(unique).toHaveLength(2)
  })
})
