const IS_FILE_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'file:'
const WEB_BASE_URL = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')

export function assetUrl(path) {
  if (!path) return path
  if (/^(?:https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  if (!IS_FILE_PROTOCOL) {
    const normalized = path.startsWith('/') ? path : `/${path}`
    return `${WEB_BASE_URL}${normalized}`
  }
  return path.startsWith('/') ? `.${path}` : path
}

export function withVersion(path, version) {
  if (!path) return path
  if (!version) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}v=${encodeURIComponent(version)}`
}

export function questionImagePath(questionIndex) {
  return `/extracted/questions/q-${String(questionIndex).padStart(4, '0')}.jpg`
}
