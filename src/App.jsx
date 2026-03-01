import { useEffect, useRef, useState } from 'react'
import Exam from './components/Exam'
import ManualReader from './components/ManualReader'
import Quiz from './components/Quiz'
import { DATA_URL } from './constants/app'
import { assetUrl } from './lib/assets'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState([])
  const [pages, setPages] = useState([])
  const [toc, setToc] = useState([])
  const [version, setVersion] = useState('')
  const [tab, setTab] = useState('manual')
  const quizScrollRef = useRef(null)
  const examScrollRef = useRef(null)

  useEffect(() => {
    let mounted = true
    fetch(assetUrl(DATA_URL))
      .then((res) => {
        if (!res.ok) throw new Error(`数据加载失败: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!mounted) return
        setQuestions(data.questions)
        setPages(Array.isArray(data.pages) ? data.pages : [])
        setToc(Array.isArray(data.toc) ? data.toc : [])
        setVersion(data.generatedAt || String(Date.now()))
        setLoading(false)
      })
      .catch((e) => {
        if (!mounted) return
        setLoading(false)
        setError(e?.message || '加载失败')
      })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <img className="topbar-icon" src={assetUrl('/favicon.png')} alt="应用图标" />
          <h1>宾夕法尼亚驾驶手册学习与考试</h1>
        </div>
        <div className="tabs">
          <button type="button" className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>
            手册阅读
          </button>
          <button type="button" className={tab === 'quiz' ? 'active' : ''} onClick={() => setTab('quiz')}>
            练习题库
          </button>
          <button type="button" className={tab === 'exam' ? 'active' : ''} onClick={() => setTab('exam')}>
            模拟考试
          </button>
        </div>
      </header>

      {loading && <div className="status">正在解析 PDF，请稍候...</div>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && tab === 'manual' && (
        <main className="manual-only">
          <ManualReader pages={pages} toc={toc} version={version} />
        </main>
      )}

      {!loading && !error && tab === 'quiz' && (
        <main className="quiz-page practice-page" ref={quizScrollRef}>
          <Quiz questions={questions} version={version} scrollContainerRef={quizScrollRef} />
        </main>
      )}

      {!loading && !error && tab === 'exam' && (
        <main className="quiz-page exam-page" ref={examScrollRef}>
          <Exam questions={questions} version={version} scrollContainerRef={examScrollRef} />
        </main>
      )}
    </div>
  )
}
