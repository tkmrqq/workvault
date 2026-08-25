import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

// v-html от чужого пользовательского текста (описания карточек/подзадач видят
// все участники) — потенциальный XSS, если не санитайзить. DOMPurify чистит
// результат marked.parse() перед вставкой в DOM.
export function renderMarkdown(text) {
    if (!text) return ''
    const html = marked.parse(text)
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}