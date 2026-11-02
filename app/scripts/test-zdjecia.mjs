// Zdjęcia w treści: w tekście zostaje krótki odnośnik, a zdjęcie przeżywa
// odświeżenie i trafia do danych kopii zapasowej.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// duży obraz: program ma go zmniejszyć
const png = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 3000
  c.height = 1500
  const x = c.getContext('2d')
  x.fillStyle = '#c2612c'
  x.fillRect(0, 0, 3000, 1500)
  return c.toDataURL('image/png').split(',')[1]
})
const plik = { name: 'wykres.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Ze zdjeciem')
await page.waitForSelector('.rich-content .tiptap')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Tekst przed')
await page.setInputFiles('.rich-toolbar .rich-plik', plik)
await page.waitForSelector('.rich-content .tiptap img')
await page.waitForTimeout(1000)

const obraz = () => page.evaluate(() => {
  const i = document.querySelector('.rich-content .tiptap img, .markdown-body img')
  return i && { w: i.naturalWidth, h: i.naturalHeight, wid: i.getBoundingClientRect().width }
})
const r = await obraz()
check('zdjęcie widać w edytorze', r?.w > 0)
check('duże zdjęcie jest zmniejszone', r?.w === 1600 && r?.h === 800, `${r?.w}x${r?.h}`)
check('zdjęcie nie wychodzi poza kafelek', r?.wid <= 1000, String(r?.wid))

// wklejenie ze schowka
await page.click('.rich-content .tiptap')
await page.keyboard.press('ArrowRight')
await page.evaluate(async (b64) => {
  const bajty = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const dt = new DataTransfer()
  dt.items.add(new File([bajty], 'image.png', { type: 'image/png' }))
  const wklej = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
  // Firefox pomija schowek podany przy tworzeniu zdarzenia
  Object.defineProperty(wklej, 'clipboardData', { value: dt })
  document.querySelector('.rich-content .tiptap').dispatchEvent(
    wklej,
  )
}, png)
await page.waitForFunction(() => document.querySelectorAll('.rich-content .tiptap img').length === 2, null, { timeout: 8000 }).catch(() => {})
check('zdjęcie da się wkleić', (await page.locator('.rich-content .tiptap img').count()) === 2)

const baza = () => page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const wez = (t) => new Promise((r) => {
    const q = db.transaction(t).objectStore(t).getAll()
    q.onsuccess = () => r(q.result)
  })
  const [obrazy, versions] = [await wez('obrazy'), await wez('versions')]
  db.close()
  return { obrazy: obrazy.map((o) => o.dane.slice(0, 15)), tresci: versions.map((v) => v.content) }
})
await page.waitForTimeout(1500)
const d = await baza()
check('zdjęcia leżą w osobnej tabeli', d.obrazy.length === 2 && d.obrazy[0].startsWith('data:image/'), d.obrazy.join(' '))
const tresc = d.tresci.find((t) => t.includes('Tekst przed')) ?? ''
check('w tekście stoi krótki odnośnik', /!\[[^\]]*\]\(obraz:[0-9a-f-]+\)/.test(tresc) && tresc.length < 400, tresc.slice(0, 120))
check('tekst obok zdjęcia został', tresc.includes('Tekst przed'))

await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(800)
await page.click('.concept-item:has-text("Ze zdjeciem")')
await page.waitForSelector('.rich-content .tiptap img, .markdown-body img')
await page.waitForTimeout(500)
const poOdswiezeniu = await obraz()
check('zdjęcie zostaje po odświeżeniu', poOdswiezeniu?.w === 1600, String(poOdswiezeniu?.w))

// w Linii i Skrypcie
await page.click('.btn-close[title*="Zamknij kafelek"]')
await nowaSciezka(page, 'Sciezka ze zdjeciem')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Ze zdjeciem")', '.linear-append')
await page.waitForTimeout(800)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body img')
await page.waitForTimeout(500)
check('Skrypt pokazuje zdjęcie',
  await page.evaluate(() => document.querySelector('.script-body img').naturalWidth === 1600))

// kopia zapasowa niesie zdjęcia razem z resztą danych
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Dane")')
const [pobrane] = await Promise.all([
  page.waitForEvent('download'),
  page.click('button:has-text("Eksportuj kopię")'),
])
const JSZip = (await import('jszip')).default
const { readFileSync, rmSync } = await import('node:fs')
await pobrane.saveAs('scripts/zdjecia-backup.zip')
const kopia = await JSZip.loadAsync(readFileSync('scripts/zdjecia-backup.zip'))
rmSync('scripts/zdjecia-backup.zip')
const daneKopii = JSON.parse(await kopia.file('dane.json').async('string'))
check('kopia zapasowa zawiera zdjęcia', daneKopii.obrazy?.length === 2 && daneKopii.obrazy[0].dane.startsWith('data:image/'))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
if (problems.length || errors.length) process.exit(1)
