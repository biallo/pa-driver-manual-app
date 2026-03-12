export const DATA_URL = '/data/manual-static.json'
export const DATA_URL_EN = '/data/manual-static-en.json'
export const PDF_URL = '/manual.pdf'
export const PDF_URL_EN = '/manual-en.pdf'
export const EXAM_QUESTION_COUNT = 18
export const EXAM_PASS_SCORE = 15
export const DEFAULT_LOCALE = 'zh'

export const DATA_SOURCES = {
  zh: {
    type: 'static',
    dataUrl: DATA_URL,
    pdfUrl: PDF_URL,
    version: 'zh-static'
  },
  en: {
    type: 'static',
    dataUrl: DATA_URL_EN,
    pdfUrl: PDF_URL_EN,
    version: 'en-static'
  }
}

export const STORAGE_KEYS = {
  language: 'pa-driver-manual.language',
  manualPage: 'pa-driver-manual.manual-page',
  quiz: 'pa-driver-manual.quiz-state',
  exam: 'pa-driver-manual.exam-state'
}
