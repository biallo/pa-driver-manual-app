export const DATA_URL = '/data/manual-static.json'
export const PDF_URL = '/manual.pdf'
export const IMAGE_QUESTION_IDS = [1, 2, 3, 4, 5, 6, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 41, 42, 43, 44, 45, 52, 53, 55, 56, 58, 88, 98, 99, 123]
export const IMAGE_QUESTION_SET = new Set(IMAGE_QUESTION_IDS)
export const EXAM_QUESTION_COUNT = 18
export const EXAM_PASS_SCORE = 15

export const STORAGE_KEYS = {
  manualPage: 'pa-driver-manual.manual-page',
  quiz: 'pa-driver-manual.quiz-state',
  exam: 'pa-driver-manual.exam-state'
}
