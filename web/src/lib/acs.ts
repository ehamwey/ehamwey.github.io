export type AcsMetroCommuteRow = {
  name: string
  totalCommute: number
  publicTransitCommute: number
  pctPublicTransit: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function normalizeMetroMarketName(name: string): string {
  return name
    .trim()
    .replace(/\s+Metro Area$/i, '')
    .replace(/\s+Micro Area$/i, '')
    .trim()
}

/**
 * Fetches ACS 5-year B08301 metro commute totals + public-transit commuters.
 *
 * - B08301_001E: Total
 * - B08301_010E: Public transportation (excluding taxicab)
 *
 * Source: Census API (no key required for light usage).
 */
export async function fetchAcs5MetroCommuteShare(params: {
  year: number
  signal?: AbortSignal
}): Promise<AcsMetroCommuteRow[]> {
  const { year, signal } = params

  const url =
    `https://api.census.gov/data/${encodeURIComponent(String(year))}/acs/acs5` +
    '?get=NAME,B08301_001E,B08301_010E' +
    '&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area:*'

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`ACS request failed (${res.status})`)

  const json = (await res.json()) as unknown
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error('Unexpected ACS response format.')
  }

  const [header, ...rows] = json as string[][]
  const idxName = header.indexOf('NAME')
  const idxTotal = header.indexOf('B08301_001E')
  const idxTransit = header.indexOf('B08301_010E')
  if (idxName === -1 || idxTotal === -1 || idxTransit === -1) {
    throw new Error('Unexpected ACS response columns (missing NAME/B08301_001E/B08301_010E).')
  }

  const out: AcsMetroCommuteRow[] = []
  for (const row of rows) {
    const name = String(row[idxName] ?? '').trim()
    const total = Number(row[idxTotal])
    const transit = Number(row[idxTransit])
    if (!name) continue
    if (!Number.isFinite(total) || total <= 0) continue
    if (!Number.isFinite(transit) || transit < 0) continue
    const pct = (transit / total) * 100
    out.push({
      name,
      totalCommute: total,
      publicTransitCommute: transit,
      pctPublicTransit: pct,
    })
  }

  return out
}

/**
 * Turns ACS % commuting-by-transit into a 0–100 proxy "transit score".
 * We normalize against p95 to avoid one mega-outlier crushing the scale.
 */
export function scoreFromPctPublicTransit(rows: AcsMetroCommuteRow[]): Record<string, number> {
  const pcts = rows.map((r) => r.pctPublicTransit).filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b)
  if (pcts.length === 0) return {}

  const p95 = pcts[Math.max(0, Math.floor(pcts.length * 0.95) - 1)] ?? 0
  const denom = p95 > 0 ? p95 : Math.max(0.0001, pcts[pcts.length - 1] ?? 0.0001)

  const out: Record<string, number> = {}
  for (const r of rows) {
    const key = normalizeMetroMarketName(r.name)
    const score = clamp(Math.round((r.pctPublicTransit / denom) * 100), 0, 100)
    out[key] = score
  }
  return out
}

