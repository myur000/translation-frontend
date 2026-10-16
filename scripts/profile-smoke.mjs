import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const writes = []
let failSave = false
let failAvatar = false
let failLogoutAll = false
let logoutAllRequests = 0
let avatarRequests = []
let avatarBytes = null
let stored = {
  user_id: '00000000-0000-0000-0000-000000000950', email: 'profile@example.com',
  username: 'Reader_1', display_name: 'Reader', nickname: 'Nick', profession: 'Developer',
  bio: 'Profile fixture', has_avatar: false, created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}
page.on('pageerror', (error) => errors.push(error.message))
await context.addInitScript(() => {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const token = encode({ alg: 'HS256' }) + '.' + encode({
    sub: 'profile-test', email: 'profile@example.com', email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }) + '.signature'
  sessionStorage.setItem('doctranslate.auth.session.v1', JSON.stringify({
    accessToken: token, email: 'profile@example.com', emailVerified: true, expiresAt: Date.now() + 3_600_000,
  }))
})
await context.route((url) => url.pathname.startsWith('/api/'), async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/profile/avatar') {
    assert.ok(request.headers().authorization?.startsWith('Bearer '))
    avatarRequests.push(request.method())
    if (request.method() === 'GET') {
      return avatarBytes ? route.fulfill({ body: avatarBytes, contentType: 'image/png' })
        : route.fulfill({ status: 404, body: '' })
    }
    if (failAvatar) return route.fulfill({ status: 500, json: {} })
    if (request.method() === 'PUT') {
      assert.ok(request.headers()['content-type'].startsWith('multipart/form-data; boundary='))
      assert.ok(request.postDataBuffer().includes(Buffer.from('name="file"')))
      // Backend normalizes bytes; the fixture represents the returned canonical image.
      stored = { ...stored, has_avatar: true }
      return route.fulfill({ status: 204, body: '' })
    }
    assert.equal(request.method(), 'DELETE')
    avatarBytes = null
    stored = { ...stored, has_avatar: false }
    return route.fulfill({ status: 204, body: '' })
  }
  if (path === '/api/auth/logout-all') {
    assert.equal(request.method(), 'POST')
    assert.ok(request.headers().authorization?.startsWith('Bearer '))
    logoutAllRequests++
    return route.fulfill({ status: failLogoutAll ? 500 : 204, body: '' })
  }
  if (path === '/api/profile') {
    assert.ok(request.headers().authorization?.startsWith('Bearer '))
    if (request.method() === 'PUT') {
      const body = request.postDataJSON()
      writes.push(body)
      assert.deepEqual(Object.keys(body).sort(), ['bio', 'display_name', 'nickname', 'profession', 'username'])
      if (failSave) return route.fulfill({ status: 500, json: {} })
      stored = { ...stored, ...body, updated_at: '2026-10-09T00:00:00Z' }
    } else assert.equal(request.method(), 'GET')
    return route.fulfill({ json: stored })
  }
  if (path === '/api/documents/history') return route.fulfill({ json: { items: [] } })
  if (path === '/api/account/usage') return route.fulfill({ json: {
    plan_code: 'FREE', plan_display_name: 'Free', feature_code: 'DOCUMENT_TRANSLATION', period_type: 'MONTH',
    unlimited: false, limit_units: 5, used_units: 0, remaining_units: 5, resets_at: '2026-11-01T00:00:00Z',
  } })
  if (path === '/api/account/subscription') return route.fulfill({ json: {
    plan_code: 'FREE', plan_display_name: 'Free', status: 'FREE',
    current_period_start: null, current_period_end: null, cancel_at_period_end: false,
  } })
  return route.fulfill({ status: path.endsWith('/logout') ? 204 : 401, body: '' })
})

try {
  const base = process.env.PROFILE_TEST_URL ?? 'http://localhost:3000/'
  await page.goto(base)
  await page.getByRole('button', { name: 'Открыть меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Профиль' }).click()
  await page.getByRole('heading', { name: 'Профиль', exact: true }).waitFor()
  await page.getByLabel('Имя', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Email', { exact: true }).getAttribute('readonly'), '')
  assert.equal(await page.getByRole('button', { name: 'Сохранить', exact: true }).isDisabled(), true)

  assert.equal(await page.getByRole('textbox').count(), 2)
  for (const label of ['Имя пользователя', 'Никнейм', 'Профессия', 'О себе']) {
    assert.equal(await page.getByLabel(label, { exact: true }).count(), 0)
  }
  assert.equal(await page.getByLabel('Имя', { exact: true }).getAttribute('maxlength'), '80')
  await page.getByLabel('Имя', { exact: true }).evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'x'.repeat(81))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText('Не больше 80 символов.', { exact: true }).waitFor()
  assert.equal(writes.length, 0)
  await page.getByRole('button', { name: 'Отменить изменения' }).click()

  await page.getByLabel('Имя', { exact: true }).fill('  Кирилл  ')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText('Профиль сохранён.', { exact: true }).waitFor()
  assert.equal(stored.display_name, 'Кирилл')
  assert.deepEqual(writes[0], {
    display_name: 'Кирилл', username: 'Reader_1', nickname: 'Nick',
    profession: 'Developer', bio: 'Profile fixture',
  })
  assert.equal(stored.username, 'Reader_1')
  assert.equal(stored.email, 'profile@example.com')
  assert.ok((await page.getByRole('button', { name: 'Открыть меню пользователя' }).textContent()).includes('Кирилл'))
  await mkdir('test-results', { recursive: true })
  // Generate only an isolated test image, never upload to the real backend.
  const imageData = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 80
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#315b88'
    ctx.fillRect(0, 0, 80, 80)
    ctx.fillStyle = '#ffffff'
    ctx.font = '40px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('K', 40, 42)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const photo = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(imageData, 'base64') }
  await page.getByLabel('Имя', { exact: true }).fill('Avatar draft')
  await page.getByLabel('Выбрать файл аватара').setInputFiles({
    name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  })
  await page.getByText('Размер изображения не должен превышать 2 МБ.', { exact: true }).waitFor()
  assert.equal(avatarRequests.length, 0)
  avatarBytes = photo.buffer
  await page.getByLabel('Выбрать файл аватара').setInputFiles(photo)
  await page.getByAltText('Аватар пользователя', { exact: true }).waitFor()
  await page.waitForFunction(() => Array.from(document.images).filter((img) => img.src.startsWith('blob:'))
    .every((img) => img.complete && img.naturalWidth > 0))
  assert.equal(await page.locator('img[src^="blob:"]').count(), 2)
  assert.equal(await page.getByLabel('Имя', { exact: true }).inputValue(), 'Avatar draft')
  const firstAvatarUrl = await page.getByAltText('Аватар пользователя').getAttribute('src')
  await page.getByLabel('Выбрать файл аватара').setInputFiles(photo)
  await page.waitForFunction((oldUrl) => document.querySelector('img[alt="Аватар пользователя"]')?.getAttribute('src') !== oldUrl, firstAvatarUrl)
  await page.getByAltText('Аватар пользователя', { exact: true }).waitFor()
  failAvatar = true
  await page.getByRole('button', { name: 'Удалить фото', exact: true }).click()
  await page.getByText(/Не удалось подтвердить изменение фото/).waitFor()
  assert.equal(await page.locator('img[src^="blob:"]').count(), 2)
  failAvatar = false
  await page.getByRole('button', { name: 'Удалить фото', exact: true }).click()
  await page.getByText('Фото профиля удалено.', { exact: true }).waitFor()
  assert.equal(await page.locator('img[src^="blob:"]').count(), 0)
  avatarBytes = photo.buffer
  await page.getByLabel('Выбрать файл аватара').setInputFiles(photo)
  await page.getByAltText('Аватар пользователя', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Отменить изменения' }).click()
  assert.equal(await page.getByLabel('Имя', { exact: true }).inputValue(), 'Кирилл')
  await page.screenshot({ path: 'test-results/profile-light.png', fullPage: true })

  await page.getByLabel('Имя', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText('Профиль сохранён.', { exact: true }).waitFor()
  assert.deepEqual(writes[1], { ...writes[0], display_name: null })
  await page.getByLabel('Имя', { exact: true }).fill('Кирилл')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText('Профиль сохранён.', { exact: true }).waitFor()


  await page.reload()
  await page.getByLabel('Имя', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Имя', { exact: true }).inputValue(), 'Кирилл')
  failSave = true
  await page.getByLabel('Имя', { exact: true }).fill('Unsaved draft')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText(/Не удалось подтвердить сохранение/).waitFor()
  assert.equal(await page.getByLabel('Имя', { exact: true }).inputValue(), 'Unsaved draft')
  await page.getByRole('button', { name: 'Отменить изменения' }).click()
  assert.equal(await page.getByLabel('Имя', { exact: true }).inputValue(), 'Кирилл')
  failSave = false

  await page.getByRole('button', { name: 'Открыть меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Настройки' }).click()
  await page.getByLabel('Тёмная', { exact: false }).check()
  await page.getByLabel('English', { exact: false }).check()
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menuitem', { name: 'Profile' }).click()
  await page.getByLabel('Name', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Кирилл')
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  await page.screenshot({ path: 'test-results/profile-dark-en.png', fullPage: true })
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  }
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menuitem', { name: 'Profile' }).click()
  await page.screenshot({ path: 'test-results/profile-mobile.png', fullPage: true })
  await page.getByRole('link', { name: 'Back to workspace' }).click()
  await page.getByRole('button', { name: 'Open user menu' }).waitFor()
  assert.equal(await page.getByText(/^Осталось:|^Remaining:/).count(), 0)
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menuitem', { name: 'Profile' }).click()
  await page.getByRole('button', { name: 'Sign out on all devices', exact: true }).click()
  let dialog = page.getByRole('alertdialog')
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Cancel' }).evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(), 0)
  assert.equal(logoutAllRequests, 0)
  await page.getByRole('button', { name: 'Sign out on all devices', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  assert.equal(logoutAllRequests, 0)
  await page.getByRole('button', { name: 'Sign out on all devices', exact: true }).click()
  dialog = page.getByRole('alertdialog')
  failLogoutAll = true
  await dialog.getByRole('button', { name: 'Sign out everywhere', exact: true }).click()
  await dialog.getByText('Could not end all sessions. Please try again.', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Кирилл')
  await page.screenshot({ path: 'test-results/profile-logout-confirm.png', fullPage: true })
  failLogoutAll = false
  await dialog.getByRole('button', { name: 'Sign out everywhere', exact: true }).click()
  await page.waitForURL('**/login')
  assert.equal(logoutAllRequests, 2)
  assert.deepEqual(errors, [])
  console.log('PASS: profile menu, readonly email, simplified name-only form, validation, authenticated full PUT, hidden fields preserved on save/clear, immediate menu update, reload, failed save/draft reset, RU/EN, dark theme, mobile layout, avatar upload/replace/delete, JPEG/PNG limit, draft preserved, confirmation/cancel/Escape, failed logout retry, successful logout-all.')
} catch (error) {
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/profile-failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
}
