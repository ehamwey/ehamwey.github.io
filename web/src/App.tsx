import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { parseZillowResearchCsv, type ZillowMarketDatum } from './lib/zillow'
import { readFileAsText } from './lib/files'
import { type TransitScore, coerceTransitScoreMap } from './lib/transit'
import { fetchAcs5MetroCommuteShare, scoreFromPctPublicTransit } from './lib/acs'
import { downloadJsonFile } from './lib/download'

function App() {
  const [zillowRows, setZillowRows] = useState<ZillowMarketDatum[]>([])
  const [transitByMarket, setTransitByMarket] = useState<Record<string, TransitScore>>({})
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [minTransit, setMinTransit] = useState<number>(0)
  const [maxZhvi, setMaxZhvi] = useState<number | ''>('')
  const [acsYear, setAcsYear] = useState<number>(2023)
  const [acsLoadedCount, setAcsLoadedCount] = useState<number>(0)
  const [acsMatchedCount, setAcsMatchedCount] = useState<number>(0)

  async function loadSamples() {
    setError('')
    setStatus('Loading sample Zillow + transit datasets…')
    try {
      const [zillowCsvRes, transitRes] = await Promise.all([
        fetch('./data/zillow_metro_sample.csv'),
        fetch('./data/transit_score_metro_sample.json'),
      ])

      if (!zillowCsvRes.ok) throw new Error(`Failed to load sample Zillow CSV (${zillowCsvRes.status})`)
      if (!transitRes.ok) throw new Error(`Failed to load sample transit JSON (${transitRes.status})`)

      const zillowCsv = await zillowCsvRes.text()
      const transitJson = await transitRes.json()

      const parsed = parseZillowResearchCsv(zillowCsv)
      const transitMap = coerceTransitScoreMap(transitJson)

      setZillowRows(parsed)
      setTransitByMarket(transitMap)
      setStatus(`Loaded ${parsed.length} markets from sample data.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error while loading sample data.')
      setStatus('')
    }
  }

  async function loadAcsAndGenerateTransitScores() {
    setError('')
    setStatus(`Loading ACS ${acsYear} 5-year (B08301) metro commute data…`)
    try {
      const rows = await fetchAcs5MetroCommuteShare({ year: acsYear })
      const scoreByMarket = scoreFromPctPublicTransit(rows)
      setAcsLoadedCount(Object.keys(scoreByMarket).length)

      const nextTransit: Record<string, TransitScore> = {}
      let matched = 0
      for (const z of zillowRows) {
        const score = scoreByMarket[z.market]
        if (score === undefined) continue
        matched++
        nextTransit[z.market] = { score, serviceIntensity: score }
      }
      setAcsMatchedCount(matched)
      setTransitByMarket(nextTransit)
      setStatus(`Generated transit proxy scores from ACS. Matched ${matched}/${zillowRows.length} Zillow markets.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ACS data.')
      setStatus('')
    }
  }

  useEffect(() => {
    void loadSamples()
  }, [])

  const merged = useMemo(() => {
    const rows = zillowRows.map((r) => {
      const transit = transitByMarket[r.market]
      const transitScore = transit?.score ?? null
      const valuePerTransitPoint =
        transitScore && transitScore > 0 ? Math.round((r.latestValue / transitScore) * 100) / 100 : null
      return {
        ...r,
        transitScore,
        valuePerTransitPoint,
        transitBreakdown: transit ?? null,
      }
    })

    return rows.filter((r) => {
      if ((r.transitScore ?? 0) < minTransit) return false
      if (maxZhvi !== '' && r.latestValue > maxZhvi) return false
      return true
    })
  }, [zillowRows, transitByMarket, minTransit, maxZhvi])

  const zhviDomain = useMemo(() => {
    if (merged.length === 0) return [0, 1_000_000] as const
    const max = Math.max(...merged.map((m) => m.latestValue))
    const padded = Math.ceil(max / 50_000) * 50_000
    return [0, padded] as const
  }, [merged])

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="title">Real Estate × Transit (Phase A)</div>
          <div className="subtitle">
            Static GitHub Pages prototype using Zillow Research CSVs + precomputed transit scores (no keys, no backend).
          </div>
        </div>
        <div className="headerActions">
          <button className="button" onClick={() => void loadSamples()}>
            Load sample data
          </button>
          <a className="button secondary" href="https://www.zillow.com/research/data/" target="_blank" rel="noreferrer">
            Zillow Research data
          </a>
        </div>
      </header>

      <section className="panel">
        <div className="panelTitle">Data inputs</div>
        <div className="grid">
          <div className="field">
            <label className="label">Zillow Research CSV (upload)</label>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0]
                if (!file) return
                setError('')
                setStatus(`Parsing Zillow CSV: ${file.name}…`)
                try {
                  const csv = await readFileAsText(file)
                  const parsed = parseZillowResearchCsv(csv)
                  setZillowRows(parsed)
                  setStatus(`Loaded ${parsed.length} markets from ${file.name}.`)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to parse Zillow CSV.')
                  setStatus('')
                } finally {
                  e.currentTarget.value = ''
                }
              }}
            />
            <div className="hint">
              Recommended: Zillow “Metro” dataset (ZHVI). This prototype expects a “RegionName” column plus date columns.
            </div>
          </div>

          <div className="field">
            <label className="label">Transit score (ACS proxy)</label>
            <div className="filters">
              <label className="filter">
                <span>ACS year (5-year)</span>
                <input
                  className="input"
                  type="number"
                  min={2010}
                  max={2100}
                  value={acsYear}
                  onChange={(e) => setAcsYear(Number(e.target.value))}
                />
              </label>
              <div className="filter">
                <span>&nbsp;</span>
                <button
                  className="button"
                  onClick={() => void loadAcsAndGenerateTransitScores()}
                  disabled={zillowRows.length === 0}
                  title={zillowRows.length === 0 ? 'Load a Zillow CSV first' : 'Fetch ACS and generate transit proxy scores'}
                >
                  Load ACS metros → generate scores
                </button>
              </div>
            </div>
            <div className="hint">
              Uses ACS table B08301: % commuting by public transportation (excluding taxicab), normalized to a 0–100 score.
              Loaded: {acsLoadedCount} metros. Matched to Zillow: {acsMatchedCount}.
            </div>
            <div className="hint">
              Tip: after generating scores, you can download the JSON and reuse it without re-fetching ACS.
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="button secondary"
                onClick={() =>
                  downloadJsonFile({
                    filename: `transit_scores_acs_${acsYear}.json`,
                    data: transitByMarket,
                  })
                }
                disabled={Object.keys(transitByMarket).length === 0}
              >
                Download transit score JSON
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Transit score JSON (upload)</label>
            <input
              className="input"
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0]
                if (!file) return
                setError('')
                setStatus(`Loading transit score JSON: ${file.name}…`)
                try {
                  const txt = await readFileAsText(file)
                  const json = JSON.parse(txt) as unknown
                  setTransitByMarket(coerceTransitScoreMap(json))
                  setStatus(`Loaded transit scores from ${file.name}.`)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to parse transit JSON.')
                  setStatus('')
                } finally {
                  e.currentTarget.value = ''
                }
              }}
            />
            <div className="hint">
              Format: an object keyed by market name (e.g. metro string) → score + breakdown.
            </div>
          </div>

          <div className="field">
            <label className="label">Filters</label>
            <div className="filters">
              <label className="filter">
                <span>Min transit score</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={minTransit}
                  onChange={(e) => setMinTransit(Number(e.target.value))}
                />
              </label>
              <label className="filter">
                <span>Max ZHVI ($)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={maxZhvi}
                  placeholder="(no limit)"
                  onChange={(e) => setMaxZhvi(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </label>
            </div>
            <div className="hint">Showing {merged.length} markets.</div>
          </div>
        </div>

        {(status || error) && (
          <div className="messages">
            {status && <div className="status">{status}</div>}
            {error && <div className="error">{error}</div>}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panelTitle">Transit score vs home values (latest)</div>
        <div className="chartWrap">
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ top: 16, right: 16, left: 16, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="transitScore"
                name="Transit score"
                domain={[0, 100]}
                tickCount={6}
                allowDecimals={false}
              />
              <YAxis
                type="number"
                dataKey="latestValue"
                name="ZHVI"
                domain={zhviDomain}
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => {
                  if (name === 'ZHVI') return [`$${Number(value).toLocaleString()}`, 'ZHVI (latest)']
                  if (name === 'Transit score') return [value, 'Transit score']
                  return [value, name]
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as (ZillowMarketDatum & { transitScore: number | null }) | undefined
                  return p?.market ?? ''
                }}
              />
              <Scatter name="Markets" data={merged.filter((m) => m.transitScore !== null)} fill="var(--accent)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="hint">
          Note: sample transit scores are placeholders. Phase A wiring is designed so we can drop in real precomputed scores
          later without changing the UI.
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">Market table</div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>ZHVI (latest)</th>
                <th>Latest date</th>
                <th>Transit score</th>
                <th>$ / transit point</th>
              </tr>
            </thead>
            <tbody>
              {merged
                .slice()
                .sort((a, b) => (a.valuePerTransitPoint ?? Number.POSITIVE_INFINITY) - (b.valuePerTransitPoint ?? Number.POSITIVE_INFINITY))
                .map((r) => (
                  <tr key={r.market}>
                    <td className="mono">{r.market}</td>
                    <td>${r.latestValue.toLocaleString()}</td>
                    <td className="mono">{r.latestDate}</td>
                    <td>{r.transitScore ?? '—'}</td>
                    <td>{r.valuePerTransitPoint ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App
