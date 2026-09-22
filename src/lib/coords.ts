import type { Vec3 } from './lattice'

export interface LinearExpression {
  x: number
  y: number
  z: number
  /** Constant term. */
  c: number
}

const VARIABLES = ['x', 'y', 'z'] as const
type Variable = (typeof VARIABLES)[number]

function parseNumber(token: string): number {
  const text = token.trim()
  if (text === '' || text === '+') return 1
  if (text === '-') return -1
  const fraction = text.match(/^([+-]?\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  const value = Number(text)
  if (Number.isNaN(value)) {
    throw new Error(`无法解析数值: "${token}"`)
  }
  return value
}

/**
 * Parse a single (linear) coordinate component such as `x`, `-y`, `2x`,
 * `x+1/2`, `-x+1/2` or `1/2` into variable coefficients.
 */
export function parseLinearExpression(expression: string): LinearExpression {
  const cleaned = expression.replace(/\s+/g, '')
  const result: LinearExpression = { x: 0, y: 0, z: 0, c: 0 }
  if (cleaned === '') return result

  const terms = cleaned.match(/[+-]?[^+-]+/g)
  if (!terms) return result

  for (const term of terms) {
    const variable = VARIABLES.find((name) => term.includes(name))
    if (variable) {
      const coefficientText = term.replace(variable, '')
      const coefficient = coefficientText === '' ? 1 : parseNumber(coefficientText)
      result[variable as Variable] += coefficient
    } else {
      result.c += parseNumber(term)
    }
  }
  return result
}

export interface CoordinateValues {
  x: number
  y: number
  z: number
}

/** Evaluate a coordinate expression such as `-x+1/2` for concrete values. */
export function evaluateExpression(expression: string, values: CoordinateValues): number {
  const parsed = parseLinearExpression(expression)
  return parsed.x * values.x + parsed.y * values.y + parsed.z * values.z + parsed.c
}

/** Evaluate a full coordinate triple, e.g. `x, y+1/2, -z`. */
export function evaluateCoordinates(triple: string, values: CoordinateValues): Vec3 {
  const parts = triple.split(',')
  if (parts.length !== 3) {
    throw new Error(`坐标表达式应为三元组: "${triple}"`)
  }
  return [
    evaluateExpression(parts[0]!, values),
    evaluateExpression(parts[1]!, values),
    evaluateExpression(parts[2]!, values),
  ]
}

/** Wrap a fractional coordinate into the [0, 1) range. */
export function wrapFractional(value: number): number {
  const wrapped = value - Math.floor(value)
  return wrapped === 0 ? 0 : wrapped
}

export function wrapVec3([x, y, z]: Vec3): Vec3 {
  return [wrapFractional(x), wrapFractional(y), wrapFractional(z)]
}

/** Smallest periodic distance between two fractional coordinates. */
export function periodicDistance(a: Vec3, b: Vec3): number {
  let sum = 0
  for (let i = 0; i < 3; i++) {
    let delta = Math.abs((a[i]! - b[i]!) % 1)
    if (delta > 0.5) delta = 1 - delta
    sum += delta * delta
  }
  return Math.sqrt(sum)
}

/** Remove duplicate fractional positions (modulo lattice translations). */
export function dedupePositions(positions: Vec3[], tolerance = 1e-4): Vec3[] {
  const unique: Vec3[] = []
  for (const candidate of positions) {
    const wrapped = wrapVec3(candidate)
    const isDuplicate = unique.some((existing) => periodicDistance(existing, wrapped) < tolerance)
    if (!isDuplicate) unique.push(wrapped)
  }
  return unique
}

/** Variables that actually appear in an expression list (used to pick values). */
export function usedVariables(expressions: string[]): Set<Variable> {
  const used = new Set<Variable>()
  for (const expression of expressions) {
    for (const part of expression.split(',')) {
      const parsed = parseLinearExpression(part)
      if (parsed.x !== 0) used.add('x')
      if (parsed.y !== 0) used.add('y')
      if (parsed.z !== 0) used.add('z')
    }
  }
  return used
}
