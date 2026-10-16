import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import JSZip from 'jszip'

function pdfFixture(label) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (let page = 1; page <= 3; page += 1) {
    const streamId = objects.length + 2
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`)
    const text = `BT /F1 20 Tf 60 710 Td (${label} real PDF page ${page}) Tj 0 -45 Td (Real file content, not a mock page.) Tj ET`
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`)
  }
  let content = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content))
    content += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const start = Buffer.byteLength(content)
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  content += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(content)
}

async function docxFixture() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:t>Real DOCX fixture</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table cell from DOCX</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="image1"/></pic:blipFill><pic:spPr><a:xfrm><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>')
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="image1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/></Relationships>')
  zip.file('word/media/image.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==', 'base64'))
  return zip.generateAsync({ type: 'nodebuffer' })
}

const originalPdf = pdfFixture('Original')
const translatedPdf = pdfFixture('Translated')
const docx = await docxFixture()
const jobs = ['pdf', 'docx', 'doc', 'pdf', 'pdf'].map((format, index) => ({
  job_id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  source_lang: 'en', target_lang: 'ru', format,
  status: index === 4 ? 'PENDING' : 'DONE', progress: index === 4 ? 0 : 100,
  created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
  error_code: null, error_message: null,
}))
const names = ['book.pdf', 'notes.docx', 'legacy.doc', 'broken.pdf', 'waiting.pdf']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const resourceErrors = []
const downloadHeaders = []
let uploaded = 0
let broken = true
let pendingStatus = 'PENDING'
let statusChecks = 0
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') resourceErrors.push(message.text()) })
page.on('requestfailed', (request) => resourceErrors.push(`${request.url()}: ${request.failure()?.errorText}`))
await context.addInitScript(({ jobs, names }) => {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'viewer-test', email: 'viewer@example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`
  sessionStorage.setItem('doctranslate.auth.session.v1', JSON.stringify({ accessToken: token, email: 'viewer@example.com', emailVerified: true, expiresAt: Date.now() + 3_600_000 }))
  sessionStorage.setItem('doctranslate.document-metadata.v1.viewer@example.com', JSON.stringify(Object.fromEntries(jobs.map((job, index) => [job.job_id, { name: names[index], documentId: job.job_id }]))))
}, { jobs, names })
await context.route((url) => url.pathname.startsWith('/api/'), async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/account/usage') return route.fulfill({ json: {
    plan_code: 'FREE', plan_display_name: 'Free', feature_code: 'DOCUMENT_TRANSLATION',
    period_type: 'MONTH', unlimited: false, limit_units: 10, used_units: 3,
    remaining_units: 7, resets_at: '2026-11-01T00:00:00Z',
  } })
  if (path === '/api/account/subscription') return route.fulfill({ json: {
    plan_code: 'FREE', plan_display_name: 'Free', status: 'FREE',
    current_period_start: null, current_period_end: null, cancel_at_period_end: false,
  } })
  if (path === '/api/profile') return route.fulfill({ json: { email: 'viewer@example.com', username: 'Viewer' } })
  if (path === '/api/documents/history') return route.fulfill({ json: { items: jobs, page: 0, size: 100, total_elements: jobs.length, total_pages: 1, first: true, last: true } })
  if (path.endsWith('/status') && path.includes(jobs[4].job_id)) {
    statusChecks += 1
    return route.fulfill({ json: {
      job_id: jobs[4].job_id, status: pendingStatus, progress: pendingStatus === 'DONE' ? 100 : 0,
      error_code: null, error_message: null,
    } })
  }
  if (path.endsWith('/download')) {
    downloadHeaders.push(request.headers().authorization)
    const index = jobs.findIndex((job) => path.includes(job.job_id))
    if (index === 3 && broken) return route.fulfill({ contentType: 'text/html', body: '<html>Proxy error</html>' })
    const body = index === 1 ? docx : translatedPdf
    const name = index === 1 ? 'translation.docx' : index === 2 ? 'translation.doc' : 'translation.pdf'
    return route.fulfill({ contentType: index === 1 ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf', headers: { 'Content-Disposition': `attachment; filename="${name}"` }, body })
  }
  if (path === '/api/documents/upload') uploaded += 1
  return route.fulfill({ status: path.endsWith('logout') ? 204 : 401, body: '' })
})

try {
  await page.goto(process.env.VIEWER_TEST_URL ?? 'http://localhost:3000/')
  const original = () => page.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })
  const translation = () => page.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
  await translation().getByText('Translated real PDF page 1', { exact: true }).waitFor()
  await original().getByLabel('Выбрать исходный файл').setInputFiles({ name: 'book.pdf', mimeType: 'application/pdf', buffer: originalPdf })
  await original().getByText('Original real PDF page 1', { exact: true }).waitFor()
  assert.equal(await page.getByText('1 / 3', { exact: true }).count(), 1)
  const painted = await original().locator('canvas').first().evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 100 && pixels[index + 3] > 0) return true
    return false
  })
  assert.equal(painted, true, 'PDF canvas must contain actual drawn text')
  await original().evaluate((element) => {
    for (let index = 0; index < 10; index++) element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: true, deltaY: -1,
    }))
  })
  await page.waitForFunction(() => document.querySelector('[aria-label="Прокрутка панели «Оригинал»"]')?.dataset.zoom === '101')
  assert.equal(await translation().getAttribute('data-zoom'), '100', 'A fine pinch must affect only the selected panel while sync is off')
  await original().evaluate((element) => {
    for (let index = 0; index < 30; index++) element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100,
    }))
  })
  await page.waitForFunction(() => document.querySelector('[aria-label="Прокрутка панели «Оригинал»"]')?.dataset.zoom === '106')
  await page.getByRole('button', { name: 'Сбросить масштаб «Оригинал»' }).click()
  await page.getByRole('button', { name: 'Следующая страница' }).click()
  await page.getByText('2 / 3', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Предыдущая страница' }).click()
  for (let index = 0; index < 6; index += 1) await page.getByRole('button', { name: 'Увеличить масштаб «Оригинал»' }).click()
  await page.keyboard.press('f')
  await original().evaluate((element) => { element.scrollTop = 600; element.scrollLeft = 130; element.dispatchEvent(new Event('scroll', { bubbles: true })) })
  const before = await original().evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }))
  await page.keyboard.press('d')
  await page.keyboard.press('g')
  assert.equal(await translation().getAttribute('data-zoom'), '100')
  await page.keyboard.press('f')
  assert.equal(await original().getAttribute('data-zoom'), '160')
  await page.waitForFunction((before) => {
    const element = document.querySelector('[aria-label="Прокрутка панели «Оригинал»"]')
    return element && Math.abs(element.scrollTop - before.top) < 8 && Math.abs(element.scrollLeft - before.left) < 8
  }, before)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/viewer-pdf.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Включить синхронную прокрутку' }).click()
  await page.keyboard.press('d')
  await original().evaluate((element) => { element.scrollTop = 700; element.dispatchEvent(new Event('scroll', { bubbles: true })) })
  await original().evaluate((element) => {
    for (let index = 0; index < 10; index++) element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, ctrlKey: true, deltaY: -1,
    }))
  })
  await page.waitForFunction(() => document.querySelector('[aria-label="Прокрутка панели «Оригинал»"]')?.dataset.zoom === '161')
  const progress = await original().evaluate((element) => element.scrollTop / (element.scrollHeight - element.clientHeight))
  await page.keyboard.press('g')
  assert.equal(await translation().getAttribute('data-zoom'), '161')
  await page.waitForFunction((progress) => {
    const element = document.querySelector('[aria-label="Прокрутка панели «Перевод»"]')
    return element && Math.abs(element.scrollTop / (element.scrollHeight - element.clientHeight) - progress) < 0.03
  }, progress)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /notes.docx/ }).click()
  await translation().getByText('Real DOCX fixture', { exact: true }).waitFor()
  await translation().getByText('Table cell from DOCX', { exact: true }).waitFor()
  assert.equal(await translation().locator('img').count(), 1)
  assert.ok(await translation().locator('img').evaluate(async (image) => {
    await image.decode()
    return image.naturalWidth > 0
  }), 'Embedded DOCX image must actually decode, not just exist in the DOM')
  assert.equal(await page.getByRole('button', { name: 'Следующая страница' }).isDisabled(), true)
  await original().getByLabel('Выбрать исходный файл').setInputFiles({ name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx })
  await original().getByText('Real DOCX fixture', { exact: true }).waitFor()
  await page.screenshot({ path: 'test-results/viewer-docx.png' })
  await page.getByRole('button', { name: /legacy.doc/ }).click()
  await translation().getByText(/Предпросмотр старого формата DOC/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Скачать', exact: true }).isEnabled(), true)
  await page.getByRole('button', { name: /broken.pdf/ }).click()
  await translation().getByText(/Не удалось прочитать документ/).waitFor()
  broken = false
  await translation().getByRole('button', { name: 'Повторить загрузку' }).click()
  await translation().getByText('Translated real PDF page 1', { exact: true }).waitFor()
  await page.getByRole('button', { name: /waiting.pdf/ }).click()
  await translation().getByText(/Документ в очереди и ждёт обработки/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Ожидает обработки', exact: true }).isDisabled(), true)
  await page.clock.install()
  await page.clock.fastForward(121_000)
  await translation().getByText(/Автопроверка приостановлена/).waitFor()
  const checksAtPause = statusChecks
  await page.clock.fastForward(10_000)
  assert.equal(statusChecks, checksAtPause, 'Paused waiting must stop automatic status requests')
  pendingStatus = 'DONE'
  await translation().getByRole('button', { name: 'Проверить статус', exact: true }).click()
  await translation().getByText('Translated real PDF page 1', { exact: true }).waitFor()
  await page.getByRole('complementary').locator('input[type="file"]').setInputFiles({
    name: 'local-draft.pdf', mimeType: 'application/pdf', buffer: originalPdf,
  })
  await original().getByText('Original real PDF page 1', { exact: true }).waitFor()
  await translation().getByText(/Перевод появится после отправки книги/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Перевести', exact: true }).isEnabled(), true)
  assert.equal(uploaded, 0, 'Selecting an original must never submit a new translation job')
  assert.ok(downloadHeaders.every((header) => header?.startsWith('Bearer ')), 'Preview downloads must use Bearer JWT')
  assert.deepEqual(errors, [], 'The real browser must have no uncaught application errors')
  console.log('PASS: real PDF/DOCX, trackpad micro-deltas/burst guard, fullscreen zoom/scroll sync, JWT, local originals, waiting timeout and late DONE without resubmission.')
} catch (error) {
  console.error('Viewer diagnostics:', { errors, resourceErrors, body: (await page.locator('body').innerText()).slice(-2200) })
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/viewer-failure.png' })
  throw error
} finally {
  await context.close()
  await browser.close()
}
