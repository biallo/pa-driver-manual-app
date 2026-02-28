import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const docCache = new Map()
const pageImageCache = new Map()

function normalize(line) {
  return line.replace(/\s+/g, ' ').trim()
}

function cleanLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => normalize(line))
    .filter(Boolean)
}

function toSortedLines(items) {
  const buckets = []
  const tolerance = 2.5

  for (const item of items) {
    const value = normalize(item.str || '')
    if (!value) continue

    const x = item.transform?.[4] || 0
    const y = item.transform?.[5] || 0
    const w = item.width || 0
    const h = item.height || 0
    let target = buckets.find((bucket) => Math.abs(bucket.y - y) <= tolerance)
    if (!target) {
      target = { y, entries: [] }
      buckets.push(target)
    }
    target.entries.push({
      x,
      value,
      xMin: x,
      xMax: x + w,
      yMin: y - h * 0.2,
      yMax: y + h * 0.8
    })
  }

  buckets.sort((a, b) => b.y - a.y)

  return buckets
    .map((bucket) => {
      const entries = bucket.entries
        .sort((a, b) => a.x - b.x)
      return {
        text: normalize(entries.map((entry) => entry.value).join(' ')),
        xMin: Math.min(...entries.map((entry) => entry.xMin)),
        xMax: Math.max(...entries.map((entry) => entry.xMax)),
        yMin: Math.min(...entries.map((entry) => entry.yMin)),
        yMax: Math.max(...entries.map((entry) => entry.yMax))
      }
    })
    .map((line) => ({ ...line, text: normalize(line.text) }))
    .filter((line) => line.text)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function finalizeRegion(region, pageHeight) {
  if (!region) return null
  const top = clamp(region.top, 0, pageHeight)
  const rawBottom = region.bottom == null ? region.lastY - 8 : region.bottom
  const bottom = clamp(rawBottom, 0, pageHeight)
  if (top - bottom < 20) return null
  return { top, bottom }
}

function buildQuestionCrop(current, line, pageHeight) {
  if (!current || current.page !== line.page) return
  if (!current.crop) {
    current.crop = {
      top: line.yMax + 14,
      bottom: null,
      lastY: line.yMin
    }
    return
  }
  current.crop.lastY = Math.min(current.crop.lastY, line.yMin)
  current.crop.top = Math.max(current.crop.top, line.yMax + 14)
}

function setBottomAtNextQuestion(current, nextQuestionY) {
  if (!current?.crop || current.crop.bottom != null) return
  current.crop.bottom = nextQuestionY + 10
}

function cleanupLineText(lines) {
  return lines
    .map((line) => normalize(line.text))
    .filter(Boolean)
}

async function getPdf(pdfUrl) {
  if (!docCache.has(pdfUrl)) {
    docCache.set(pdfUrl, pdfjsLib.getDocument(pdfUrl).promise)
  }
  return docCache.get(pdfUrl)
}

async function resolvePageNumber(pdf, dest) {
  if (!dest) return null
  let destination = dest
  if (typeof destination === 'string') {
    destination = await pdf.getDestination(destination)
  }
  if (!Array.isArray(destination) || !destination[0]) return null
  const pageIndex = await pdf.getPageIndex(destination[0])
  return pageIndex + 1
}

async function flattenOutline(pdf, items, level = 1, acc = []) {
  for (const item of items || []) {
    const page = await resolvePageNumber(pdf, item.dest)
    acc.push({
      title: normalize(item.title || '未命名章节'),
      page: page || 1,
      level
    })
    if (item.items?.length) {
      await flattenOutline(pdf, item.items, level + 1, acc)
    }
  }
  return acc
}

function parseAnswerPool(lines) {
  const answerQueue = new Map()
  const answerHeadings = /(answer\s*key|answers?|答案|试题答案)/i

  let inAnswerArea = false
  let answerAreaLineCount = 0

  for (const line of lines) {
    if (answerHeadings.test(line)) {
      inAnswerArea = true
      answerAreaLineCount = 0
      continue
    }

    if (!inAnswerArea) continue

    answerAreaLineCount += 1
    if (answerAreaLineCount > 200) {
      inAnswerArea = false
      continue
    }

    const pairs = [...line.matchAll(/(\d{1,3})\s*[\.:：\)-]?\s*([A-D])/gi)]
    for (const match of pairs) {
      const n = Number(match[1])
      const ans = match[2].toUpperCase()
      const queue = answerQueue.get(n) || []
      queue.push(ans)
      answerQueue.set(n, queue)
    }
  }

  return answerQueue
}

function extractQuestions(pages, answerQueue) {
  const questions = []
  const seenNoCount = new Map()

  const questionStart = /^(\d{1,3})\s*[\.)、]\s*(.+)$/
  const optionStart = /^([A-D])\s*[\.)、．]\s*(.+)$/i
  const inlineAnswer = /(答案|answer)\s*[:：]?\s*([A-D])/i

  let current = null
  let optionKey = null

  const finalize = () => {
    if (!current) return
    const optionCount = Object.keys(current.options).length
    if (optionCount < 2) {
      current = null
      optionKey = null
      return
    }

    if (!current.correct) {
      const seenCount = seenNoCount.get(current.no) || 0
      const queue = answerQueue.get(current.no) || []
      current.correct = queue[seenCount] || null
      seenNoCount.set(current.no, seenCount + 1)
    }

    questions.push({
      id: `q-${questions.length + 1}`,
      no: current.no,
      stem: normalize(current.stem),
      options: current.options,
      correct: current.correct,
      page: current.page,
      crop: finalizeRegion(current.crop, current.pageHeight)
    })

    current = null
    optionKey = null
  }

  for (const page of pages) {
    for (const raw of page.lines) {
      const line = {
        ...raw,
        text: normalize(raw.text),
        page: page.page
      }
      const text = line.text

      const q = text.match(questionStart)
      if (q) {
        setBottomAtNextQuestion(current, line.yMax)
        finalize()
        current = {
          no: Number(q[1]),
          stem: q[2],
          options: {},
          correct: null,
          page: page.page,
          pageHeight: page.height,
          crop: null
        }
        buildQuestionCrop(current, line, page.height)
        optionKey = null
        const inAnswer = text.match(inlineAnswer)
        if (inAnswer) current.correct = inAnswer[2].toUpperCase()
        continue
      }

      if (!current) continue
      if (current.page === page.page) {
        buildQuestionCrop(current, line, page.height)
      }

      const opt = text.match(optionStart)
      if (opt) {
        optionKey = opt[1].toUpperCase()
        current.options[optionKey] = opt[2]
        continue
      }

      const inAnswer = text.match(inlineAnswer)
      if (inAnswer) {
        current.correct = inAnswer[2].toUpperCase()
        continue
      }

      if (optionKey) {
        current.options[optionKey] = normalize(`${current.options[optionKey]} ${text}`)
      } else {
        current.stem = normalize(`${current.stem} ${text}`)
      }
    }
  }

  finalize()

  return questions
}

export async function loadManualAndQuiz(pdfUrl) {
  const pdf = await getPdf(pdfUrl)

  const outlineRaw = await pdf.getOutline()
  let toc = await flattenOutline(pdf, outlineRaw || [])
  if (!toc.length) {
    toc = Array.from({ length: pdf.numPages }, (_, i) => ({
      title: `第 ${i + 1} 页`,
      page: i + 1,
      level: 1
    }))
  }

  const pages = []
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const text = await page.getTextContent()
    const lines = toSortedLines(text.items)
    const viewport = page.getViewport({ scale: 1 })
    pages.push({
      page: i,
      lines,
      text: cleanupLineText(lines).join('\n'),
      height: viewport.height
    })
  }

  const mergedLines = cleanLines(pages.map((page) => page.text).join('\n'))
  const answerPool = parseAnswerPool(mergedLines)
  const questions = extractQuestions(pages, answerPool)

  return {
    totalPages: pdf.numPages,
    toc,
    pages,
    questions,
    answerableQuestions: questions.filter((q) => !!q.correct)
  }
}

export async function renderPagePreview(pdfUrl, pageNumber, crop = null, scale = 1) {
  const cropKey = crop ? `${crop.top.toFixed(1)}:${crop.bottom.toFixed(1)}` : 'full'
  const key = `${pdfUrl}::${pageNumber}::${scale}::${cropKey}`
  if (pageImageCache.has(key)) return pageImageCache.get(key)

  const promise = (async () => {
    const pdf = await getPdf(pdfUrl)
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { alpha: false })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    await page.render({ canvasContext: ctx, viewport }).promise

    if (!crop) {
      return canvas.toDataURL('image/png')
    }

    const top = clamp(crop.top * scale, 0, viewport.height)
    const bottom = clamp(crop.bottom * scale, 0, viewport.height)
    const topPx = Math.floor(viewport.height - top)
    const bottomPx = Math.ceil(viewport.height - bottom)
    const cropHeight = bottomPx - topPx

    if (cropHeight < 30) {
      return canvas.toDataURL('image/png')
    }

    const out = document.createElement('canvas')
    const outCtx = out.getContext('2d', { alpha: false })
    out.width = canvas.width
    out.height = cropHeight
    outCtx.drawImage(
      canvas,
      0,
      topPx,
      canvas.width,
      cropHeight,
      0,
      0,
      out.width,
      out.height
    )
    return out.toDataURL('image/png')
  })()

  pageImageCache.set(key, promise)
  return promise
}
