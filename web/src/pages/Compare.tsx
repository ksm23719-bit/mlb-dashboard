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
  players: Player[]
  date_range: { start: string; end: string }
  updated_at: string
}

function fmt(n: number | null | undefined, dec = 3) {
  if (n == null) return '-'
  if (dec === 3) return Number(n).toFixed(3).replace('0.', '.')
  return Number(n).toFixed(dec)
}

function better(a: number | null, b: number | null, higherBetter = true) {
  if (a == null || b == null) return 0
  return higherBetter ? (a > b ? 1 : a < b ? -1 : 0) : (a < b ? 1 : a > b ? -1 : 0)
}

const STATS: { key: keyof Player; label: string; dec: number; higherBetter: boolean }[] = [
  { key: 'pa',      label: '타석',       dec: 0, higherBetter: true },
  { key: 'avg',     label: '타율',       dec: 3, higherBetter: true },
  { key: 'xwoba',   label: 'xwOBA',      dec: 3, higherBetter: true },
  { key: 'xba',     label: 'xBA',        dec: 3, higherBetter: true },
  { key: 'hr',      label: 'HR',         dec: 0, higherBetter: true },
  { key: 'bb',      label: '볼넷 (BB)',  dec: 0, higherBetter: true },
  { key: 'so',      label: '삼진 (K)',   dec: 0, higherBetter: false },
  { key: 'avg_ev',  label: '평균 타구속도', dec: 1, higherBetter: true },
  { key: 'max_ev',  label: '최고 타구속도', dec: 1, higherBetter: true },
  { key: 'avg_la',  label: '평균 발사각', dec: 1, higherBetter: true },
]

function PlayerSearch({
  players, selected, onSelect, label,
}: {
  players: Player[]
  selected: Player | null
  onSelect: (p: Player | null) => void
  label: string
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    if (!q.trim()) return []
    const lq = q.toLowerCase()
    return players.filter(
      (p) => p.name_en.toLowerCase().includes(lq) || p.name_kr.includes(lq)
    ).slice(0, 8)
  }, [players, q])

  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ color: '#8b949e', fontSize: '0.8rem', marginBottom: 4 }}>{label}</div>
      {selected ? (
        <div style={{
          background: '#1c2128', border: '1px solid #58a6ff', borderRadius: 6,
          padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>
            {selected.name_en}
            {selected.name_kr && <span style={{ color: '#58a6ff', marginLeft: 6 }}>{selected.name_kr}</span>}
          </span>
          <button
            onClick={() => { onSelect(null); setQ('') }}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1rem' }}
          >×</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="선수 이름 검색..."
            style={{
              background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
              color: '#e6edf3', padding: '0.4rem 0.75rem', width: '100%', fontSize: '0.875rem',
            }}
          />
          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#161b22', border: '1px solid #30363d', borderRadius: 6, marginTop: 2,
            }}>
              {results.map((p) => (
                <div
                  key={p.mlb_id}
                  onClick={() => { onSelect(p); setQ('') }}
                  style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#1c2128')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {p.name_en}
                  {p.name_kr && <span style={{ color: '#58a6ff', marginLeft: 6, fontSize: '0.75rem' }}>{p.name_kr}</span>}
                  <span style={{ color: '#8b949e', marginLeft: 6, fontSize: '0.75rem' }}>{p.stand}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Compare() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playerA, setPlayerA] = useState<Player | null>(null)
  const [playerB, setPlayerB] = useState<Player | null>(null)

  useEffect(() => {
    fetchJSON<LeaderboardData>('data/leaderboard.json')
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <div className="page"><div className="error">오류: {error}</div></div>
  if (!data) return (
    <div className="loading">
      <div>데이터 로딩 중…</div>
      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: '60%' }} /></div>
    </div>
  )

  return (
    <div className="page">
      <h1>선수 비교</h1>
      <h2>기간: {data.date_range.start} ~ {data.date_range.end} · 업데이트: {data.updated_at}</h2>

      <div className="card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <PlayerSearch players={data.players} selected={playerA} onSelect={setPlayerA} label="선수 A" />
        <div style={{ display: 'flex', alignItems: 'center', color: '#8b949e', fontWeight: 700, padding: '1rem 0' }}>VS</div>
        <PlayerSearch players={data.players} selected={playerB} onSelect={setPlayerB} label="선수 B" />
      </div>

      {playerA && playerB ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', color: '#58a6ff' }}>
                  {playerA.name_en}
                  {playerA.name_kr && <span style={{ fontSize: '0.75rem', marginLeft: 6 }}>{playerA.name_kr}</span>}
                </th>
                <th style={{ textAlign: 'center', width: 120 }}>지표</th>
                <th style={{ textAlign: 'center', color: '#3fb950' }}>
                  {playerB.name_en}
                  {playerB.name_kr && <span style={{ fontSize: '0.75rem', marginLeft: 6 }}>{playerB.name_kr}</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {STATS.map(({ key, label, dec, higherBetter }) => {
                const va = playerA[key] as number | null
                const vb = playerB[key] as number | null
                const cmp = better(va, vb, higherBetter)
                return (
                  <tr key={key}>
                    <td style={{
                      textAlign: 'center', fontWeight: cmp > 0 ? 700 : 400,
                      color: cmp > 0 ? '#58a6ff' : undefined, fontSize: '1rem',
                    }}>
                      {dec === 0 ? (va ?? '-') : fmt(va, dec)}
                    </td>
                    <td style={{ textAlign: 'center', color: '#8b949e', fontSize: '0.8rem' }}>{label}</td>
                    <td style={{
                      textAlign: 'center', fontWeight: cmp < 0 ? 700 : 400,
                      color: cmp < 0 ? '#3fb950' : undefined, fontSize: '1rem',
                    }}>
                      {dec === 0 ? (vb ?? '-') : fmt(vb, dec)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', color: '#8b949e', padding: '2rem' }}>
          위에서 두 선수를 선택하면 스탯을 비교합니다
        </div>
      )}
    </div>
  )
}
