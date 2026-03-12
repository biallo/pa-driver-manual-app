import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EXAM_PASS_SCORE,
  EXAM_QUESTION_COUNT
} from '../constants/app'
import { pickByAllowedKeys, readStoredJson, saveStoredJson } from '../lib/storage'
import ConfettiCanvas from './common/ConfettiCanvas'
import PageImage from './common/PageImage'

function pickRandomQuestions(questions, count) {
  const pool = [...questions]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

export default function Exam({ questions, version, scrollContainerRef, storageKey, text }) {
  const optionOrder = ['A', 'B', 'C', 'D']
  const eligible = useMemo(
    () =>
      questions
        .map((q, idx) => ({ ...q, questionNo: idx + 1 }))
        .filter((q) => !!q.correct),
    [questions]
  )
  const [examIds, setExamIds] = useState(() => {
    const saved = readStoredJson(storageKey, {})
    return Array.isArray(saved.examIds) ? saved.examIds.map(String) : []
  })
  const [selected, setSelected] = useState(() => {
    const saved = readStoredJson(storageKey, {})
    return saved.selected && typeof saved.selected === 'object' ? saved.selected : {}
  })
  const [submitted, setSubmitted] = useState(() => {
    const saved = readStoredJson(storageKey, {})
    return saved.submitted && typeof saved.submitted === 'object' ? saved.submitted : {}
  })
  const restoredScrollRef = useRef(false)

  const eligibleMap = useMemo(() => {
    const map = new Map()
    for (const q of eligible) map.set(String(q.id), q)
    return map
  }, [eligible])

  useEffect(() => {
    if (!eligible.length) {
      setExamIds([])
      return
    }
    setExamIds((prev) => {
      const desiredCount = Math.min(EXAM_QUESTION_COUNT, eligible.length)
      const seen = new Set()
      const valid = []
      for (const id of prev) {
        if (!eligibleMap.has(id) || seen.has(id)) continue
        seen.add(id)
        valid.push(id)
      }
      if (valid.length >= desiredCount) return valid.slice(0, desiredCount)
      const remaining = eligible.filter((q) => !seen.has(String(q.id)))
      const fill = pickRandomQuestions(remaining, desiredCount - valid.length).map((q) => String(q.id))
      return [...valid, ...fill]
    })
  }, [eligible, eligibleMap])

  const examQuestions = useMemo(
    () => examIds.map((id) => eligibleMap.get(id)).filter(Boolean),
    [examIds, eligibleMap]
  )

  useEffect(() => {
    const allowedIds = new Set(examIds)
    setSelected((prev) => pickByAllowedKeys(prev, allowedIds))
    setSubmitted((prev) => pickByAllowedKeys(prev, allowedIds))
  }, [examIds])

  useEffect(() => {
    const scroller = scrollContainerRef?.current
    if (!scroller || restoredScrollRef.current || examQuestions.length === 0) return
    const saved = readStoredJson(storageKey, {})
    const scrollTop = Number(saved.scrollTop)
    if (Number.isFinite(scrollTop) && scrollTop > 0) {
      requestAnimationFrame(() => {
        scroller.scrollTop = scrollTop
      })
    }
    restoredScrollRef.current = true
  }, [examQuestions.length, scrollContainerRef, storageKey])

  useEffect(() => {
    const scrollTop = scrollContainerRef?.current?.scrollTop || 0
    saveStoredJson(storageKey, { examIds, selected, submitted, scrollTop })
  }, [examIds, selected, storageKey, submitted, scrollContainerRef])

  useEffect(() => {
    const scroller = scrollContainerRef?.current
    if (!scroller) return undefined
    const onScroll = () => {
      saveStoredJson(storageKey, { examIds, selected, submitted, scrollTop: scroller.scrollTop })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [examIds, selected, storageKey, submitted, scrollContainerRef])

  const restartExam = () => {
    const nextIds = pickRandomQuestions(eligible, EXAM_QUESTION_COUNT).map((q) => String(q.id))
    setExamIds(nextIds)
    setSelected({})
    setSubmitted({})
    const scroller = scrollContainerRef?.current
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
    saveStoredJson(storageKey, { examIds: nextIds, selected: {}, submitted: {}, scrollTop: 0 })
  }

  const score = useMemo(() => {
    let correct = 0
    for (const q of examQuestions) {
      if (submitted[q.id] && selected[q.id] === q.correct) correct += 1
    }
    return correct
  }, [examQuestions, selected, submitted])

  const answered = useMemo(() => examQuestions.filter((q) => submitted[q.id]).length, [examQuestions, submitted])
  const finished = examQuestions.length > 0 && answered === examQuestions.length
  const passed = score >= EXAM_PASS_SCORE
  const resultText = passed ? text.exam.passed : finished ? text.exam.failed : text.exam.inProgress
  const resultClass = passed ? 'ok' : finished ? 'bad' : 'neutral'

  return (
    <div className="quiz-wrap">
      {passed && <ConfettiCanvas active={passed} />}

      <div className="quiz-summary exam-summary">
        <div>{text.exam.count(examQuestions.length)}</div>
        <div>{text.exam.answered(answered)}</div>
        <div>{text.exam.correct(score)}</div>
        <div>{text.exam.pass(EXAM_PASS_SCORE)}</div>
        <div>
          {text.exam.result}: <span className={resultClass}>{resultText}</span>
        </div>
        <button type="button" onClick={restartExam}>
          {text.exam.restart}
        </button>
      </div>

      {examQuestions.map((q, index) => {
        const choice = selected[q.id]
        const done = !!submitted[q.id]
        const ok = done && choice === q.correct
        const image = q.image || null

        return (
          <div className="question-card" key={q.id}>
            <div className="question-title">
              {index + 1}. {q.stem}
            </div>
            <PageImage
              image={image}
              version={version}
              alt={text.quiz.questionImageAlt(q.questionNo)}
            />
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
                  {ok ? text.exam.correctFeedback : text.exam.incorrectFeedback(q.correct)}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
