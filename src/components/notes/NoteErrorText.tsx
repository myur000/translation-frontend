import { useTranslation } from '../../i18n/useTranslation.ts'
import type { NoteErrorMessage } from '../../notes/noteErrors.ts'

/** Текст ошибки операции с заметкой: ключ перевода или сообщение сервера. */
export function NoteErrorText({ message }: { message: NoteErrorMessage }) {
  const { t } = useTranslation()
  return <>{message.kind === 'key' ? t(message.key) : message.text}</>
}
