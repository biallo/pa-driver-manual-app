import { useEffect, useMemo, useRef, useState } from 'react'
import { IMAGE_QUESTION_SET, STORAGE_KEYS } from '../constants/app'
import { questionImagePath } from '../lib/assets'
import { pickByAllowedKeys, readStoredJson, saveStoredJson } from '../lib/storage'
import PageImage from './common/PageImage'

export default function Quiz({ questions, version, scrollContainerRef }) {
  const [selected, setSelected] = useState(() => {
    const saved = readStoredJson(STORAGE_KEYS.quiz, {})
    return saved.selected && typeof saved.selected === 'object' ? saved.selected : {}
  })
  const [submitted, setSubmitted] = useState(() => {
    const saved = readStoredJson(STORAGE_KEYS.quiz, {})
    return saved.submitted && typeof saved.submitted === 'object' ? saved.submitted : {}
  })
  const restoredScrollRef = useRef(false)
  const optionOrder = ['A', 'B', 'C', 'D']

  useEffect(() => {
    const allowedIds = new Set(questions.map((q) => String(q.id)))
    setSelected((prev) => pickByAllowedKeys(prev, allowedIds))
    setSubmitted((prev) => pickByAllowedKeys(prev, allowedIds))
  }, [questions])

  useEffect(() => {
    const scroller = scrollContainerRef?.current
    if (!scroller || restoredScrollRef.current || questions.length === 0) return
    const saved = readStoredJson(STORAGE_KEYS.quiz, {})
    const scrollTop = Number(saved.scrollTop)
    if (Number.isFinite(scrollTop) && scrollTop > 0) {
      requestAnimationFrame(() => {
        scroller.scrollTop = scrollTop
      })
    }
    restoredScrollRef.current = true
  }, [questions.length, scrollContainerRef])

  useEffect(() => {
    const scrollTop = scrollContainerRef?.current?.scrollTop || 0
    saveStoredJson(STORAGE_KEYS.quiz, { selected, submitted, scrollTop })
  }, [selected, submitted, scrollContainerRef])

  useEffect(() => {
    const scroller = scrollContainerRef?.current
    if (!scroller) return undefined
    const onScroll = () => {
      saveStoredJson(STORAGE_KEYS.quiz, { selected, submitted, scrollTop: scroller.scrollTop })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [selected, submitted, scrollContainerRef])

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

  const clearProgress = () => {
    setSelected({})
    setSubmitted({})
    const scroller = scrollContainerRef?.current
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
    saveStoredJson(STORAGE_KEYS.quiz, { selected: {}, submitted: {}, scrollTop: 0 })
  }

  return (
    <div className="quiz-wrap">
      <div className="quiz-summary practice-summary">
        <div>题目总数: {questions.length}</div>
        <div>
          当前得分: {score.correct}
        </div>
        <button type="button" onClick={clearProgress}>
          清除记录
        </button>
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
