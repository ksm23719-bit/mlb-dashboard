import { useEffect, useState, useMemo } from 'react'
import { fetchJSON } from '../db'

interface Player {
  mlb_id: number
  name_en: string
  name_kr: string
  stand: string
  pa: number
  hits: number
  hr: number
  so: number
  bb: number
  avg: number | null
  avg_ev: number | null
  max_ev: number | null
  avg_la: number | null
  xwoba: number | null
  xba: number | null
}

interface LeaderboardData {
  updated_at: string
  date_range: { start: string; end: string }
  min_pa: number
  players: Player[]
}

type SortKey = keyof Player
const KOREAN_IDS = new Set([673490, 808975, 808982])

function fmt(n: number | null | undefined, dec = 3) {
  if (n == null) return '-'
  return dec === 3 ? Number(n).toFixed(3).replace('0.', '.') : Number(n).toFixed(dec)
}

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('xwoba')
  const [asc, setAsc] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchJSON<LeaderboardData>('data/leaderboard.json')
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  const sorted = useMemo(() => {
    if (!data) return []
    let list = data.players
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
    else { setSort(key); setAsc(false) }
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
      <div>리더보드 로딩 중…</div>
      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: '60%' }} /></div>
    </div>
  )

  return (
    <div className="page">
      <h1>MLB 타자 리더보드</h1>
      <h2>
        기간: {data.date_range.start} ~ {data.date_range.end} · 최소 {data.min_pa}타석 ·{' '}
        업데이트: {data.updated_at}
      </h2>

      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="선수 검색 (영문 또는 한글)..."
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
                <th>선수</th>
                <th>타석</th>
                <Th k="xwoba" label="xwOBA" />
                <Th k="xba" label="xBA" />
                <Th k="avg" label="타율" />
                <Th k="hr" label="HR" />
                <Th k="bb" label="BB" />
                <Th k="so" label="K" />
                <Th k="avg_ev" label="평균EV" />
                <Th k="max_ev" label="최고EV" />
                <Th k="avg_la" label="발사각" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const isKorean = KOREAN_IDS.has(p.mlb_id)
                return (
                  <tr key={p.mlb_id} style={isKorean ? { background: '#1a2744' } : undefined}>
                    <td style={{ color: '#8b949e' }}>{i + 1}</td>
                    <td>
                      <span style={{ fontWeight: isKorean ? 600 : 400 }}>
                        {p.name_en || `ID:${p.mlb_id}`}
                      </span>
                      {p.name_kr && (
                        <span style={{ color: '#58a6ff', fontSize: '0.75rem', marginLeft: 6 }}>
                          {p.name_kr}
                        </span>
                      )}
                      {' '}
                      <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>
                        {p.stand}
                      </span>
                    </td>
                    <td>{p.pa}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.xwoba)}</td>
                    <td>{fmt(p.xba)}</td>
                    <td>{fmt(p.avg)}</td>
                    <td>{p.hr}</td>
                    <td>{p.bb}</td>
                    <td>{p.so}</td>
                    <td>{fmt(p.avg_ev, 1)}</td>
                    <td>{fmt(p.max_ev, 1)}</td>
                    <td>{fmt(p.avg_la, 1)}°</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
