import { useEffect, useMemo, useRef, useState } from 'react'

const DATA_URL = '/data/manual-static.json'
const MARK_URL = '/data/question-image-marks.json'
const PDF_URL = '/manual.pdf'
const IS_FILE_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'file:'
const FORCE_IMAGE_QUESTIONS = new Set([15, 19, 41, 44, 52, 53, 55, 56, 58, 123])
const EXAM_QUESTION_COUNT = 18
const EXAM_PASS_SCORE = 15

function assetUrl(path) {
  if (!path) return path
  if (!IS_FILE_PROTOCOL) return path
  return path.startsWith('/') ? `.${path}` : path
}

function withVersion(path, version) {
  if (!path) return path
  if (!version) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}v=${encodeURIComponent(version)}`
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0))
}

function toFixed4(n) {
  return Math.round(n * 10000) / 10000
}

function formatMark(mark) {
  if (!mark) return null
  return {
    x: toFixed4(clamp01(mark.x)),
    y: toFixed4(clamp01(mark.y)),
    w: toFixed4(Math.max(0.01, clamp01(mark.w))),
    h: toFixed4(Math.max(0.01, clamp01(mark.h)))
  }
}

function sourceImagePath(questionIndex) {
  return `/extracted/questions-source/q-${String(questionIndex).padStart(4, '0')}.jpg`
}

function PageImage({ image, enabled, version }) {
  if (!enabled || !image) return null
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

function shouldShowQuestionImage(stem) {
  if (!stem) return false
  const s = String(stem)
  const keys = ['此标志', '该标志', '这个标志', '图示', '下图', '如下图', '如图', '路标', '标牌', '形状和颜色']
  return keys.some((k) => s.includes(k))
}

function ManualPdf() {
  return (
    <section className="viewer">
      <iframe title="manual" src={assetUrl(PDF_URL)} className="pdf-frame" />
    </section>
  )
}

function MarkingTool({ questions, version }) {
  const imgRef = useRef(null)
  const previewRef = useRef(null)
  const boxRef = useRef(null)

  const candidates = useMemo(() => {
    return questions
      .map((q, idx) => ({
        index: idx + 1,
        stem: q.stem,
        show: shouldShowQuestionImage(q.stem) || !!q.image || FORCE_IMAGE_QUESTIONS.has(idx + 1)
      }))
      .filter((q) => q.show)
  }, [questions])

  const [pos, setPos] = useState(0)
  const [marks, setMarks] = useState({})
  const [jsonInput, setJsonInput] = useState('')
  const [dragStart, setDragStart] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [sourceError, setSourceError] = useState(false)

  useEffect(() => {
    fetch(assetUrl(MARK_URL))
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!data || typeof data !== 'object') return
        setMarks(data)
      })
      .catch(() => {})
  }, [])

  const current = candidates[pos] || null
  const qIndex = current?.index
  const source = qIndex ? assetUrl(withVersion(sourceImagePath(qIndex), version)) : ''

  const mark = useMemo(() => {
    if (!qIndex) return null
    return formatMark(marks[String(qIndex)])
  }, [marks, qIndex])

  const setCurrentMark = (nextMark) => {
    if (!qIndex) return
    const normalized = formatMark(nextMark)
    if (!normalized) return
    setMarks((prev) => ({ ...prev, [String(qIndex)]: normalized }))
  }

  const clearCurrentMark = () => {
    if (!qIndex) return
    setMarks((prev) => {
      const next = { ...prev }
      delete next[String(qIndex)]
      return next
    })
  }

  const onPickPoint = (e) => {
    if (!boxRef.current) return null
    const rect = boxRef.current.getBoundingClientRect()
    const x = clamp01((e.clientX - rect.left) / rect.width)
    const y = clamp01((e.clientY - rect.top) / rect.height)
    return { x, y }
  }

  const onMouseDown = (e) => {
    e.preventDefault()
    const p = onPickPoint(e)
    if (!p) return
    setDragStart(p)
    setDragging(true)
  }

  const onMouseMove = (e) => {
    if (!dragging || !dragStart) return
    const p = onPickPoint(e)
    if (!p) return
    const x = Math.min(dragStart.x, p.x)
    const y = Math.min(dragStart.y, p.y)
    const w = Math.max(0.01, Math.abs(dragStart.x - p.x))
    const h = Math.max(0.01, Math.abs(dragStart.y - p.y))
    setCurrentMark({ x, y, w, h })
  }

  const onMouseUp = () => {
    setDragging(false)
    setDragStart(null)
  }

  useEffect(() => {
    const canvas = previewRef.current
    const img = imgRef.current
    if (!canvas || !img || !mark) return
    if (!img.naturalWidth || !img.naturalHeight) return

    const sx = Math.floor(mark.x * img.naturalWidth)
    const sy = Math.floor(mark.y * img.naturalHeight)
    const sw = Math.max(1, Math.floor(mark.w * img.naturalWidth))
    const sh = Math.max(1, Math.floor(mark.h * img.naturalHeight))

    const maxW = 380
    const ratio = sw / sh
    const dw = Math.min(maxW, sw)
    const dh = Math.max(1, Math.round(dw / Math.max(0.01, ratio)))

    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)
  }, [mark, source])

  const exportJson = () => {
    const text = JSON.stringify(marks, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'question-image-marks.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyJson = async () => {
    const text = JSON.stringify(marks, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      alert('已复制 JSON 到剪贴板')
    } catch {
      alert('复制失败，请手动复制文本框内容')
    }
  }

  const importJson = () => {
    try {
      const parsed = JSON.parse(jsonInput || '{}')
      if (!parsed || typeof parsed !== 'object') throw new Error('格式错误')
      setMarks(parsed)
      alert('已导入 JSON')
    } catch {
      alert('JSON 格式错误')
    }
  }

  if (!current) {
    return <div className="quiz-page">暂无可标注题目。</div>
  }

  const showRect = mark
    ? {
        left: `${mark.x * 100}%`,
        top: `${mark.y * 100}%`,
        width: `${mark.w * 100}%`,
        height: `${mark.h * 100}%`
      }
    : null

  return (
    <main className="quiz-page mark-page" onMouseUp={onMouseUp}>
      <div className="mark-toolbar">
        <button type="button" onClick={() => setPos((p) => Math.max(0, p - 1))}>
          上一题
        </button>
        <div>
          题号 {qIndex} / {candidates[candidates.length - 1]?.index}（第 {pos + 1}/{candidates.length} 个图题）
        </div>
        <button type="button" onClick={() => setPos((p) => Math.min(candidates.length - 1, p + 1))}>
          下一题
        </button>
      </div>

      <div className="mark-stem">{current.stem}</div>

      <div
        className="mark-canvas-wrap"
        ref={boxRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imgRef}
          src={source}
          alt={`题目 ${qIndex} 原图`}
          className="mark-source"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onLoad={() => setSourceError(false)}
          onError={() => setSourceError(true)}
        />
        {showRect && <div className="mark-rect" style={showRect} />}
      </div>

      {sourceError && (
        <div className="status error">
          未找到原始题图：{sourceImagePath(qIndex)}。先运行 `swift scripts/extract_manual.swift` 生成 sources。
        </div>
      )}

      <div className="mark-controls">
        <label>
          x
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={mark?.x ?? 0.55}
            onChange={(e) => setCurrentMark({ ...(mark || {}), x: e.target.value, y: mark?.y ?? 0.05, w: mark?.w ?? 0.35, h: mark?.h ?? 0.9 })}
          />
        </label>
        <label>
          y
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={mark?.y ?? 0.05}
            onChange={(e) => setCurrentMark({ ...(mark || {}), y: e.target.value, x: mark?.x ?? 0.55, w: mark?.w ?? 0.35, h: mark?.h ?? 0.9 })}
          />
        </label>
        <label>
          w
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            value={mark?.w ?? 0.35}
            onChange={(e) => setCurrentMark({ ...(mark || {}), w: e.target.value, x: mark?.x ?? 0.55, y: mark?.y ?? 0.05, h: mark?.h ?? 0.9 })}
          />
        </label>
        <label>
          h
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            value={mark?.h ?? 0.9}
            onChange={(e) => setCurrentMark({ ...(mark || {}), h: e.target.value, x: mark?.x ?? 0.55, y: mark?.y ?? 0.05, w: mark?.w ?? 0.35 })}
          />
        </label>
        <button type="button" onClick={() => setCurrentMark({ x: 0.55, y: 0.05, w: 0.35, h: 0.9 })}>
          默认右侧
        </button>
        <button type="button" onClick={clearCurrentMark}>清除本题</button>
      </div>

      <div className="mark-preview-wrap">
        <div className="mark-preview-title">当前裁剪预览</div>
        <canvas ref={previewRef} className="mark-preview" />
      </div>

      <div className="mark-export">
        <button type="button" onClick={exportJson}>
          导出 question-image-marks.json
        </button>
        <button type="button" onClick={copyJson}>
          复制 JSON
        </button>
        <button type="button" onClick={importJson}>
          导入下方 JSON
        </button>
      </div>

      <textarea
        className="mark-json"
        placeholder="粘贴或编辑 question-image-marks.json"
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
      />
    </main>
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
        const choice = selected[q.id]
        const done = !!submitted[q.id]
        const ok = done && choice === q.correct
        const hasAnswer = !!q.correct
        const showImage = !!q.image

        return (
          <div className="question-card" key={q.id}>
            <div className="question-title">
              {index + 1}. {q.stem}
            </div>
            <PageImage image={q.image} enabled={showImage} version={version} />
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
  const eligible = useMemo(() => questions.filter((q) => !!q.correct), [questions])
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
  const passed = finished && score >= EXAM_PASS_SCORE
  const resultText = finished ? (passed ? '考试通过' : '考试未通过') : '未完成'
  const resultClass = finished ? (passed ? 'ok' : 'bad') : 'neutral'

  return (
    <div className="quiz-wrap">
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
        const showImage = !!q.image

        return (
          <div className="question-card" key={q.id}>
            <div className="question-title">
              {index + 1}. {q.stem}
            </div>
            <PageImage image={q.image} enabled={showImage} version={version} />
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
          <ManualPdf />
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

      {!loading && !error && tab === 'mark' && <MarkingTool questions={questions} version={version} />}
    </div>
  )
}
