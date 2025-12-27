import Papa from 'papaparse'

export type ZillowMarketDatum = {
  market: string
  regionId: string | null
  sizeRank: number | null
  latestDate: string
  latestValue: number
}

function isDateColumnName(col: string): boolean {
  // Zillow Research time series columns are typically like "2024-11-30"
  return /^\d{4}-\d{2}-\d{2}$/.test(col)
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parseZillowResearchCsv(csvText: string): ZillowMarketDatum[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw new Error(`CSV parse error: ${first.message} (row ${first.row ?? '?'})`)
  }

  const rows = parsed.data
  if (!rows || rows.length === 0) return []

  const headerKeys = Object.keys(rows[0] ?? {})
  if (!headerKeys.includes('RegionName')) {
    throw new Error('CSV missing required column: "RegionName"')
  }

  const dateColumns = headerKeys.filter(isDateColumnName).sort()
  if (dateColumns.length === 0) {
    throw new Error('CSV has no date columns (expected YYYY-MM-DD columns for the time series).')
  }

  const out: ZillowMarketDatum[] = []
  for (const r of rows) {
    const market = String(r.RegionName ?? '').trim()
    if (!market) continue

    // Find latest non-empty numeric value
    let latestDate = ''
    let latestValue: number | null = null
    for (let i = dateColumns.length - 1; i >= 0; i--) {
      const d = dateColumns[i]
      const n = parseNumber(r[d])
      if (n !== null) {
        latestDate = d
        latestValue = n
        break
      }
    }
    if (!latestDate || latestValue === null) continue

    const regionId = String(r.RegionID ?? '').trim() || null
    const sizeRank = parseNumber(r.SizeRank)

    out.push({
      market,
      regionId,
      sizeRank,
      latestDate,
      latestValue,
    })
  }

  return out
}

