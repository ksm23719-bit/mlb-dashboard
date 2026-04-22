import { useEffect, useState, useMemo } from 'react'
import { fetchJSON } from '../db'

interface Pitcher {
  mlb_id: number
  name_en: string
  name_kr: string
  throws: string
  bf: number
  k: number
  bb: number
  hr: number
  hits: number
  avg_velo: number | null
  max_velo: number | null
  avg_spin: number | null
  xwoba_against: number | null
  k_pct: number | null
  bb_pct: number | null
  whiff_pct: number | null
}

interface PitcherData {
  updated_at: string
  date_range: { start: string; end: string }
  min_bf: number
  pitchers: Pitcher[]
}

type SortKey = keyof Pitcher

function fmt(n: number | null | undefined, dec = 3) {
  if (n == null) return '-'
  if (dec === 3) return Number(n).toFixed(3).replace('0.', '.')
  return Number(n).toFixed(dec)
}

export default function PitcherLeaderboard() {
  const [data, setData] = useState<PitcherData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('xwoba_against')
  const [asc, setAsc] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchJSON<PitcherData>('data/pitcher_leaderboard.json')
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  const sorted = useMemo(() => {
    if (!data) return []
    let list = data.pitchers
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) => p.name_en.toLowerCase().includes(q) || p.name_kr.includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const av = a[sort] as number | null
      const bv = b[sort] as number | null
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return asc ? av - bv : bv - av
    })
  }, [data, sort, asc, search])

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc(!asc)
    else {
      setSort(key)
      // xwoba_against, bb_pct는 낮을수록 좋음 → 오름차순 기본
      setAsc(['xwoba_against', 'bb_pct'].includes(key))
    }
  }

  function Th({ k, label }: { k: SortKey; label: string }) {
    const active = sort === k
    return (
      <th
        onClick={() => toggleSort(k)}
        style={{ cursor: 'pointer', color: active ? '#58a6ff' : undefined, userSelect: 'none' }}
      >
        {label} {active ? (asc ? '↑' : '↓') : ''}
      </th>
    )
  }

  if (error) return <div className="page"><div className="error">오류: {error}</div></div>
  if (!data) return (
    <div className="loading">
      <div>투수 리더보드 로딩 중…</div>
      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: '60%' }} /></div>
    </div>
  )

  return (
    <div className="page">
      <h1>MLB 투수 리더보드</h1>
      <h2>
        기간: {data.date_range.start} ~ {data.date_range.end} ·
        최소 {data.min_bf}타자 · 업데이트: {data.updated_at}
      </h2>

      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="투수 검색 (영문 또는 한글)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
            color: '#e6edf3', padding: '0.4rem 0.75rem', width: '100%', fontSize: '0.875rem',
          }}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>투수</th>
                <th>타자</th>
                <Th k="xwoba_against" label="xwOBA허용" />
                <Th k="k_pct" label="K%" />
                <Th k="bb_pct" label="BB%" />
                <Th k="whiff_pct" label="Whiff%" />
                <th>K</th>
                <th>BB</th>
                <th>HR</th>
                <Th k="avg_velo" label="평균구속" />
                <Th k="max_velo" label="최고구속" />
                <Th k="avg_spin" label="회전수" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.mlb_id}>
                  <td style={{ color: '#8b949e' }}>{i + 1}</td>
                  <td>
                    <span>{p.name_en || `ID:${p.mlb_id}`}</span>
                    {p.name_kr && (
                      <span style={{ color: '#58a6ff', fontSize: '0.75rem', marginLeft: 6 }}>
                        {p.name_kr}
                      </span>
                    )}
                    {' '}
                    <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>{p.throws}</span>
                  </td>
                  <td>{p.bf}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(p.xwoba_against)}</td>
                  <td>{fmt(p.k_pct)}</td>
                  <td>{fmt(p.bb_pct)}</td>
                  <td>{fmt(p.whiff_pct)}</td>
                  <td>{p.k}</td>
                  <td>{p.bb}</td>
                  <td>{p.hr}</td>
                  <td>{fmt(p.avg_velo, 1)}</td>
                  <td>{fmt(p.max_velo, 1)}</td>
                  <td>{p.avg_spin != null ? `${Math.round(Number(p.avg_spin))}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
