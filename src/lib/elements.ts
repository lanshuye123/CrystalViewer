/** Minimal element styling table (CPK-inspired). */
export interface ElementStyle {
  color: string
  radius: number
}

export const ELEMENT_STYLES: Record<string, ElementStyle> = {
  X: { color: '#6ec6ff', radius: 0.6 },
  H: { color: '#ffffff', radius: 0.31 },
  C: { color: '#4d4d4d', radius: 0.76 },
  N: { color: '#3b5bff', radius: 0.71 },
  O: { color: '#ff2f2f', radius: 0.66 },
  F: { color: '#8fe04a', radius: 0.57 },
  Na: { color: '#ab5cf2', radius: 1.66 },
  Mg: { color: '#8aff00', radius: 1.41 },
  Al: { color: '#bfa6a6', radius: 1.21 },
  Si: { color: '#f0c8a0', radius: 1.11 },
  S: { color: '#ffd93b', radius: 1.05 },
  Cl: { color: '#43dd2b', radius: 1.02 },
  K: { color: '#8f40d4', radius: 2.03 },
  Ca: { color: '#3dff00', radius: 1.97 },
  Ti: { color: '#bfc2c7', radius: 1.6 },
  Fe: { color: '#e06633', radius: 1.32 },
  Cu: { color: '#c88033', radius: 1.32 },
  Zn: { color: '#7d80b0', radius: 1.22 },
}

const FALLBACK: ElementStyle = { color: '#b0b0b0', radius: 0.8 }

export function elementStyle(element: string): ElementStyle {
  return ELEMENT_STYLES[element] ?? FALLBACK
}
