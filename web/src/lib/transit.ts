export type TransitScore = {
  score: number
  serviceIntensity?: number
  connectivity?: number
  span?: number
  destinationAccess?: number
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

export function coerceTransitScoreMap(input: unknown): Record<string, TransitScore> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Transit score JSON must be an object keyed by market name.')
  }

  const out: Record<string, TransitScore> = {}
  for (const [market, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!market.trim()) continue
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue

    const r = raw as Record<string, unknown>
    const score = toFiniteNumber(r.score)
    if (score === null) continue

    out[market] = {
      score,
      serviceIntensity: toFiniteNumber(r.serviceIntensity) ?? undefined,
      connectivity: toFiniteNumber(r.connectivity) ?? undefined,
      span: toFiniteNumber(r.span) ?? undefined,
      destinationAccess: toFiniteNumber(r.destinationAccess) ?? undefined,
    }
  }

  return out
}

