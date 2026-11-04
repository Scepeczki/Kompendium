// Drobne rzeczy w ścieżce: „Rozdział" z poziomami H1–H6, kotwica widać, że
// włożona, po usuniętym kafelku nie zostaje pusta łuska, zaznaczoną grupę
// usuwa się naraz, a zmiana strony P1/P2 nie przesuwa widoku.
import { chromium } from 'playwright'
import { nowaSciezka, podaj, potwierdz } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } })
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

await nowaSciezka(page, 'Wyklad P')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')

// --- „Rozdział" z poziomami ---
await page.hover('.linear-append .dodaj-kafelek-pasek:has-text("Rozdział") > .btn-dolacz')
const poziomy = page.locator('.linear-append .dodaj-kafelek-pasek:has-text("Rozdział") .tree-menu-item')
await poziomy.first().waitFor({ state: 'visible' })
check('najechanie na „Rozdział" pokazuje H1–H6', (await poziomy.count()) === 6 &&
  (await poziomy.nth(2).innerText()).startsWith('H3'), await poziomy.nth(2).innerText())
await poziomy.nth(2).click()
await podaj(page, 'Trzeci poziom')
await page.click('.linear-append .dodaj-kafelek-pasek:has-text("Rozdział") > .btn-dolacz')
await podaj(page, 'Pierwszy poziom')
await page.waitForTimeout(800)
const naglowki = (await baza()).paths.find((p) => p.name === 'Wyklad P').nodes.filter((n) => n.kind === 'heading')
check('wybrany poziom trafia do rozdziału, a sam klik daje rozdział',
  naglowki.some((n) => n.text === 'Trzeci poziom' && n.level === 3) &&
    naglowki.some((n) => n.text === 'Pierwszy poziom' && n.level === 1),
  JSON.stringify(naglowki.map((n) => [n.text, n.level])))

// --- kotwica ---
// podpis zmienia się po włożeniu („Zdejmij kotwicę"), więc szukamy po klasie i miejscu
const kotwica = page.locator('.path-toolbar .path-maly:not(.btn-close)')
const wyglad = () => kotwica.evaluate((b) => `${getComputedStyle(b).opacity}|${getComputedStyle(b).backgroundColor}`)
const wylaczona = await wyglad()
await kotwica.click()
await page.waitForTimeout(300)
check('włożoną kotwicę widać', (await wyglad()) !== wylaczona, `${wylaczona} → ${await wyglad()}`)
await kotwica.click()

// --- pusta łuska po usuniętym kafelku ---
await page.click('.dodaj-kafelek-pasek:has-text("Kafelek") > .btn-dolacz')
await page.click('.dodaj-kafelek-pasek:has-text("Kafelek") > .btn-dolacz')
await page.waitForTimeout(800)
// menu kafelka (na rozdziale wstawiania celowo nie ma)
await page.locator('.linear-seg').last().click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.linear-menu')
check('menu w Linii też ma „Rozdział" z poziomami',
  (await page.locator('.linear-menu .dodaj-kafelek:has-text("Rozdział") .tree-menu-boczne .tree-menu-item').count()) === 6)
const pusto = await page.locator('.linear-append').boundingBox()
await page.mouse.click(pusto.x + 6, pusto.y + 6)
await page.waitForTimeout(200)
const ileSeg = await page.locator('.linear-seg').count()
await page.click('.path-item:has-text("Wyklad P") .sciezka-rozwin')
await page.locator('.sciezka-dzieci .concept-item').first().click({ button: 'right' })
await page.click('.tree-menu-item:has-text("Usuń")')
await potwierdz(page)
await page.waitForTimeout(1500)
check('usunięty z listy kafelek znika z Linii bez łuski', (await page.locator('.linear-seg').count()) === ileSeg - 1,
  `${ileSeg} → ${await page.locator('.linear-seg').count()}`)
const d = await baza()
const sa = new Set(d.concepts.map((c) => c.id))
check('w zapisanej ścieżce nie ma węzła bez kafelka',
  d.paths.find((p) => p.name === 'Wyklad P').nodes.every((n) => n.kind !== 'block' || sa.has(n.conceptId)))

// --- usuwanie zaznaczonej grupy ---
await page.click('.btn-close[title*="Zamknij"]').catch(() => {})
for (const n of ['Grupa A', 'Grupa B', 'Grupa C']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await page.click('.concept-item:has-text("Grupa A")', { modifiers: ['Control'] })
await page.click('.concept-item:has-text("Grupa B")', { modifiers: ['Control'] })
await page.locator('.concept-item:has-text("Grupa B")').click({ button: 'right' })
check('menu na zaznaczonej grupie proponuje usunąć całą', (await page.locator('.tree-menu-item:has-text("Usuń zaznaczone (2)")').count()) === 1)
await page.click('.tree-menu-item:has-text("Usuń zaznaczone")')
await potwierdz(page)
await page.waitForTimeout(800)
let nazwy = (await baza()).concepts.map((c) => c.name)
check('grupa znika naraz', !nazwy.includes('Grupa A') && !nazwy.includes('Grupa B') && nazwy.includes('Grupa C'))
await page.click('.concept-item:has-text("Grupa C")', { modifiers: ['Control'] })
await page.mouse.click(700, 840)
await page.keyboard.press('Delete')
await potwierdz(page)
await page.waitForTimeout(800)
nazwy = (await baza()).concepts.map((c) => c.name)
check('klawisz Delete też usuwa zaznaczenie', !nazwy.includes('Grupa C'))

// --- P1/P2 przy końcu ścieżki nie przesuwa widoku ---
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium'); await new Promise((r) => (req.onsuccess = r)); const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'subpages'], 'readwrite')
  const now = new Date().toISOString(); const nodes = []
  const tekst = (n) => Array.from({ length: n }, (_, i) => 'Akapit ' + i + ' z odrobiną tekstu, żeby było co czytać.').join('\n\n')
  for (let i = 0; i < 8; i++) {
    T.objectStore('concepts').put({ id: 'sc' + i, name: 'Strona ' + i, type: 'przyklad', currentVersionId: 'sv' + i, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 100 + i })
    T.objectStore('versions').put({ id: 'sv' + i, conceptId: 'sc' + i, version: 1, content: tekst(i === 7 ? 30 : 4), sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'sn' + i, kind: 'block', conceptId: 'sc' + i, versionId: null, subpageId: null, x: 0, y: i * 200 })
  }
  T.objectStore('subpages').put({ id: 'ss7', conceptId: 'sc7', versionId: 'sv7', name: 'P2', content: tekst(3), order: 1, createdAt: now, updatedAt: now })
  const edges = nodes.slice(1).map((n, i) => ({ id: 'se' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'sp', name: 'Strony', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  await new Promise((r) => (T.oncomplete = r))
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(800)
await page.click('.path-item:has-text("Strony")')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForTimeout(1200)
await page.locator('.linear-seg[data-seg="sn7"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
await page.evaluate(() => {
  const v = document.querySelector('.linear-view')
  const b = document.querySelector('.linear-seg[data-seg="sn7"] .block-pages')
  v.scrollTop += b.getBoundingClientRect().top - 300
})
await page.waitForTimeout(500)
const zakladki = page.locator('.linear-seg[data-seg="sn7"] .block-pages')
const przed = (await zakladki.boundingBox()).y
await page.locator('.linear-seg[data-seg="sn7"] .block-page').nth(1).click()
const przesuniecia = []
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(200)
  przesuniecia.push(Math.round((await zakladki.boundingBox()).y - przed))
}
check('zmiana strony przy końcu ścieżki nie przesuwa widoku', przesuniecia.every((x) => Math.abs(x) <= 1), przesuniecia.join(' '))
await page.locator('.linear-seg[data-seg="sn7"] .block-page').nth(0).click()
await page.waitForTimeout(1200)
check('powrót na P1 też stoi w miejscu', Math.abs((await zakladki.boundingBox()).y - przed) <= 1)

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
