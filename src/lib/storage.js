export function readStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

export function readStoredString(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(key)
    return typeof value === 'string' && value ? value : fallback
  } catch {
    return fallback
  }
}

export function saveStoredJson(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/storage errors and keep app usable.
  }
}

export function readStoredNumber(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    const num = Number(raw)
    return Number.isFinite(num) ? num : fallback
  } catch {
    return fallback
  }
}

export function pickByAllowedKeys(source, allowedKeys) {
  const next = {}
  for (const [key, value] of Object.entries(source || {})) {
    if (allowedKeys.has(String(key))) next[key] = value
  }
  return next
}
