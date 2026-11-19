// Układ zdjęcia: rozmiar i położenie ustawione w pasku jadą w treści i wyglądają
// tak samo w kafelku, Linii i Skrypcie, a zdjęcie bez układu zostaje zwykłym obrazkiem.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const png = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 600
  const x = c.getContext('2d')
  x.fillStyle = '#c2612c'
  x.fillRect(0, 0, 1200, 600)
  return c.toDataURL('image/png').split(',')[1]
})
const plik = { name: 'wykres.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }
const DLUGI = 'Dalszy tekst pod zdjeciem. '.repeat(40)

const trescKafelka = () => page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const q = db.transaction('versions').objectStore('versions').getAll()
  await new Promise((r) => (q.onsuccess = r))
  db.close()
  return q.result.map((v) => v.content).find((t) => t.includes('Pierwszy akapit')) ?? ''
})

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Uklad zdjecia')
await page.waitForSelector('.rich-content .tiptap')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Pierwszy akapit')
await page.keyboard.press('Enter')
await page.setInputFiles('.rich-toolbar .rich-plik', plik)
await page.waitForSelector('.rich-content .tiptap img')
await page.waitForTimeout(400)
await page.keyboard.press('Enter')
await page.keyboard.type(DLUGI)
await page.waitForTimeout(500)

const img = '.rich-content .tiptap img[data-obraz]'
const miara = (sel) => page.evaluate((s) => {
  const i = document.querySelector(s)
  const r = i.getBoundingClientRect()
  const k = i.parentElement.getBoundingClientRect()
  const st = getComputedStyle(i)
  return {
    proc: Math.round((r.width / k.width) * 100),
    odLewej: Math.round(r.left - k.left),
    odPrawej: Math.round(k.right - r.right),
    float: st.float,
    display: st.display,
  }
}, sel)

const domyslna = await miara(img)
check('nowe zdjęcie ma domyślną wielkość z Ustawień', domyslna.proc === 60, String(domyslna.proc))

// --- kliknięcie pokazuje pasek ---
await page.click(img)
await page.waitForSelector('.zdjecie-pasek')
check('kliknięcie w zdjęcie pokazuje pasek', await page.locator('.zdjecie-pasek').isVisible())

await page.click('.zdjecie-pasek button:text-is("50")')
await page.waitForTimeout(500)
check('przycisk ustawia rozmiar', (await miara(img)).proc === 50, String((await miara(img)).proc))
check('pasek zostaje po zmianie', await page.locator('.zdjecie-pasek').isVisible())
await page.waitForTimeout(500)
check('rozmiar jest w treści jako zwykły Markdown',
  /!\[wykres\]\(obraz:[0-9a-f-]+ "zdjecie 50%"\)/.test(await trescKafelka()), (await trescKafelka()).slice(0, 90))

// --- wpisany rozmiar ---
await page.fill('.zdjecie-pasek input', '30')
await page.waitForTimeout(300)
check('wpisany rozmiar działa', (await miara(img)).proc === 30, String((await miara(img)).proc))

// --- uchwyt ---
const u = await page.locator('.zdjecie-uchwyt').boundingBox()
await page.mouse.move(u.x + 6, u.y + 6)
await page.mouse.down()
await page.mouse.move(u.x + 56, u.y + 6, { steps: 4 })
await page.mouse.move(u.x + 106, u.y + 6, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(300)
check('uchwyt powiększa zdjęcie', (await miara(img)).proc > 35, String((await miara(img)).proc))

// --- położenia ---
const poloz = (t) => page.click(`.zdjecie-pasek button[title^="${t}"]`)
await page.fill('.zdjecie-pasek input', '40')
await poloz('Na środku')
await page.waitForTimeout(250)
const s = await miara(img)
check('środek', Math.abs(s.odLewej - s.odPrawej) <= 2, `${s.odLewej} / ${s.odPrawej}`)
await poloz('Po prawej, w osobnym')
await page.waitForTimeout(250)
check('prawo', (await miara(img)).odPrawej <= 1)
await poloz('W wierszu')
await page.waitForTimeout(250)
check('w wierszu', (await miara(img)).display === 'inline-block')
await poloz('Po prawej, a tekst')
await page.waitForTimeout(250)
check('opływ z prawej', (await miara(img)).float === 'right')

const obok = (kontener) => page.evaluate((k) => {
  const i = document.querySelector(`${k} img`).getBoundingClientRect()
  const zakres = document.createRange()
  const akapit = [...document.querySelectorAll(`${k} p`)].find((p) => p.textContent.includes('Dalszy tekst'))
  zakres.selectNodeContents(akapit)
  const wiersze = [...zakres.getClientRects()]
  return wiersze.some((w) => w.top < i.bottom && w.bottom > i.top && w.right <= i.left + 1)
}, kontener)
check('tekst opływa zdjęcie w edytorze', await obok('.rich-content .tiptap'))
await page.click(img)
check('opływane zdjęcie nadal daje się kliknąć', await page.locator('.zdjecie-pasek').isVisible())

await page.mouse.click(5, 5)
await page.waitForTimeout(250)
check('kliknięcie poza polem chowa pasek', (await page.locator('.zdjecie-pasek').count()) === 0)

// --- położenie w tekście ---
await page.click(img)
await page.click('.zdjecie-pasek button[title^="Po lewej, w osobnym"]')
await page.waitForTimeout(600)
const zrodlo = await page.locator(img).boundingBox()
const cel = await page.locator('.rich-content .tiptap p:has-text("Pierwszy akapit")').boundingBox()
await page.mouse.move(zrodlo.x + 40, zrodlo.y + 40)
await page.mouse.down()
await page.mouse.move(zrodlo.x + 30, zrodlo.y + 20, { steps: 3 })
await page.mouse.move(cel.x + 1, cel.y + 8, { steps: 6 })
check('pasek chowa się na czas przeciągania', (await page.locator('.zdjecie-pasek').count()) === 0)
await page.mouse.up()
await page.waitForTimeout(900)
const poPrzeciagnieciu = await trescKafelka()
check('zdjęcie daje się przeciągnąć w inne miejsce tekstu',
  poPrzeciagnieciu.indexOf('![') < poPrzeciagnieciu.indexOf('Pierwszy akapit'), poPrzeciagnieciu.slice(0, 80))

await page.click(img)
await page.click('.zdjecie-pasek button[title^="Po prawej, a tekst"]')
await page.waitForTimeout(600)

await page.waitForTimeout(500)
// --- po odświeżeniu ---
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(800)
await page.click('.concept-item:has-text("Uklad zdjecia")')
await page.waitForSelector(img)
await page.waitForTimeout(400)
const poOdsw = await miara(img)
check('układ zostaje po odświeżeniu', poOdsw.proc === 40 && poOdsw.float === 'right', JSON.stringify(poOdsw))

// --- ustawienie domyślne ---
await page.click(img)
await page.click('.zdjecie-pasek .zdjecie-domyslny')
await page.waitForTimeout(600)
await page.click('.zdjecie-pasek button[title^="Po lewej, w osobnym"]')
await page.waitForTimeout(700)
check('bez własnego układu w treści nie zostaje żaden dopisek',
  /!\[wykres\]\(obraz:[0-9a-f-]+\)/.test(await trescKafelka()), (await trescKafelka()).slice(0, 90))
await page.click('.zdjecie-pasek button:text-is("25")')
await page.click('.zdjecie-pasek button[title^="Po prawej, a tekst"]')
await page.waitForTimeout(700)

// --- Linia i Skrypt ---
await page.click('.btn-close[title*="Zamknij kafelek"]')
await nowaSciezka(page, 'Sciezka z ukladem')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Uklad zdjecia")', '.linear-append')
await page.waitForTimeout(600)
await page.click('.linear-append .btn:has-text("Tekst")').catch(() => {})
await page.waitForTimeout(600)

const linia = '.linear-seg img'
await page.waitForSelector(linia)
const wLinii = await miara(linia)
check('Linia pokazuje ten sam układ', wLinii.proc === 25 && wLinii.float === 'right', JSON.stringify(wLinii))

await page.click(linia)
await page.waitForSelector('.zdjecie-pasek', { timeout: 3000 }).catch(() => {})
check('w Linii kliknięcie w zdjęcie od razu daje pasek', await page.locator('.zdjecie-pasek').isVisible())
await page.click('.zdjecie-pasek button:text-is("50")')
await page.waitForTimeout(600)
check('w Linii rozmiar się zmienia', (await miara(linia)).proc === 50, String((await miara(linia)).proc))

await page.locator(linia).click({ button: 'right' })
await page.waitForTimeout(300)
check('prawy przycisk na zdjęciu pokazuje jego pasek, a nie menu kafelka',
  (await page.locator('.zdjecie-pasek').isVisible()) && (await page.locator('.linear-menu').count()) === 0)
await page.mouse.click(5, 5)
await page.waitForTimeout(500)

check('zmiana w ścieżce nie rusza kafelka w bibliotece', (await trescKafelka()).includes('"zdjecie 25% oplyw-prawo"'))

await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body img')
await page.waitForTimeout(400)
const wSkrypcie = await miara('.script-body img')
check('Skrypt pokazuje ten sam układ', wSkrypcie.proc === 50 && wSkrypcie.float === 'right', JSON.stringify(wSkrypcie))
check('tekst opływa zdjęcie w Skrypcie', await obok('.script-body'))

// --- domyślna wielkość z Ustawień ---
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Tekst")')
await page.waitForSelector('.settings-row:has-text("Domyślna wielkość zdjęć")')
await page.fill('.settings-row:has-text("Domyślna wielkość zdjęć") input', '35')
await page.waitForTimeout(200)
check('Ustawienia zmieniają domyślną wielkość', await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--zdjecie-szerokosc').trim() === '35%'))

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
