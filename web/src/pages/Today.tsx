import { useEffect, useState } from 'react'
import { getDB, query } from '../db'

const PLAYERS = [
  { id: 673490, nameKr: '김하성', nameEn: 'Ha-Seong Kim', team: 'ATL', pos: 'SS' },
  { id: 808975, nameKr: '김혜성', nameEn: 'Hyeseong Kim', team: 'LAD', pos: '2B' },
  { id: 808982, nameKr: '이정후', nameEn: 'Jung Hoo Lee', team: 'SF', pos: 'CF' },
]

interface AtBat {
  game_date: string
  events: string
  launch_speed: number | null
  launch_angle: number | null
  estimated_woba_using_speedangle: number | null
  player_name: string
}

interface PlayerStats {
  pa: number
  hits: number
  avg_ev: number | null
  max_ev: number | null
  xwoba: number | null
}

function eventBadge(ev: string) {
  if (!ev) return null
  const cl =
    ev.includes('single') || ev.includes('double') || ev.includes('triple') || ev.includes('home_run')
      ? 'badge-hit'
      : ev.includes('walk') || ev.includes('intent')
      ? 'badge-walk'
      : ev.includes('strikeout')
      ? 'badge-so'
      : 'badge-out'
  const label =
    ev === 'single' ? '1루타' :
    ev === 'double' ? '2루타' :
    ev === 'triple' ? '3루타' :
    ev === 'home_run' ? '홈런' :
    ev === 'strikeout' ? '삼진' :
    ev === 'walk' ? '볼넷' :
    ev === 'field_out' ? '범타' :
    ev === 'force_out' ? '포스아웃' :
    ev === 'grounded_into_double_play' ? '병살' :
    ev === 'sac_fly' ? '희비' :
    ev
  return <span className={`badge ${cl}`}>{label}</span>
}

function fmt(n: number | null, dec = 1) {
  return n == null ? '-' : n.toFixed(dec)
}

export default function Today() {
  const [loadPct, setLoadPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [atBats, setAtBats] = useState<Record<number, AtBat[]>>({})
  const [stats, setStats] = useState<Record<number, PlayerStats>>({})
  const [dateRange, setDateRange] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoadPct(0)
        await getDB((pct) => { if (!cancelled) setLoadPct(pct) })

        // DB 기간 확인
        const [range] = await query<{ mn: string; mx: string }>(
          "SELECT MIN(game_date)::TEXT AS mn, MAX(game_date)::TEXT AS mx FROM mlb.statcast_pitches"
        )
        if (!cancelled) setDateRange(`${range.mn} ~ ${range.mx}`)

        // 선수별 타석 로드
        const absMap: Record<number, AtBat[]> = {}
        const statsMap: Record<number, PlayerStats> = {}

        for (const p of PLAYERS) {
          const rows = await query<AtBat>(`
            SELECT game_date::TEXT AS game_date, events, launch_speed, launch_angle,
                   estimated_woba_using_speedangle, player_name
            FROM mlb.statcast_pitches
            WHERE batter = ${p.id} AND events IS NOT NULL
            ORDER BY game_date DESC, at_bat_number DESC
            LIMIT 20
          `)
          absMap[p.id] = rows

          const [s] = await query<PlayerStats>(`
            SELECT
              COUNT(*) AS pa,
              COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run')) AS hits,
              AVG(launch_speed) AS avg_ev,
              MAX(launch_speed) AS max_ev,
              AVG(estimated_woba_using_speedangle) FILTER (WHERE estimated_woba_using_speedangle IS NOT NULL) AS xwoba
            FROM mlb.statcast_pitches
            WHERE batter = ${p.id} AND events IS NOT NULL
          `)
          statsMap[p.id] = s
        }

        if (!cancelled) {
          setAtBats(absMap)
          setStats(statsMap)
          setLoadPct(null)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (error) return <div className="page"><div className="error">오류: {error}</div></div>

  if (loadPct !== null) {
    return (
      <div className="loading">
        <div>MLB 데이터 로딩 중… {loadPct}%</div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${loadPct}%` }} />
        </div>
        <small>첫 로드 시 10~30초 소요</small>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>한국 선수 최근 성적</h1>
      {dateRange && <h2>기간: {dateRange}</h2>}

      {PLAYERS.map((p) => {
        const s = stats[p.id]
        const abs = atBats[p.id] ?? []
        return (
          <div key={p.id} className="card">
            <h2>
              {p.nameKr} <small style={{ color: '#8b949e', fontWeight: 400 }}>
                {p.nameEn} · {p.pos} · {p.team}
              </small>
            </h2>

            {s && (
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="value">{s.pa}</div>
                  <div className="label">타석 (PA)</div>
                </div>
                <div className="stat-box">
                  <div className="value">{s.pa > 0 ? fmt(Number(s.hits) / Number(s.pa), 3).replace('0.', '.') : '-'}</div>
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
            )}

            {abs.length === 0 ? (
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
                  {abs.map((ab, i) => (
                    <tr key={i}>
                      <td>{ab.game_date}</td>
                      <td>{eventBadge(ab.events)}</td>
                      <td>{ab.launch_speed != null ? `${ab.launch_speed} mph` : '-'}</td>
                      <td>{ab.launch_angle != null ? `${ab.launch_angle}°` : '-'}</td>
                      <td>{ab.estimated_woba_using_speedangle != null ? Number(ab.estimated_woba_using_speedangle).toFixed(3) : '-'}</td>
                      <td style={{ color: '#8b949e' }}>{ab.player_name}</td>
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
