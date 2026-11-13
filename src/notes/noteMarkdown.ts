import MarkdownIt from 'markdown-it'
import type { StateInline } from 'markdown-it'
import DOMPurify from 'dompurify'
import type { NoteLinkResponse } from '../api/contracts/notes.ts'
import { noteTitleKey, parseWikiLink, readTag, type WikiLink } from './noteSyntax.ts'

/** Внутренние адреса приложения и http(s); `//host` (без схемы) — внешний адрес, запрещён. */
const ALLOWED_URL = /^(?:https?:\/\/|\/(?!\/)|#)/i

interface RenderEnv {
  /** Ключ названия → id заметки; заметок, которых нет в карте, ещё не существует. */
  noteIds: Map<string, string>
}

/** `[[Название|подпись]]` до встроенных ссылок: иначе `[` начнёт обычную ссылку Markdown. */
function wikiLinkRule(state: StateInline, silent: boolean) {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false
  const end = src.indexOf(']]', pos + 2)
  if (end < 0) return false
  const inner = src.slice(pos + 2, end)
  if (!inner || /[[\]\n]/.test(inner)) return false
  if (!silent) {
    const token = state.push('wikilink', '', 0)
    token.meta = parseWikiLink(inner)
  }
  state.pos = end + 2
  return true
}

function tagRule(state: StateInline, silent: boolean) {
  const tag = readTag(state.src, state.pos)
  if (!tag) return false
  if (!silent) {
    const token = state.push('note_tag', '', 0)
    token.meta = tag
  }
  state.pos += tag.raw.length
  return true
}

function createRenderer() {
  // HTML в исходнике выключен: теги выводятся как текст. Санитайзер ниже — второй рубеж.
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
  md.validateLink = (url) => ALLOWED_URL.test(url.trim())
  md.inline.ruler.before('link', 'wikilink', wikiLinkRule)
  md.inline.ruler.before('link', 'note_tag', tagRule)
  const escape = md.utils.escapeHtml

  md.renderer.rules.wikilink = (tokens, index, _options, env) => {
    const { target, label } = tokens[index].meta as WikiLink
    // [[#Заголовок]] и недопустимые названия — не связь: показываем текст.
    if (!target) return `<span class="wikilink">${escape(label)}</span>`
    const id = (env as RenderEnv | undefined)?.noteIds.get(noteTitleKey(target))
    return id
      ? `<a href="/notes/${encodeURIComponent(id)}" class="wikilink" data-note-link="">${escape(label)}</a>`
      : `<a href="/notes/new?title=${encodeURIComponent(target)}" class="wikilink wikilink-missing" data-note-link="">${escape(label)}</a>`
  }
  md.renderer.rules.note_tag = (tokens, index) => {
    const { raw, tag } = tokens[index].meta as { raw: string; tag: string }
    return `<a href="/notes?tag=${encodeURIComponent(tag)}" class="note-tag" data-note-link="">${escape(raw)}</a>`
  }
  // Картинка по внешнему адресу загрузилась бы сама (трекинг): показываем её ссылкой с подписью.
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const source = String(token.attrGet('src') ?? '')
    const label = self.renderInlineAsText(token.children ?? [], options, env) || source
    return `<a href="${escape(source)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`
  }
  const defaultLinkOpen = md.renderer.rules.link_open
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index]
    if (/^https?:/i.test(String(token.attrGet('href') ?? ''))) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
    }
    return defaultLinkOpen(tokens, index, options, env, self)
  }
  return md
}

let renderer: ReturnType<typeof createRenderer> | null = null

/**
 * Markdown заметки → безопасный HTML. `links` из ответа backend сопоставляют
 * `[[Название]]` с id заметок; ссылки на несуществующие заметки — «заготовки».
 */
export function renderNoteMarkdown(body: string, links: readonly NoteLinkResponse[]) {
  renderer ??= createRenderer()
  const noteIds = new Map<string, string>()
  for (const link of links) if (link.note_id) noteIds.set(noteTitleKey(link.title), link.note_id)
  const html = renderer.render(body, { noteIds } satisfies RenderEnv)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
      'pre', 'code', 'strong', 'em', 's', 'a', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'class', 'target', 'rel', 'start', 'data-note-link'],
    ALLOWED_URI_REGEXP: ALLOWED_URL,
    // DOMPurify сверяет с ALLOWED_URI_REGEXP значения всех атрибутов, кроме «URI-безопасных»:
    // без этого строгий шаблон молча вырезал бы target="_blank", rel и start у списков.
    ADD_URI_SAFE_ATTR: ['target', 'rel', 'start'],
  })
}
