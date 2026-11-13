/** Свойства, от которых зависит раскладка текста в поле: копия должна переносить строки так же. */
const MIRRORED_PROPERTIES = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
] as const

/**
 * Координаты позиции `position` внутри textarea относительно её верхнего левого угла
 * (с учётом прокрутки поля). Браузер их не сообщает, поэтому текст до позиции
 * раскладывается в невидимой копии поля с теми же шрифтом, шириной и отступами.
 */
export function caretCoordinates(textarea: HTMLTextAreaElement, position: number) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  for (const property of MIRRORED_PROPERTIES) mirror.style[property] = style[property]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.textContent = textarea.value.slice(0, position)
  const marker = document.createElement('span')
  // Непустой маркер: у пустого span нет высоты строки.
  marker.textContent = textarea.value.slice(position) || '.'
  mirror.append(marker)
  document.body.append(mirror)
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4
  const coordinates = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: lineHeight,
  }
  mirror.remove()
  return coordinates
}

/** Незакрытая ссылка `[[…` прямо перед курсором: её начало и набранная часть названия. */
export function openWikiLinkAt(text: string, caret: number) {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf('[[')
  if (start < 0) return null
  const fragment = before.slice(start + 2)
  // Внутри названия нет скобок, переносов и разделителей подписи/заголовка.
  if (/[[\]\n|#^]/.test(fragment) || fragment.length > 200) return null
  return { start, fragment }
}
