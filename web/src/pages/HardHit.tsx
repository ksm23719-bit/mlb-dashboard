import { useEffect, useState, useMemo } from 'react'
import { fetchJSON } from '../db'

interface Ball {
  mlb_id: number
  game_date: string
  events: string
  launch_speed: number
  launch_angle: number | null
  xwoba: number | null
  distance: number | null
  bb_type: string | null
  home_team: string
  away_team: string
  pitcher: string
}

interface HardHitData {
  updated_at: string
  date_range: { start: string; end: string }
  description: string
  balls: Ball[]
}

const EVENT_LABEL: Record<string, [string, string]> = {
  single: ['1루타', 'badge-hit'],
  double: ['2루타', 'badge-hit'],
  triple: ['3루타', 'badge-hit'],
  home_run: ['홈런', 'badge-hit'],
  walk: ['볼넷', 'badge-walk'],
  strikeout: ['삼진', 'badge-so'],
  field_out: ['범타', 'badge-out'],
  force_out: ['포스아웃', 'badge-out'],
  grounded_into_double_play: ['병살', 'badge-out'],
  sac_fly: ['희비', 'badge-out'],
}

const KOREAN_IDS = new Set([673490, 808975, 808982])

function fmt(n: number | null | undefined, dec = 1) {
  return n == null ? '-' : Number(n).toFixed(dec)
}

export default function HardHit() {
  const [data, setData] = useState<HardHitData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [minEV, setMinEV] = useState(95)

  useEffect(() => {
    fetchJSON<HardHitData>('data/hard_hit.json')
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.balls.filter((b) => b.launch_speed >= minEV)
  }, [data, minEV])

  if (error) return <div className="page"><div className="error">오류: {error}</div></div>
  if (!data) return (
    <div className="loading">
      <div>강타구 데이터 로딩 중…</div>
      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: '60%' }} /></div>
    </div>
  )

  return (
    <div className="page">
      <h1>MLB 강타구 스크리너</h1>
      <h2>기간: {data.date_range.start} ~ {data.date_range.end} · 업데이트: {data.updated_at}</h2>

      <div className="card" style={{ padding: '0.75rem 1.5rem', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem' }}>
          <span style={{ color: '#8b949e' }}>최소 타구속도</span>
          <input
            type="range" min={95} max={115} value={minEV}
            onChange={(e) => setMinEV(Number(e.target.value))}
            style={{ width: 160 }}
          />
          <span style={{ color: '#58a6ff', fontWeight: 700, fontSize: '1.1rem', minWidth: 60 }}>
            {minEV} mph
          </span>
          <span style={{ color: '#8b949e' }}>({filtered.length}개 타구)</span>
        </label>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>날짜</th>
                <th>결과</th>
                <th>타구속도</th>
                <th>발사각</th>
                <th>비거리</th>
                <th>xwOBA</th>
                <th>경기</th>
                <th>상대 투수</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => {
                const isKorean = KOREAN_IDS.has(b.mlb_id)
                const [label, cls] = EVENT_LABEL[b.events] ?? [b.events, 'badge-out']
                return (
                  <tr key={i} style={isKorean ? { background: '#1a2744' } : undefined}>
                    <td style={{ color: '#8b949e' }}>{i + 1}</td>
                    <td>{b.game_date}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td style={{ fontWeight: 700, color: '#58a6ff' }}>{b.launch_speed} mph</td>
                    <td>{b.launch_angle != null ? `${b.launch_angle}°` : '-'}</td>
                    <td>{b.distance != null ? `${Math.round(b.distance)}ft` : '-'}</td>
                    <td>{fmt(b.xwoba, 3)}</td>
                    <td style={{ color: '#8b949e', fontSize: '0.8rem' }}>
                      {b.away_team} @ {b.home_team}
                    </td>
                    <td style={{ color: '#8b949e' }}>{b.pitcher}</td>
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
