import { useEffect, useState } from 'react'
import { fetchJSON } from '../db'

interface AtBat {
  game_date: string
  events: string
  launch_speed: number | null
  launch_angle: number | null
  xwoba: number | null
  pitcher: string
}

interface PlayerStats {
  pa: number
  hits: number
  avg_ev: number | null
  max_ev: number | null
  xwoba: number | null
}

interface Player {
  mlb_id: number
  name_kr: string
  name_en: string
  pos: string
  stats: PlayerStats
  at_bats: AtBat[]
}

interface KoreanPlayersData {
  updated_at: string
  date_range: { start: string; end: string }
  players: Player[]
}

const EVENT_LABEL: Record<string, [string, string]> = {
  single: ['1루타', 'badge-hit'],
  double: ['2루타', 'badge-hit'],
  triple: ['3루타', 'badge-hit'],
  home_run: ['홈런', 'badge-hit'],
  walk: ['볼넷', 'badge-walk'],
  intent_walk: ['고의4구', 'badge-walk'],
  strikeout: ['삼진', 'badge-so'],
  field_out: ['범타', 'badge-out'],
  force_out: ['포스아웃', 'badge-out'],
  grounded_into_double_play: ['병살타', 'badge-out'],
  sac_fly: ['희비', 'badge-out'],
}

function EventBadge({ ev }: { ev: string }) {
  const [label, cls] = EVENT_LABEL[ev] ?? [ev, 'badge-out']
  return <span className={`badge ${cls}`}>{label}</span>
}

function fmt(n: number | null | undefined, dec = 1) {
  return n == null ? '-' : Number(n).toFixed(dec)
}

export default function Today() {
  const [data, setData] = useState<KoreanPlayersData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJSON<KoreanPlayersData>('data/korean_players.json')
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <div className="page"><div className="error">오류: {error}</div></div>

  if (!data) {
    return (
      <div className="loading">
        <div>데이터 로딩 중…</div>
        <div className="progress-bar"><div className="progress-bar-fill" style={{ width: '60%' }} /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>한국 선수 최근 성적</h1>
      <h2>기간: {data.date_range.start} ~ {data.date_range.end} · 업데이트: {data.updated_at}</h2>

      {data.players.map((p) => {
        const s = p.stats
        const avg = s.pa > 0 ? (s.hits / s.pa).toFixed(3).replace('0.', '.') : '-'

        return (
          <div key={p.mlb_id} className="card">
            <h2>
              {p.name_kr}{' '}
              <small style={{ color: '#8b949e', fontWeight: 400 }}>
                {p.name_en} · {p.pos}
              </small>
            </h2>

            <div className="stat-grid">
              <div className="stat-box">
                <div className="value">{s.pa}</div>
                <div className="label">타석 (PA)</div>
              </div>
              <div className="stat-box">
                <div className="value">{avg}</div>
                <div className="label">타율 (AVG)</div>
              </div>
              <div className="stat-box">
                <div className="value">{fmt(s.xwoba, 3)}</div>
                <div className="label">xwOBA</div>
              </div>
              <div className="stat-box">
                <div className="value">{fmt(s.avg_ev)}</div>
                <div className="label">평균 타구속도</div>
              </div>
              <div className="stat-box">
                <div className="value">{fmt(s.max_ev)}</div>
                <div className="label">최고 타구속도</div>
              </div>
            </div>

            {p.at_bats.length === 0 ? (
              <p style={{ color: '#8b949e', fontSize: '0.875rem' }}>해당 기간 타석 없음</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>결과</th>
                    <th>타구속도</th>
                    <th>발사각</th>
                    <th>xwOBA</th>
                    <th>상대 투수</th>
                  </tr>
                </thead>
                <tbody>
                  {p.at_bats.map((ab, i) => (
                    <tr key={i}>
                      <td>{ab.game_date}</td>
                      <td><EventBadge ev={ab.events} /></td>
                      <td>{ab.launch_speed != null ? `${ab.launch_speed} mph` : '-'}</td>
                      <td>{ab.launch_angle != null ? `${ab.launch_angle}°` : '-'}</td>
                      <td>{fmt(ab.xwoba, 3)}</td>
                      <td style={{ color: '#8b949e' }}>{ab.pitcher}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
