import { useEffect, useMemo, useRef, useState } from 'react'

const DATA_URL = '/data/manual-static.json'
const PDF_URL = '/manual.pdf'
const IS_FILE_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'file:'
const WEB_BASE_URL = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
const IMAGE_QUESTION_IDS = [1, 2, 3, 4, 5, 6, 11, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 41, 42, 43, 44, 45, 52, 53, 55, 56, 58, 88, 98, 99, 123]
const IMAGE_QUESTION_SET = new Set(IMAGE_QUESTION_IDS)
const EXAM_QUESTION_COUNT = 18
const EXAM_PASS_SCORE = 15

function assetUrl(path) {
  if (!path) return path
  if (/^(?:https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  if (!IS_FILE_PROTOCOL) {
    const normalized = path.startsWith('/') ? path : `/${path}`
    return `${WEB_BASE_URL}${normalized}`
  }
  return path.startsWith('/') ? `.${path}` : path
}

function withVersion(path, version) {
  if (!path) return path
  if (!version) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}v=${encodeURIComponent(version)}`
}

function questionImagePath(questionIndex) {
  return `/extracted/questions/q-${String(questionIndex).padStart(4, '0')}.jpg`
}

function PageImage({ image, version }) {
  if (!image) return null
  return (
    <img
      className="question-page-img"
      src={assetUrl(withVersion(image, version))}
      alt="题目配图"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

function ManualPdf() {
  return (
    <section className="viewer">
      <iframe title="manual" src={assetUrl(PDF_URL)} className="pdf-frame" />
    </section>
  )
}

function ManualReader({ pages, toc, version }) {
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    const smallViewport = window.matchMedia?.('(max-width: 900px)').matches
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches
    return uaMobile || (smallViewport && coarsePointer)
  }, [])
  const isDesktop = !isMobile
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [imageSrc, setImageSrc] = useState('')
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [touchStart, setTouchStart] = useState(null)
  const pageScrollRef = useRef(null)

  useEffect(() => {
    if (!pages.length) return
    setPage((prev) => Math.min(Math.max(prev, 1), pages.length))
  }, [pages])

  useEffect(() => {
    if (!isMobile || !pages.length) return
    let cancelled = false
    const pdfSrc = assetUrl(withVersion(PDF_URL, version))

    setRendering(true)
    setRenderError('')
    import('./lib/pdfParser')
      .then((mod) => mod.renderPagePreview(pdfSrc, page, null, Math.max(1, zoom * 1.4)))
      .then((url) => {
        if (cancelled) return
        setImageSrc(url)
        setRendering(false)
      })
      .catch((e) => {
        if (cancelled) return
        setImageSrc('')
        setRendering(false)
        setRenderError(e?.message || '页面渲染失败')
      })

    return () => {
      cancelled = true
    }
  }, [isMobile, page, pages, version, zoom])

  const tocOptions = toc.length
    ? toc
    : pages.map((item) => ({
        title: `第 ${item.page} 页`,
        page: item.page
      }))
  const zoomLabel = `${Math.round(zoom * 100)}%`
  const canPrev = page > 1
  const canNext = page < pages.length

  if (isDesktop) return <ManualPdf />

  if (!pages.length) {
    return (
      <section className="manual-reader">
        <p className="manual-tip">手册内容暂不可用，请稍后重试。</p>
      </section>
    )
  }

  return (
    <section className="manual-reader">
      <div className="manual-toolbar">
        <select aria-label="目录跳转" value={page} onChange={(e) => setPage(Number(e.target.value))}>
          {tocOptions.map((item, idx) => (
            <option key={`${item.page}-${idx}`} value={item.page}>
              {item.title}（第 {item.page} 页）
            </option>
          ))}
        </select>
        <div className="manual-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))} disabled={zoom <= 0.8}>
            缩小
          </button>
          <span>{zoomLabel}</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.2).toFixed(1))))} disabled={zoom >= 2.4}>
            放大
          </button>
        </div>
      </div>
      <div className="manual-page-shell">
        <button
          type="button"
          aria-label="上一页"
          className="manual-nav-btn manual-nav-prev"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={!canPrev}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="下一页"
          className="manual-nav-btn manual-nav-next"
          onClick={() => setPage((p) => Math.min(pages.length, p + 1))}
          disabled={!canNext}
        >
          ›
        </button>
        <div className="manual-page-scroll">
          <div
            ref={pageScrollRef}
            className="manual-page-content"
            onTouchStart={(e) => {
              if (zoom > 1) {
                setTouchStart(null)
                return
              }
              const t = e.touches?.[0]
              if (!t) return
              setTouchStart({ x: t.clientX, y: t.clientY })
            }}
            onTouchEnd={(e) => {
              if (zoom > 1) {
                setTouchStart(null)
                return
              }
              const t = e.changedTouches?.[0]
              if (!t || !touchStart) return
              const scroller = pageScrollRef.current
              if (scroller) {
                const maxX = scroller.scrollWidth - scroller.clientWidth
                if (maxX > 0 && scroller.scrollLeft > 4 && scroller.scrollLeft < maxX - 4) {
                  setTouchStart(null)
                  return
                }
              }
              const dx = t.clientX - touchStart.x
              const dy = t.clientY - touchStart.y
              const absX = Math.abs(dx)
              const absY = Math.abs(dy)
              setTouchStart(null)
              if (absX < 60 || absY > 40 || absY >= absX * 0.6) return
              if (dx < 0 && canNext) {
                setPage((p) => Math.min(pages.length, p + 1))
              } else if (dx > 0 && canPrev) {
                setPage((p) => Math.max(1, p - 1))
              }
            }}
          >
            {rendering && <div className="manual-tip">正在渲染 PDF 页面...</div>}
            {!rendering && renderError && <div className="status error">{renderError}</div>}
            {!rendering && !renderError && imageSrc && (
              <img
                className="manual-pdf-page"
                src={imageSrc}
                alt={`手册第 ${page} 页`}
                style={{ width: `${Math.round(zoom * 100)}%` }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Quiz({ questions, version }) {
  const [selected, setSelected] = useState({})
  const [submitted, setSubmitted] = useState({})
  const optionOrder = ['A', 'B', 'C', 'D']

  const score = useMemo(() => {
    let correct = 0
    let total = 0
    for (const q of questions) {
      if (!q.correct) continue
      total += 1
      if (submitted[q.id] && selected[q.id] === q.correct) correct += 1
    }
    return { correct, total }
  }, [questions, selected, submitted])

  return (
    <div className="quiz-wrap">
      <div className="quiz-summary practice-summary">
        <div>题目总数: {questions.length}</div>
        <div>可判分题目: {score.total}</div>
        <div>
          当前得分: {score.correct}/{score.total}
        </div>
      </div>

      {questions.map((q, index) => {
        const questionNo = index + 1
        const choice = selected[q.id]
        const done = !!submitted[q.id]
        const ok = done && choice === q.correct
        const hasAnswer = !!q.correct
        const image = IMAGE_QUESTION_SET.has(questionNo) ? questionImagePath(questionNo) : null

        return (
          <div className="question-card" key={q.id}>
            <div className="question-title">
              {questionNo}. {q.stem}
            </div>
            <PageImage image={image} version={version} />
            <div className="options">
              {optionOrder
                .filter((key) => q.options[key])
                .map((key) => (
                  <label className="option" key={key}>
                    <input
                      type="radio"
                      name={q.id}
                      value={key}
                      checked={choice === key}
                      onChange={() => {
                        setSelected((s) => ({ ...s, [q.id]: key }))
                        setSubmitted((s) => ({ ...s, [q.id]: true }))
                      }}
                    />
                    <span>
                      {key}. {q.options[key]}
                    </span>
                  </label>
                ))}
            </div>

            <div className="question-actions">
              {!hasAnswer && <span className="neutral">未抽取到标准答案</span>}
              {done && hasAnswer && (
                <span className={ok ? 'ok' : 'bad'}>
                  {ok ? '回答正确' : `回答错误，正确答案: ${q.correct}`}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function pickRandomQuestions(questions, count) {
  const pool = [...questions]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

function Exam({ questions, version }) {
  const optionOrder = ['A', 'B', 'C', 'D']
  const eligible = useMemo(
    () =>
      questions
        .map((q, idx) => ({ ...q, questionNo: idx + 1 }))
        .filter((q) => !!q.correct),
    [questions]
  )
  const fireworkBursts = useMemo(
    () => [
      { x: '12%', y: '22%', hue: 18, delay: '0s' },
      { x: '28%', y: '14%', hue: 220, delay: '0.18s' },
      { x: '48%', y: '24%', hue: 145, delay: '0.36s' },
      { x: '64%', y: '16%', hue: 280, delay: '0.08s' },
      { x: '82%', y: '26%', hue: 45, delay: '0.3s' },
      { x: '38%', y: '34%', hue: 330, delay: '0.42s' },
    ],
    []
  )
  const [seed, setSeed] = useState(0)
  const [selected, setSelected] = useState({})
  const [submitted, setSubmitted] = useState({})

  const examQuestions = useMemo(() => pickRandomQuestions(eligible, EXAM_QUESTION_COUNT), [eligible, seed])

  useEffect(() => {
    setSelected({})
    setSubmitted({})
  }, [seed])

  const score = useMemo(() => {
    let correct = 0
    for (const q of examQuestions) {
      if (submitted[q.id] && selected[q.id] === q.correct) correct += 1
    }
    return correct
  }, [examQuestions, selected, submitted])

  const answered = useMemo(() => Object.values(submitted).filter(Boolean).length, [submitted])
  const finished = examQuestions.length > 0 && answered === examQuestions.length
  const passed = score >= EXAM_PASS_SCORE
  const resultText = passed ? '考试通过' : finished ? '考试未通过' : '未完成'
  const resultClass = passed ? 'ok' : finished ? 'bad' : 'neutral'

  return (
    <div className="quiz-wrap">
      {passed && (
        <div className="fireworks" aria-hidden="true">
          {fireworkBursts.map((fw, idx) => (
            <span
              key={idx}
              className="firework"
              style={{
                '--x': fw.x,
                '--y': fw.y,
                '--h': fw.hue,
                '--d': fw.delay
              }}
            />
          ))}
        </div>
      )}

      <div className="quiz-summary exam-summary">
        <div>考试题数: {examQuestions.length}</div>
        <div>
          已作答: {answered}/{examQuestions.length}
        </div>
        <div>
          当前正确: {score}/{examQuestions.length}
        </div>
        <div>通过标准: {EXAM_PASS_SCORE} 题及以上</div>
        <div>
          结果: <span className={resultClass}>{resultText}</span>
        </div>
        <button type="button" onClick={() => setSeed((v) => v + 1)}>
          重新开始
        </button>
      </div>

      {examQuestions.map((q, index) => {
        const choice = selected[q.id]
        const done = !!submitted[q.id]
        const ok = done && choice === q.correct
        const image = IMAGE_QUESTION_SET.has(q.questionNo) ? questionImagePath(q.questionNo) : null

        return (
          <div className="question-card" key={q.id}>
            <div className="question-title">
              {index + 1}. {q.stem}
            </div>
            <PageImage image={image} version={version} />
            <div className="options">
              {optionOrder
                .filter((key) => q.options[key])
                .map((key) => (
                  <label className={`option ${done ? 'locked' : ''}`} key={key}>
                    <input
                      type="radio"
                      name={`exam-${q.id}`}
                      value={key}
                      checked={choice === key}
                      disabled={done}
                      onChange={() => {
                        if (done) return
                        setSelected((s) => ({ ...s, [q.id]: key }))
                        setSubmitted((s) => ({ ...s, [q.id]: true }))
                      }}
                    />
                    <span>
                      {key}. {q.options[key]}
                    </span>
                  </label>
                ))}
            </div>

            <div className="question-actions">
              {done && (
                <span className={ok ? 'ok' : 'bad'}>
                  {ok ? '回答正确' : `回答错误，正确答案: ${q.correct}`}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState([])
  const [pages, setPages] = useState([])
  const [toc, setToc] = useState([])
  const [version, setVersion] = useState('')
  const [tab, setTab] = useState('manual')

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
          <button
            type="button"
            className={tab === 'manual' ? 'active' : ''}
            onClick={() => setTab('manual')}
          >
            手册阅读
          </button>
          <button
            type="button"
            className={tab === 'quiz' ? 'active' : ''}
            onClick={() => setTab('quiz')}
          >
            练习题库
          </button>
          <button
            type="button"
            className={tab === 'exam' ? 'active' : ''}
            onClick={() => setTab('exam')}
          >
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
        <main className="quiz-page practice-page">
          <Quiz questions={questions} version={version} />
        </main>
      )}

      {!loading && !error && tab === 'exam' && (
        <main className="quiz-page exam-page">
          <Exam questions={questions} version={version} />
        </main>
      )}
    </div>
  )
}
