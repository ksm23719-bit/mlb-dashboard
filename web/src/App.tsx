import { useState } from 'react'
import Today from './pages/Today'
import Leaderboard from './pages/Leaderboard'
import PitcherLeaderboard from './pages/PitcherLeaderboard'
import HardHit from './pages/HardHit'
import Compare from './pages/Compare'
import './index.css'

type Page = 'today' | 'leaderboard' | 'pitcher' | 'hardhit' | 'compare'

export default function App() {
  const [page, setPage] = useState<Page>('today')

  function nav(p: Page) {
    return (e: React.MouseEvent) => { e.preventDefault(); setPage(p) }
  }

  return (
    <>
      <nav>
        <div className="inner">
          <span className="logo">⚾ MLB×KBO 대시보드</span>
          <a className={page === 'today' ? 'active' : ''} href="#" onClick={nav('today')}>한국 선수</a>
          <a className={page === 'leaderboard' ? 'active' : ''} href="#" onClick={nav('leaderboard')}>타자 리더보드</a>
          <a className={page === 'pitcher' ? 'active' : ''} href="#" onClick={nav('pitcher')}>투수 리더보드</a>
          <a className={page === 'hardhit' ? 'active' : ''} href="#" onClick={nav('hardhit')}>강타구</a>
          <a className={page === 'compare' ? 'active' : ''} href="#" onClick={nav('compare')}>선수 비교</a>
        </div>
      </nav>

      <div className="container">
        {page === 'today' && <Today />}
        {page === 'leaderboard' && <Leaderboard />}
        {page === 'pitcher' && <PitcherLeaderboard />}
        {page === 'hardhit' && <HardHit />}
        {page === 'compare' && <Compare />}
      </div>
    </>
  )
}
