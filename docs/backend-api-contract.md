# Backend API contract

Контракт зафиксирован по Java-коду backend. Backend в рамках frontend-задачи
не изменяется.

## Адреса

- Локальный backend: `http://localhost:8080`.
- Frontend dev server: `http://localhost:3000`.
- Browser API base URL: `/api`.
- Vite перенаправляет `/api/*` в `http://localhost:8080/api/*`.

Такой режим выбран намеренно: CORS в backend по умолчанию выключен. Для прямых
запросов браузера на `http://localhost:8080` backend пришлось бы запускать с
`CORS_ENABLED=true` и
`CORS_ALLOWED_ORIGINS=http://localhost:3000`.

## Аутентификация и JWT

Защищённые запросы используют заголовок
`Authorization: Bearer <access-token>`. Access token действует 15 минут
по умолчанию. Backend с контрактом от 2026-10-07 поддерживает refresh-сессию
на 7 дней: HttpOnly cookie `translatelab_refresh`, Path `/api/auth`.
JWT хранится в памяти frontend, cookie управляется только браузером.

После подтверждения email старый JWT также становится недействительным: claim
`email_verified` больше не совпадает с состоянием аккаунта. Refresh выдаёт JWT
с актуальным состоянием; текущий экран подтверждения предлагает повторный вход.

JWT подписан `HS256`. Backend проверяет подпись, `issuer`, `audience`, `kid`,
срок действия и `auth_version`. Payload содержит `sub`, `email`,
`email_verified`, `auth_version`, `sid` (новые сессии), `iat`, `exp`, `iss` и `aud`. Клиент может
использовать claims только для отображения; окончательное решение о доступе
всегда принимает backend.

Загрузка документов и начало покупки требуют JWT подтверждённого аккаунта.

Login/refresh/logout/logout-all отправляются с `credentials: "include"`.
Refresh и logout требуют `X-Refresh-Request: true`; Bearer для них не нужен.
Frontend обновляет JWT за минуту до истечения и после 401 защищённого запроса,
повторяя исходный запрос максимум один раз. Вкладки сериализуют cookie-операции
через Web Locks и делятся результатом через BroadcastChannel (JWT только в памяти).
401 refresh завершает вход; 403, 429, 5xx и сеть не считаются истечением сессии.
После неопределённого результата автоматические повторы заблокированы до нового
входа; несекретный маркер сохраняет это правило даже после перезагрузки страницы.
Обычный выход теперь отзывает текущую сессию на backend, а не только очищает UI.

## Frontend endpoints

| Method | Path | Access | Request | Success response |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | public | `RegisterRequest` | `201 RegisterResponse` |
| POST | `/api/auth/login` | public | `LoginRequest` | `200 LoginResponse` |
| POST | `/api/auth/refresh` | refresh cookie + custom header | — | `200 LoginResponse` + rotated cookie |
| POST | `/api/auth/logout` | refresh cookie + custom header | — | `204` + deleted cookie |
| POST | `/api/auth/logout-all` | JWT | — | `204` |
| POST | `/api/auth/email-verification/request` | public | `AccountEmailRequest` | `202` |
| POST | `/api/auth/email-verification/confirm` | public | `AccountTokenRequest` | `204` |
| POST | `/api/auth/password-reset/request` | public | `AccountEmailRequest` | `202` |
| POST | `/api/auth/password-reset/confirm` | public | `PasswordResetConfirmRequest` | `204` |
| POST | `/api/documents/upload` | verified JWT | multipart | `202 DocumentUploadResponse` |
| GET | `/api/documents/{jobId}/status` | JWT | — | `200 DocumentStatusResponse` |
| GET | `/api/documents/{jobId}/download` | JWT | — | file stream |
| GET | `/api/documents/history?page=0&size=20` | JWT | query, `size` 1–100 | `200 DocumentHistoryResponse` |
| GET | `/api/profile` | JWT | — | `200 ProfileResponse` |
| PUT | `/api/profile` | JWT | `UpdateProfileRequest` | `200 ProfileResponse` |
| PUT | `/api/profile/avatar` | JWT | multipart `file` | `204` |
| GET | `/api/profile/avatar` | JWT | — | image stream |
| DELETE | `/api/profile/avatar` | JWT | — | `204` |
| GET | `/api/account/usage` | JWT | — | `200 AccountUsageResponse` |
| GET | `/api/account/subscription` | JWT | — | `200 AccountSubscriptionResponse` |
| POST | `/api/account/subscription/cancellation` | JWT | — | `200 SubscriptionCancellationResponse` |
| GET | `/api/subscription-offers` | public | — | `200 SubscriptionOfferResponse[]` |
| POST | `/api/subscription-purchases` | verified JWT | `SubscriptionPurchaseStartRequest` | `201 SubscriptionPurchaseStartResponse` |

### Upload contract

`multipart/form-data` содержит `file`, `source_lang`, `target_lang`. Разрешены
`pdf`, `doc`, `docx`, максимальный размер по умолчанию — 20 MB. Коды языков —
2–3 латинские буквы, регистр нормализуется; исходный и целевой языки должны
различаться.

Отдельного endpoint запуска перевода нет. Успешная загрузка сразу создаёт
асинхронное задание и возвращает `job_id`.

### Скачивание результата

`GET /api/documents/{jobId}/download` требует Bearer JWT владельца задачи.
Успешный ответ — бинарный файл с Content-Type и Content-Disposition
(`translation-{jobId}.{format}`). Frontend использует имя из заголовка;
если заголовок отсутствует, берёт имя оригинала с суффиксом языка перевода.
Файл скачивается через временный Blob URL, который освобождается после запуска
сохранения. Токен не помещается в ссылку или имя файла.

Кнопка активна только для задачи DONE с job_id. Во время запроса она показывает
«Скачиваем…»; повторные клики заблокированы. Смена книги или выход отменяет запрос.
Скачивание использует общую обработку обновления JWT и один повтор после 401.
Ошибки: 404 — задача не найдена/не принадлежит пользователю, 409 — результат
не готов, 410 — результат удалён по сроку хранения. Также обрабатываются
403, 429 с Retry-After, сетевые ошибки и недоступность сервера.

## Статусы перевода

- `PENDING` — принято и ожидает ML worker.
- `PROCESSING` — перевод выполняется.
- `DONE` — результат готов к скачиванию.
- `FAILED` — перевод завершился ошибкой.

Единственный текущий публичный `error_code`: `TRANSLATION_FAILED`. Статус нужно
проверять polling-запросами; WebSocket и SSE backend не реализует.

## Ошибки

Все REST-ошибки имеют один wire-format:

```json
{
  "timestamp": "2026-10-02T10:15:30Z",
  "status": 400,
  "message": "Ошибка валидации запроса",
  "path": "/api/auth/register",
  "fieldErrors": {
    "email": "must be a well-formed email address"
  },
  "correlation_id": "request-correlation-id"
}
```

Frontend должен учитывать `400`, `401`, `403`, `404`, `409`, `410`, `413`,
`415`, `429`, `500`, `503`. Для `429` и части `503` backend возвращает
`Retry-After`; correlation ID также доступен в заголовке `X-Correlation-ID`.

## OpenAPI

OpenAPI выключен по умолчанию. После запуска с
`OPENAPI_DOCS_ENABLED=true` доступны `/v3/api-docs` и
`/swagger-ui.html` (ресурс UI также доступен как `/swagger-ui/index.html`). Без
`OPENAPI_PUBLIC_ACCESS=true` они требуют JWT.

## Известный разрыв контракта с UI

`DocumentHistoryItemResponse` не содержит исходное имя файла. После перехода
Sidebar на реальные данные он сможет показывать только формат и `job_id`, пока
backend-команда не добавит безопасное display-name поле или не согласует другой
источник названия. Frontend не должен выдумывать `file_name` в DTO.

REST API не отдаёт отдельный preview или извлечённый текст и не позволяет скачать
исходник. Frontend отображает оригинал из локального File, а перевод получает
через существующий download endpoint после DONE и разбирает в браузере.
После перезагрузки оригинал нужно выбрать снова; это не создаёт новую задачу.
Для восстановления оригинала без ручного выбора нужен отдельный backend endpoint.
Реализованный поток и ограничения форматов: [просмотр документов](real-document-viewer.md).

Backend формирует email-ссылки на `/verify-email?token=...` и
`/reset-password?token=...`. Эти frontend-маршруты и API-запросы реализованы.
Доставка писем зависит от SMTP-настроек backend.
