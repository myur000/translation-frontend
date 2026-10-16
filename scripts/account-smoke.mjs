import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const accountRequests = []
let used = 2
let status = 'PENDING'
let quotaDenied = false
let unavailable = false
let pro = false
let uploadCount = 0
page.on('pageerror', (error) => errors.push(error.message))

await context.addInitScript(() => {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const token = encode({ alg: 'HS256' }) + '.' + encode({
    sub: 'account-test', email: 'account@example.com', email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }) + '.signature'
  sessionStorage.setItem('doctranslate.auth.session.v1', JSON.stringify({
    accessToken: token, email: 'account@example.com', emailVerified: true, expiresAt: Date.now() + 3_600_000,
  }))
})
await context.route((url) => url.pathname.startsWith('/api/'), async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path.startsWith('/api/account/')) {
    accountRequests.push({ path, method: request.method(), authorization: request.headers().authorization })
    if (path.endsWith('/usage')) {
      if (unavailable) return route.fulfill({ status: 503, json: {} })
      return route.fulfill({ json: {
        plan_code: pro ? 'PRO' : 'FREE', plan_display_name: pro ? 'Pro' : 'Free',
        feature_code: 'DOCUMENT_TRANSLATION', period_type: 'MONTH', unlimited: pro,
        limit_units: pro ? null : 10, used_units: used, remaining_units: pro ? null : Math.max(0, 10 - used),
        resets_at: '2026-11-01T00:00:00Z',
      } })
    }
    return route.fulfill({ json: {
      plan_code: pro ? 'PRO' : 'FREE', plan_display_name: pro ? 'Pro' : 'Free',
      status: pro ? 'ACTIVE' : 'FREE', cancel_at_period_end: pro,
      current_period_start: pro ? '2026-10-01T00:00:00Z' : null,
      current_period_end: pro ? '2026-11-01T00:00:00Z' : null,
    } })
  }
  if (path === '/api/profile') return route.fulfill({ json: { email: 'account@example.com', display_name: 'Reader' } })
  if (path === '/api/documents/history') return route.fulfill({ json: { items: [] } })
  if (path === '/api/documents/upload') {
    uploadCount += 1
    used = quotaDenied ? 10 : 3
    return quotaDenied ? route.fulfill({ status: 429, json: {
      timestamp: new Date().toISOString(), status: 429, error: 'Too Many Requests',
      message: 'Лимит использования функции на текущий период исчерпан', path, fieldErrors: {}, correlation_id: 'account-test',
    } }) : route.fulfill({ json: { job_id: '00000000-0000-0000-0000-000000000901' } })
  }
  if (path.endsWith('/status')) {
    return route.fulfill({ json: {
      job_id: '00000000-0000-0000-0000-000000000901',
      status, progress: 0, error_code: status === 'FAILED' ? 'TEST_FAILURE' : null,
      error_message: status === 'FAILED' ? 'Test translation failed' : null,
    } })
  }
  return route.fulfill({ status: path.endsWith('/logout') ? 204 : 401, body: '' })
})

try {
  const baseUrl = process.env.ACCOUNT_TEST_URL ?? 'http://localhost:3000/'
  await page.goto(new URL('/plans', baseUrl).href)
  await page.getByText('Осталось переводов: 8', { exact: true }).waitFor()
  assert.equal(await page.getByText(/^Осталось:/).count(), 0)
  await page.getByRole('link', { name: 'Вернуться к рабочей области' }).click()
  assert.equal(await page.getByText(/^Осталось переводов:/).count(), 0)
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'limits-test.doc', mimeType: 'application/msword', buffer: Buffer.from('local DOC fixture'),
  })
  const uploadRefresh = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/account/usage')
  await page.getByRole('button', { name: 'Перевести', exact: true }).click()
  assert.equal((await (await uploadRefresh).json()).remaining_units, 7)
  const completionRefresh = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/account/usage')
  status = 'FAILED'
  assert.equal((await (await completionRefresh).json()).remaining_units, 7)
  await page.getByRole('button', { name: 'Повторить', exact: true }).waitFor()
  quotaDenied = true
  const rejectionRefresh = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/account/usage')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  assert.equal((await (await rejectionRefresh).json()).remaining_units, 0)
  assert.equal(await page.getByText(/^Осталось:/).count(), 0)
  await page.getByText(/Лимит переводов на текущий период исчерпан/).waitFor()
  assert.equal(uploadCount, 2, 'A quota rejection must not automatically reupload')

  await page.getByRole('button', { name: 'Открыть меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Тариф и лимиты' }).click()
  await page.getByRole('heading', { name: 'Тариф и лимиты' }).waitFor()
  await page.getByText('Осталось переводов: 0', { exact: true }).waitFor()
  assert.equal(await page.getByRole('progressbar').getAttribute('value'), '10')
  await page.getByText(/Уже загруженные книги остаются/).waitFor()
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/plans-free.png', fullPage: true })

  unavailable = true
  await page.getByRole('button', { name: 'Обновить данные' }).click()
  await page.getByText(/они могут быть устаревшими/).first().waitFor()
  await page.getByText('Осталось переводов: 0', { exact: true }).waitFor()
  unavailable = false
  pro = true
  await page.getByRole('button', { name: 'Обновить данные' }).click()
  await page.getByText('Активна', { exact: true }).waitFor()
  await page.getByText('Подписка будет отменена в конце текущего периода.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('progressbar').count(), 0)
  assert.equal(await page.getByText(/Осталось переводов:/).count(), 0)

  await page.getByRole('button', { name: 'Открыть меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Настройки' }).click()
  await page.getByLabel('Тёмная', { exact: false }).check()
  await page.getByLabel('English', { exact: false }).check()
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menuitem', { name: 'Plan and limits' }).click()
  await page.getByRole('heading', { name: 'Plan and limits' }).waitFor()
  await page.screenshot({ path: 'test-results/plans-pro-dark-en.png', fullPage: true })
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      'Plans page must not overflow horizontally at width ' + width)
    await page.getByRole('button', { name: 'Refresh data' }).click()
    await page.getByText('Active', { exact: true }).waitFor()
  }
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menuitem', { name: 'Plan and limits' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.screenshot({ path: 'test-results/plans-mobile.png', fullPage: true })
  await page.getByRole('link', { name: 'Back to workspace' }).click()
  await page.getByRole('button', { name: 'Open user menu' }).waitFor()
  assert.ok(await page.getByText('limits-test.doc', { exact: true }).count())
  assert.ok(accountRequests.length >= 8)
  assert.ok(accountRequests.every(({ method, authorization }) => method === 'GET' && authorization?.startsWith('Bearer ')))
  assert.deepEqual(errors, [])
  console.log('PASS: server quota refresh after upload and terminal status (no invented refund), rejected upload, plan menu, zero/unlimited, retry/stale, RU/EN, dark theme, responsive layout, workspace return; account requests are authenticated GETs.')
} catch (error) {
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/plans-failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
}
