/**
 * Токен одноразовой ссылки из письма. Бэк кладёт его во фрагмент (`#token=…`):
 * фрагмент не уходит на сервер и не попадает в логи и Referer. Письма до
 * 2026-10-31 несли токен в query (`?token=…`) — их тоже принимаем.
 */
export function readLinkToken(location: { hash: string; search: string }): string {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('token')
  return (fromHash ?? new URLSearchParams(location.search).get('token') ?? '').trim()
}
