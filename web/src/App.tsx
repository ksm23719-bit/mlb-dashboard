import { useState } from 'react'
import Today from './pages/Today'
import './index.css'

type Page = 'today'

export default function App() {
  const [page, setPage] = useState<Page>('today')

  return (
    <>
      <nav>
        <div className="inner">
          <span className="logo">⚾ MLB×KBO 대시보드</span>
          <a
            className={page === 'today' ? 'active' : ''}
            href="#"
            onClick={(e) => { e.preventDefault(); setPage('today') }}
          >
            오늘의 한국 선수
          </a>
        </div>
      </nav>

      <div className="container">
        {page === 'today' && <Today />}
      </div>
    </>
  )
}
