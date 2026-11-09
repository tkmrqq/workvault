import { getApiBase } from './apiBase'

// Аватар хранится одной строкой: либо эмодзи (как раньше), либо путь к картинке
// вида /uploads/avatar-*.webp. Во время редактирования бывает ещё blob: — превью.
const IMAGE_PREFIXES = ['/uploads/', 'http://', 'https://', 'data:image/', 'blob:']

export function isImageAvatar(v) {
  return typeof v === 'string' && IMAGE_PREFIXES.some(p => v.startsWith(p))
}

export function avatarSrc(v) {
  if (!isImageAvatar(v)) return null
  return v.startsWith('/uploads/') ? getApiBase() + v : v
}

// Для мест, где можно вывести только текст (например, <option>)
export function avatarText(v) {
  return isImageAvatar(v) ? '' : (v || '')
}
