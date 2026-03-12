import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl, withVersion } from '../lib/assets'
import { readStoredNumber } from '../lib/storage'

export default function ManualReader({ pages, toc, version, pdfUrl, storageKey, text }) {
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    const smallViewport = window.matchMedia?.('(max-width: 900px)').matches
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches
    return uaMobile || (smallViewport && coarsePointer)
  }, [])
  const isDesktop = !isMobile
  const [page, setPage] = useState(() => readStoredNumber(storageKey, 1))
  const desktopScrollRef = useRef(null)
  const desktopThumbsRef = useRef(null)
  const desktopThumbRefs = useRef([])
  const desktopPageRefs = useRef([])
  const desktopRestoreDoneRef = useRef(false)
  const desktopJumpingRef = useRef(false)
  const desktopJumpTimerRef = useRef(null)
  const desktopLoadedPagesRef = useRef(new Set())
  const [desktopThumbs, setDesktopThumbs] = useState({})
  const [desktopPages, setDesktopPages] = useState({})
  const [desktopRenderError, setDesktopRenderError] = useState('')
  const getScrollTopForPage = (targetPage) => {
    const scroller = desktopScrollRef.current
    const target = desktopPageRefs.current[Math.max(0, targetPage - 1)]
    if (!scroller || !target) return null
    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    return Math.max(0, scroller.scrollTop + delta - 8)
  }

  const scrollContentToPage = (targetPage, behavior = 'smooth') => {
    const scroller = desktopScrollRef.current
    const targetTop = getScrollTopForPage(targetPage)
    if (!scroller || targetTop == null) return false
    desktopJumpingRef.current = true
    scroller.scrollTo({ top: targetTop, behavior })
    if (desktopJumpTimerRef.current) window.clearTimeout(desktopJumpTimerRef.current)
    desktopJumpTimerRef.current = window.setTimeout(() => {
      desktopJumpingRef.current = false
    }, behavior === 'smooth' ? 700 : 200)
    return true
  }

  useEffect(() => {
    if (!pages.length) return
    setPage((prev) => Math.min(Math.max(prev, 1), pages.length))
  }, [pages])

  useEffect(() => {
    desktopPageRefs.current = []
    desktopThumbRefs.current = []
    desktopRestoreDoneRef.current = false
    desktopLoadedPagesRef.current = new Set()
    setDesktopThumbs({})
    setDesktopPages({})
    setDesktopRenderError('')
  }, [version, pages.length])

  useEffect(
    () => () => {
      if (desktopJumpTimerRef.current) {
        window.clearTimeout(desktopJumpTimerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, String(page))
    } catch {
      // Ignore storage write failures.
    }
  }, [page, storageKey])

  useEffect(() => {
    if (!pages.length) return undefined
    const scroller = desktopScrollRef.current
    if (!scroller) return undefined
    const onScroll = () => {
      if (desktopJumpingRef.current) return
      const anchor = scroller.scrollTop + scroller.clientHeight * 0.28
      let current = 1
      for (let i = 0; i < pages.length; i += 1) {
        const el = desktopPageRefs.current[i]
        if (!el) continue
        if (el.offsetTop <= anchor) {
          current = i + 1
        } else {
          break
        }
      }
      setPage((prev) => (prev === current ? prev : current))
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [pages.length])

  useEffect(() => {
    if (!pages.length || desktopRestoreDoneRef.current) return
    const timers = []

    const alignThumb = (targetPage, behavior = 'auto') => {
      const wrap = desktopThumbsRef.current
      const activeThumb = desktopThumbRefs.current[Math.max(0, targetPage - 1)]
      if (!wrap || !activeThumb) return false
      const top = activeThumb.offsetTop
      const targetTop = Math.max(0, top - wrap.clientHeight * 0.35)
      wrap.scrollTo({ top: targetTop, behavior })
      return true
    }

    const alignContent = (targetPage, behavior = 'auto') => {
      return scrollContentToPage(targetPage, behavior)
    }

    const tryRestore = () => {
      const okContent = alignContent(page, 'auto')
      const okThumb = alignThumb(page, 'auto')
      if (okContent || okThumb) {
        desktopRestoreDoneRef.current = true
      }
    }

    ;[0, 120, 320].forEach((delay) => {
      const t = window.setTimeout(() => {
        if (!desktopRestoreDoneRef.current) tryRestore()
      }, delay)
      timers.push(t)
    })

    return () => {
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [pages.length, page])

  useEffect(() => {
    if (!isDesktop) return
    const wrap = desktopThumbsRef.current
    const activeThumb = desktopThumbRefs.current[Math.max(0, page - 1)]
    if (!wrap || !activeThumb) return
    const top = activeThumb.offsetTop
    const bottom = top + activeThumb.offsetHeight
    const viewTop = wrap.scrollTop
    const viewBottom = viewTop + wrap.clientHeight
    if (top < viewTop + 8 || bottom > viewBottom - 8) {
      const target = Math.max(0, top - wrap.clientHeight * 0.35)
      wrap.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [isDesktop, page])

  useEffect(() => {
    if (!isDesktop || !pages.length) return undefined
    let cancelled = false
    const pdfSrc = assetUrl(withVersion(pdfUrl, version))

    setDesktopRenderError('')
    import('../lib/pdfParser')
      .then(async (mod) => {
        const queue = pages.map((p) => p.page)
        let cursor = 0
        const worker = async () => {
          while (!cancelled) {
            const i = cursor
            cursor += 1
            if (i >= queue.length) break
            const pageNo = queue[i]
            const thumb = await mod.renderPagePreview(pdfSrc, pageNo, null, 0.26)
            if (cancelled) return
            setDesktopThumbs((prev) => (prev[pageNo] ? prev : { ...prev, [pageNo]: thumb }))
          }
        }
        await Promise.all([worker(), worker(), worker()])
      })
      .catch((e) => {
        if (cancelled) return
        setDesktopRenderError(e?.message || text.manual.previewFailed)
      })

    return () => {
      cancelled = true
    }
  }, [isDesktop, pages, pdfUrl, text.manual.previewFailed, version])

  useEffect(() => {
    if (!pages.length) return
    let cancelled = false
    const pdfSrc = assetUrl(withVersion(pdfUrl, version))
    const pageScale = isMobile ? 1.25 : 1.65
    const targets = []
    for (let p = page - 2; p <= page + 2; p += 1) {
      if (p >= 1 && p <= pages.length && !desktopLoadedPagesRef.current.has(p)) targets.push(p)
    }
    if (!targets.length) return

    import('../lib/pdfParser')
      .then(async (mod) => {
        for (const pageNo of targets) {
          desktopLoadedPagesRef.current.add(pageNo)
          const img = await mod.renderPagePreview(pdfSrc, pageNo, null, pageScale)
          if (cancelled) return
          setDesktopPages((prev) => (prev[pageNo] ? prev : { ...prev, [pageNo]: img }))
        }
      })
      .catch((e) => {
        if (cancelled) return
        setDesktopRenderError(e?.message || text.manual.pageFailed)
      })

    return () => {
      cancelled = true
    }
  }, [isMobile, page, pages.length, pdfUrl, text.manual.pageFailed, version])

  const tocOptions = toc.length
    ? toc
    : pages.map((item) => ({
        title: text.manual.pageTitle(item.page),
        page: item.page
      }))

  const jumpToDesktopPage = (targetPage, behavior = 'smooth') => {
    const clamped = Math.min(Math.max(targetPage, 1), pages.length || 1)
    setPage(clamped)
    requestAnimationFrame(() => {
      scrollContentToPage(clamped, behavior)
    })
    // A late correction keeps alignment accurate after layout/image updates.
    window.setTimeout(() => {
      scrollContentToPage(clamped, 'auto')
    }, 220)
  }

  if (!pages.length) {
    return (
      <section className="manual-reader">
        <p className="manual-tip">{text.manual.unavailable}</p>
      </section>
    )
  }

  return (
    <section className="manual-desktop">
      <aside className="manual-thumbs" ref={desktopThumbsRef}>
        {pages.map((item, idx) => {
          const thumb = desktopThumbs[item.page]
          const active = page === item.page
          return (
            <button
              type="button"
              key={`${item.page}-${idx}`}
              className={`manual-thumb ${active ? 'active' : ''}`}
              onClick={() => jumpToDesktopPage(item.page, 'auto')}
              ref={(el) => {
                desktopThumbRefs.current[idx] = el
              }}
            >
              <span className="manual-thumb-no">{text.manual.pageTitle(item.page)}</span>
              <div className="manual-thumb-box">
                {thumb ? (
                  <img className="manual-thumb-img" src={thumb} alt={text.manual.pageThumbAlt(item.page)} />
                ) : (
                  <div className="manual-thumb-placeholder">{text.manual.thumbLoading}</div>
                )}
              </div>
            </button>
          )
        })}
      </aside>
      <section className="manual-desktop-main">
        <div className="manual-toolbar manual-toolbar-desktop">
          <select aria-label={text.manual.jumpLabel} value={page} onChange={(e) => jumpToDesktopPage(Number(e.target.value), 'auto')}>
            {tocOptions.map((item, idx) => (
              <option key={`${item.page}-${idx}`} value={item.page}>
                {item.title}
              </option>
            ))}
          </select>
          <div className="manual-desktop-page-indicator">
            {text.manual.pageCount(pages.length)}
          </div>
        </div>
        {desktopRenderError && <div className="status error">{desktopRenderError}</div>}
        <div className="manual-desktop-scroll" ref={desktopScrollRef}>
          {pages.map((item, idx) => {
            const img = desktopPages[item.page]
            return (
              <article
                key={`${item.page}-${idx}`}
                className="manual-desktop-page"
                ref={(el) => {
                  desktopPageRefs.current[idx] = el
                }}
              >
                <div className="manual-desktop-page-no">{text.manual.pageTitle(item.page)}</div>
                <div className="manual-desktop-page-box">
                  {img ? (
                    <img className="manual-desktop-page-img" src={img} alt={text.manual.pageAlt(item.page)} />
                  ) : (
                    <div className="manual-desktop-page-loading">{text.manual.pageLoading}</div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}
