// Scalanie z zaznaczenia w widoku Linia. Sedno: kafelki NIE muszą sąsiadować
// (definicja notacji ma trafić do środka definicji, która jej używa), łańcuch
// nie może się przy tym rozerwać, a tekst napisany w ścieżce nie może zginąć.
import { chromium } from 'playwright'
import { nowaSciezka, podaj } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Definicja', 'Przyklad', 'Notacja']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc ${n}.`)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await nowaSciezka(page, 'Scalanie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Definicja', 'Przyklad', 'Notacja']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(500)
}
await page.waitForTimeout(1200)

const nazwyKafelkow = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.linear-seg')].map((s) => {
      const t = s.querySelector('.script-block-title .inline-title')
      return t ? t.value : (s.querySelector('.script-block-title')?.textContent ?? '?')
    }),
  )

const zBazy = async (tabela) =>
  page.evaluate(async (t) => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction(t, 'readonly').objectStore(t).getAll()
    await new Promise((res) => (r.onsuccess = res))
    return r.result
  }, tabela)

/** Czy ścieżka jest jednym ciągiem bez pętli i bez zgubionych kafelków. */
const lancuch = async () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction('paths', 'readonly').objectStore('paths').getAll()
    await new Promise((res) => (r.onsuccess = res))
    const p = r.result.find((x) => x.name === 'Scalanie')
    if (!p) return { wezly: 0 }
    // strzałki w bazie mają `from`/`to` (React Flow używa source/target)
    const cel = new Set(p.edges.map((e) => e.to))
    const start = p.nodes.filter((n) => !cel.has(n.id))
    const dalej = new Map(p.edges.map((e) => [e.from, e.to]))
    let ile = 0
    const widziane = new Set()
    let x = start[0]?.id
    while (x && !widziane.has(x)) {
      widziane.add(x)
      ile++
      x = dalej.get(x)
    }
    return { wezly: p.nodes.length, poczatki: start.length, wLancuchu: ile, cykl: !!x }
  })

// tekst pisany w ścieżce — musi przetrwać scalenie
await page.locator('.linear-seg').first().locator('.linear-pole .tiptap').click()
await page.keyboard.press('End')
await page.keyboard.type(' TEKST-PRZED-SCALENIEM')
await page.waitForTimeout(1200)

// 1. bez zaznaczenia menu nie proponuje scalania
await page.evaluate(() => document.activeElement?.blur?.())
const menuNad = async (nr) => {
  const seg = page.locator('.linear-seg').nth(nr)
  await seg.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const b = await seg.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + 6, { button: 'right' })
  await page.waitForSelector('.linear-menu')
}
await menuNad(1)
check('bez zaznaczenia nie ma czego scalać',
  (await page.locator('.linear-menu .tree-menu-item:has-text("Scal zaznaczone")').count()) === 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 2. zaznaczamy PIERWSZY i TRZECI — czyli nie po kolei
await page.locator('.linear-seg').nth(0).click({ modifiers: ['Control'] })
await page.locator('.linear-seg').nth(2).click({ modifiers: ['Control'] })
await page.waitForTimeout(400)
check('Ctrl+klik zaznacza kafelki w ścieżce',
  (await page.locator('.linear-seg.zaznaczony').count()) === 2,
  `${await page.locator('.linear-seg.zaznaczony').count()}`)

await menuNad(1)
const pozycja = page.locator('.linear-menu .tree-menu-item:has-text("Scal zaznaczone")')
check('menu proponuje scalenie zaznaczonych i podaje ile',
  (await pozycja.count()) === 1 && (await pozycja.textContent()).includes('(2)'),
  (await pozycja.count()) ? await pozycja.textContent() : 'brak pozycji')
await pozycja.click()
await podaj(page, 'Definicja z notacja')
await page.waitForTimeout(1500)

// 3. wynik: jeden scalony blok z dwoma składnikami, Przyklad osobno
check('powstał scalony blok', (await page.locator('.script-group-block').count()) === 1)
check('scalony blok ma oba zaznaczone kafelki',
  (await page.locator('.script-group-block .group-part').count()) === 2,
  `składników: ${await page.locator('.script-group-block .group-part').count()}`)
const nazwy = await nazwyKafelkow()
check('niezaznaczony kafelek został osobno',
  nazwy.some((n) => n.includes('Przyklad')), nazwy.join(' | '))

// 4. łańcuch przetrwał scalenie nie po kolei
const l = await lancuch()
check('ścieżka nadal jest jednym ciągiem, bez pętli',
  l.wezly === 2 && l.wLancuchu === 2 && !l.cykl && l.poczatki === 1,
  JSON.stringify(l))

// 5. tekst napisany przed scaleniem nie zginął
const sciezki = await zBazy('paths')
const cala = JSON.stringify(sciezki)
check('tekst napisany przed scaleniem przetrwał', cala.includes('TEKST-PRZED-SCALENIEM'),
  cala.slice(0, 300))
check('widać go też na ekranie',
  (await page.textContent('.linear-column')).includes('TEKST-PRZED-SCALENIEM'))

// 6. kafelki w bibliotece zostały nietknięte — scalenie to sposób pokazania
const klocki = await zBazy('concepts')
check('scalenie nie usunęło ani nie zmieniło kafelków',
  klocki.filter((c) => ['Definicja', 'Przyklad', 'Notacja'].includes(c.name)).length === 3,
  klocki.map((c) => c.name).join(' | '))

// 7. zaznaczenie po scaleniu jest sprzątnięte
check('po scaleniu zaznaczenie znika',
  (await page.locator('.linear-seg.zaznaczony').count()) === 0)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
