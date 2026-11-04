// Ścieżka jak folder: kafelek robi się w niej przyciskiem „Kafelek" (z rodzajem
// albo ogólny), mieszka w niej, da się go wyciągnąć bez straty dla ścieżki
// i włożyć z powrotem. Usunięty z jedynej ścieżki — znika naprawdę, jeśli tak
// się zdecyduje. Kafelki kopiuje się Ctrl+C i wkleja Ctrl+V.
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
const kontekst = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await kontekst.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' })
const page = await kontekst.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const baza = () => page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const wez = (t) => new Promise((r) => {
    const q = db.transaction(t).objectStore(t).getAll()
    q.onsuccess = () => r(q.result)
  })
  const [concepts, paths] = [await wez('concepts'), await wez('paths')]
  db.close()
  return { concepts, paths }
})
const kafelek = async (nazwa) => (await baza()).concepts.find((c) => c.name === nazwa)
const wezlySciezki = async () => (await baza()).paths.find((p) => p.name === 'Wyklad')?.nodes ?? []
const naLiscie = (nazwa) => page.locator(`.concept-list > li > .concept-item:has-text("${nazwa}")`).count()

// biblioteczny kafelek do przenoszenia
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Zbior')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij kafelek"]')

await nowaSciezka(page, 'Wyklad')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')

// --- „Kafelek": sam klik daje ogólny, rodzaj z listy daje ten rodzaj ---
await page.click('.dodaj-kafelek-pasek > .btn-dolacz')
await page.waitForTimeout(700)
let k = (await baza()).concepts.filter((c) => c.pathId)
check('sam klik robi kafelek ogólny w ścieżce', k.length === 1 && k[0].type === 'ogolny', JSON.stringify(k.map((c) => c.type)))
await page.hover('.dodaj-kafelek-pasek > .btn-dolacz')
await page.waitForSelector('.dodaj-kafelek-pasek .dodaj-kafelek-rodzaje', { state: 'visible' })
check('najechanie pokazuje rodzaje', (await page.locator('.dodaj-kafelek-pasek .dodaj-kafelek-rodzaje .tree-menu-item').count()) >= 4)
await page.click('.dodaj-kafelek-pasek .dodaj-kafelek-rodzaje .tree-menu-item:has-text("Definicja")')
await page.waitForTimeout(700)
k = (await baza()).concepts.filter((c) => c.pathId)
check('rodzaj z listy robi kafelek tego rodzaju', k.some((c) => c.type === 'definicja'))
check('oba stoją w Linii', (await page.locator('.linear-seg').count()) === 2)
check('nie ma ich w liście po lewej', (await naLiscie('Ogólny')) === 0 && (await naLiscie('Definicja')) === 0)

// menu szczeliny ma to samo
await page.locator('.linear-seg').first().click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.linear-menu')
check('menu kafelka w Linii też ma „Kafelek" z rodzajami',
  (await page.locator('.linear-menu .dodaj-kafelek .tree-menu-rozwija:has-text("Kafelek")').count()) === 1)
await page.keyboard.press('Escape')
await page.mouse.click(5, 500)

// --- ścieżka rozwija się w liście jak folder ---
const sciezkaWiersz = page.locator('.path-item:has-text("Wyklad")')
await sciezkaWiersz.locator('.sciezka-rozwin').click()
await page.waitForTimeout(300)
const dzieci = page.locator('.sciezka-dzieci .concept-item')
check('rozwinięta ścieżka pokazuje swoje kafelki', (await dzieci.count()) === 2, String(await dzieci.count()))

// --- wyciągnięcie bez straty dla ścieżki ---
const przed = (await wezlySciezki()).length
await page.dragAndDrop('.sciezka-dzieci .concept-item:has-text("Definicja")', '.concept-list', {
  targetPosition: { x: 100, y: 5 },
})
await page.waitForTimeout(700)
const wyjety = await kafelek('Definicja')
check('wyciągnięty kafelek trafia do listy', !wyjety?.pathId && (await naLiscie('Definicja')) === 1)
check('a w ścieżce zostaje na miejscu', (await wezlySciezki()).length === przed && (await page.locator('.linear-seg').count()) === 2)

// --- włożenie do ścieżki ---
await page.dragAndDrop('.concept-list > li > .concept-item:has-text("Zbior")', '.path-item:has-text("Wyklad")')
await page.waitForTimeout(700)
const wlozony = await kafelek('Zbior')
check('upuszczony na ścieżkę kafelek w niej zamieszkuje', wlozony?.pathId && (await naLiscie('Zbior')) === 0)
check('i staje na jej końcu', (await page.locator('.linear-seg').count()) === 3)
check('widać go w rozwiniętej ścieżce', (await page.locator('.sciezka-dzieci .concept-item:has-text("Zbior")').count()) === 1)

// --- kopiowanie i wklejanie ---
await page.click('.concept-list > li > .concept-item:has-text("Definicja")', { modifiers: ['Control'] })
await page.click('.sciezka-dzieci .concept-item:has-text("Zbior")', { modifiers: ['Control'] })
await page.mouse.click(800, 980)
await page.keyboard.press('Control+C')
await page.waitForTimeout(600)
const tekst = await page.evaluate(() => navigator.clipboard.readText())
check('Ctrl+C daje tekst z nazwami i rodzajami', tekst.includes('# Definicja — Definicja') && tekst.includes('# Zbior —'), tekst.slice(0, 80))
check('widać potwierdzenie', (await page.locator('.sidebar-komunikat').textContent())?.includes('Skopiowano 2'))

// w ścieżce: za zaznaczonym segmentem
await page.locator('.linear-seg').first().click({ position: { x: 240, y: 8 }, modifiers: ['Control'] })
await page.keyboard.press('Control+V')
await page.waitForTimeout(1200)
const wezly = await wezlySciezki()
check('Ctrl+V w ścieżce dokłada kopie', wezly.length === 5, String(wezly.length))
const pierwszeTrzy = await page.evaluate(() => [...document.querySelectorAll('.linear-seg')].slice(0, 3)
  .map((s) => [...s.querySelectorAll('input')].map((i) => i.value).join(' ') + s.innerText)
  .map((t) => ['Ogólny', 'Definicja', 'Zbior'].find((n) => t.includes(n)) ?? '?'))
// kolejność kopii jest ta, w jakiej stoją na liście po lewej
check('kopie stają za zaznaczonym segmentem',
  pierwszeTrzy[0] === 'Ogólny' && [pierwszeTrzy[1], pierwszeTrzy[2]].sort().join() === 'Definicja,Zbior',
  pierwszeTrzy.join(' | '))
const kopie = (await baza()).concepts.filter((c) => c.name.startsWith('Definicja') || c.name.startsWith('Zbior'))
check('wklejone w ścieżce to nowe kafelki, które w niej mieszkają', kopie.length === 4 && kopie.filter((c) => c.pathId).length === 3)

// --- usuwanie ze ścieżki ---
const usun = async (i) => {
  await page.locator('.linear-seg').nth(i).click({ button: 'right', position: { x: 240, y: 30 } })
  await page.waitForSelector('.linear-menu')
  await page.click('.linear-menu .tree-menu-item:has-text("Usuń ze ścieżki")')
  await page.waitForTimeout(500)
}
const ileOgolnych = async () => (await baza()).concepts.filter((c) => c.type === 'ogolny').length
await usun(0)
await page.waitForSelector('.ask-dialog')
check('usunięcie jedynego miejsca pyta, czy usunąć na dobre',
  (await page.locator('.ask-dialog').innerText()).includes('na dobre'))
await page.click('.ask-foot .btn:has-text("Zachowaj w liście")')
await page.waitForTimeout(500)
check('„Zachowaj w liście" przenosi go do listy', (await ileOgolnych()) === 1 && (await naLiscie('Ogólny')) === 1)

// kafelek z listy wkładamy znów i usuwamy na dobre
await page.dragAndDrop('.concept-list > li > .concept-item:has-text("Ogólny")', '.path-item:has-text("Wyklad")')
await page.waitForTimeout(700)
const n = await page.locator('.linear-seg').count()
await usun(n - 1)
await page.click('.ask-foot .btn:has-text("Usuń na dobre")')
await page.waitForTimeout(600)
check('„Usuń na dobre" usuwa kafelek naprawdę', (await ileOgolnych()) === 0)

// biblioteczny kafelek usunięty ze ścieżki zostaje i nie ma pytania
const biblioteczny = (await baza()).concepts.find((c) => c.name === 'Definicja' && !c.pathId)
const wezelBiblioteczny = (await wezlySciezki()).find((w) => w.conceptId === biblioteczny.id)
const indeks = await page.evaluate(
  (id) => [...document.querySelectorAll('.linear-seg')].findIndex((s) => s.dataset.seg === id),
  wezelBiblioteczny.id,
)
await usun(indeks)
check('kafelek z listy wychodzi ze ścieżki bez pytania', (await page.locator('.ask-dialog').count()) === 0 && !!(await kafelek('Definicja')))

// --- wklejanie bez otwartej ścieżki ---
await page.click('.btn-close[title*="Zamknij"]').catch(() => {})
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
const ilePrzed = (await baza()).concepts.length
await page.click('.concept-list > li > .concept-item:has-text("Definicja")')
await page.mouse.click(800, 980)
await page.keyboard.press('Control+C')
await page.waitForTimeout(500)
await page.keyboard.press('Control+V')
await page.waitForTimeout(900)
check('bez ścieżki Ctrl+V wkleja kopię do listy', (await baza()).concepts.length === ilePrzed + 1)

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
