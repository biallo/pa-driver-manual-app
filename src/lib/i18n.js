export const LANGUAGE_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' }
]

export const UI_TEXT = {
  zh: {
    iconAlt: '应用图标',
    appTitle: '宾夕法尼亚驾驶手册学习与考试',
    tabs: {
      manual: '手册阅读',
      quiz: '练习题库',
      exam: '模拟考试'
    },
    loading: '正在加载内容，请稍候...',
    loadFailed: (status) => `数据加载失败: ${status}`,
    genericError: '加载失败',
    languageLabel: '语言',
    manual: {
      unavailable: '手册内容暂不可用，请稍后重试。',
      pageTitle: (page) => `第 ${page} 页`,
      pageCount: (count) => `共 ${count} 页`,
      pageThumbAlt: (page) => `第 ${page} 页缩略图`,
      pageAlt: (page) => `手册第 ${page} 页`,
      jumpLabel: '目录跳转',
      thumbLoading: '加载中...',
      pageLoading: '正在加载该页...',
      previewFailed: 'PDF 缩略图渲染失败',
      pageFailed: 'PDF 页面渲染失败',
      untitledSection: '未命名章节'
    },
    quiz: {
      total: (count) => `题目总数: ${count}`,
      score: (count) => `当前得分: ${count}`,
      clear: '清除记录',
      noAnswer: '未抽取到标准答案',
      correct: '回答正确',
      incorrect: (answer) => `回答错误，正确答案: ${answer}`,
      questionImageAlt: (no) => `第 ${no} 题配图`
    },
    exam: {
      count: (count) => `考试题数: ${count}`,
      answered: (count) => `已作答: ${count}`,
      correct: (count) => `当前正确: ${count}`,
      pass: (count) => `通过标准: ${count} 题`,
      result: '结果',
      passed: '考试通过',
      failed: '考试未通过',
      inProgress: '进行中',
      restart: '重新开始',
      correctFeedback: '回答正确',
      incorrectFeedback: (answer) => `回答错误，正确答案: ${answer}`
    }
  },
  en: {
    iconAlt: 'App icon',
    appTitle: 'Pennsylvania Driver Manual Study & Test',
    tabs: {
      manual: 'Manual',
      quiz: 'Practice',
      exam: 'Exam'
    },
    loading: 'Loading manual and quiz data...',
    loadFailed: (status) => `Failed to load data: ${status}`,
    genericError: 'Loading failed',
    languageLabel: 'Language',
    manual: {
      unavailable: 'The manual is temporarily unavailable. Please try again later.',
      pageTitle: (page) => `Page ${page}`,
      pageCount: (count) => `${count} pages`,
      pageThumbAlt: (page) => `Thumbnail for page ${page}`,
      pageAlt: (page) => `Manual page ${page}`,
      jumpLabel: 'Jump to section',
      thumbLoading: 'Loading...',
      pageLoading: 'Loading page...',
      previewFailed: 'Failed to render PDF thumbnails',
      pageFailed: 'Failed to render PDF pages',
      untitledSection: 'Untitled section'
    },
    quiz: {
      total: (count) => `Questions: ${count}`,
      score: (count) => `Correct so far: ${count}`,
      clear: 'Clear progress',
      noAnswer: 'No official answer was extracted',
      correct: 'Correct',
      incorrect: (answer) => `Incorrect. Correct answer: ${answer}`,
      questionImageAlt: (no) => `Illustration for question ${no}`
    },
    exam: {
      count: (count) => `Questions: ${count}`,
      answered: (count) => `Answered: ${count}`,
      correct: (count) => `Correct: ${count}`,
      pass: (count) => `Passing score: ${count}`,
      result: 'Result',
      passed: 'Passed',
      failed: 'Failed',
      inProgress: 'In progress',
      restart: 'Restart',
      correctFeedback: 'Correct',
      incorrectFeedback: (answer) => `Incorrect. Correct answer: ${answer}`
    }
  }
}

export function getUiText(locale) {
  return UI_TEXT[locale] || UI_TEXT.zh
}
