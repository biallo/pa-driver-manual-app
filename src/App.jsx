import { useEffect, useRef, useState } from 'react'
import Exam from './components/Exam'
import ManualReader from './components/ManualReader'
import Quiz from './components/Quiz'
import { DATA_SOURCES, DEFAULT_LOCALE, STORAGE_KEYS } from './constants/app'
import { assetUrl } from './lib/assets'
import { getUiText, LANGUAGE_OPTIONS } from './lib/i18n'
import { readStoredString } from './lib/storage'

export default function App() {
  const [locale, setLocale] = useState(() => readStoredString(STORAGE_KEYS.language, DEFAULT_LOCALE))
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState([])
  const [pages, setPages] = useState([])
  const [toc, setToc] = useState([])
  const [version, setVersion] = useState('')
  const [tab, setTab] = useState('manual')
  const quizScrollRef = useRef(null)
  const examScrollRef = useRef(null)
  const languageMenuRef = useRef(null)
  const text = getUiText(locale)
  const source = DATA_SOURCES[locale] || DATA_SOURCES[DEFAULT_LOCALE]

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.language, locale)
    } catch {
      // Ignore storage write failures.
    }
  }, [locale])

  useEffect(() => {
    if (!languageMenuOpen) return undefined

    const onPointerDown = (event) => {
      if (!languageMenuRef.current?.contains(event.target)) {
        setLanguageMenuOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLanguageMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [languageMenuOpen])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')

    const load = async () => {
      try {
        const res = await fetch(assetUrl(source.dataUrl))
        if (!res.ok) throw new Error(text.loadFailed(res.status))
        const data = await res.json()

        if (!mounted) return
        setQuestions(Array.isArray(data.questions) ? data.questions : [])
        setPages(Array.isArray(data.pages) ? data.pages : [])
        setToc(Array.isArray(data.toc) ? data.toc : [])
        setVersion(data.generatedAt || source.version)
        setLoading(false)
      } catch (e) {
        if (!mounted) return
        setLoading(false)
        setError(e?.message || text.genericError)
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [source, text])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <img className="topbar-icon" src={assetUrl('/favicon.png')} alt={text.iconAlt} />
          <h1>{text.appTitle}</h1>
        </div>
        <div className="topbar-controls">
          <div className="language-menu" ref={languageMenuRef}>
            <button
              type="button"
              className={`language-switch ${languageMenuOpen ? 'open' : ''}`}
              aria-label={text.languageLabel}
              aria-haspopup="menu"
              aria-expanded={languageMenuOpen}
              onClick={() => setLanguageMenuOpen((open) => !open)}
            >
              <span className="language-switch-icon" aria-hidden="true">
                文A
              </span>
              <span className="language-switch-value">
                {LANGUAGE_OPTIONS.find((option) => option.value === locale)?.label || locale}
              </span>
            </button>
            {languageMenuOpen && (
              <div className="language-menu-popover" role="menu" aria-label={text.languageLabel}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    role="menuitemradio"
                    aria-checked={locale === option.value}
                    className={`language-menu-item ${locale === option.value ? 'active' : ''}`}
                    onClick={() => {
                      setLocale(option.value)
                      setLanguageMenuOpen(false)
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="tabs">
            <button type="button" className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>
              {text.tabs.manual}
            </button>
            <button type="button" className={tab === 'quiz' ? 'active' : ''} onClick={() => setTab('quiz')}>
              {text.tabs.quiz}
            </button>
            <button type="button" className={tab === 'exam' ? 'active' : ''} onClick={() => setTab('exam')}>
              {text.tabs.exam}
            </button>
          </div>
        </div>
      </header>

      {loading && <div className="status">{text.loading}</div>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && tab === 'manual' && (
        <main className="manual-only">
          <ManualReader
            pages={pages}
            toc={toc}
            version={version}
            pdfUrl={source.pdfUrl}
            storageKey={`${STORAGE_KEYS.manualPage}.${locale}`}
            text={text}
          />
        </main>
      )}

      {!loading && !error && tab === 'quiz' && (
        <main className="quiz-page practice-page" ref={quizScrollRef}>
          <Quiz
            questions={questions}
            version={version}
            scrollContainerRef={quizScrollRef}
            storageKey={`${STORAGE_KEYS.quiz}.${locale}`}
            text={text}
          />
        </main>
      )}

      {!loading && !error && tab === 'exam' && (
        <main className="quiz-page exam-page" ref={examScrollRef}>
          <Exam
            questions={questions}
            version={version}
            scrollContainerRef={examScrollRef}
            storageKey={`${STORAGE_KEYS.exam}.${locale}`}
            text={text}
          />
        </main>
      )}
    </div>
  )
}
