// Strony należą do WERSJI, nie do kafelka: usunięcie strony w jednej wersji
// nie rusza pozostałych, a wersje mogą mieć różną liczbę stron. Plus zmiana
// kolejności stron przeciąganiem.
import { chromium } from 'playwright'
import { podaj, potwierdz } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const strony = async () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction('subpages', 'readonly').objectStore('subpages').getAll()
    await new Promise((res) => (r.onsuccess = res))
    return r.result.map((s) => ({ nazwa: s.name, wersja: s.versionId, kolejnosc: s.order }))
  })

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Z wersjami')
await page.waitForTimeout(400)

// dwie strony obok głównej
for (const n of ['Dowod', 'Szkic']) {
  await page.click('button:has-text("+ strona")')
  await podaj(page, n)
  await page.waitForTimeout(700)
}
const poDodaniu = await strony()
check('obie strony dodane', poDodaniu.length === 2, JSON.stringify(poDodaniu))
check('strony mają przypisaną wersję',
  poDodaniu.every((s) => !!s.wersja), JSON.stringify(poDodaniu))

// nowa wersja dostaje własne kopie stron
await page.click('button:has-text("+ nowa wersja")')
await page.waitForSelector('.ask-dialog')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(1200)
const poWersji = await strony()
const wersjeStron = new Set(poWersji.map((s) => s.wersja))
check('nowa wersja ma własne kopie stron',
  poWersji.length === 4 && wersjeStron.size === 2,
  JSON.stringify(poWersji.map((s) => `${s.nazwa}@${s.wersja.slice(0, 4)}`)))

// usunięcie strony w tej (nowej) wersji NIE rusza poprzedniej
await page.click('.subpage-item:has-text("Dowod")')
await page.waitForTimeout(500)
await page.click('.subpage-item.active .folder-action[title="Usuń stronę"]')
await potwierdz(page)
await page.waitForTimeout(1000)
const poUsunieciu = await strony()
check('usunięta strona znika tylko z tej wersji',
  poUsunieciu.length === 3 && poUsunieciu.filter((s) => s.nazwa === 'Dowod').length === 1,
  JSON.stringify(poUsunieciu.map((s) => `${s.nazwa}@${s.wersja.slice(0, 4)}`)))
check('ta wersja ma teraz mniej stron niż tamta',
  new Set(poUsunieciu.map((s) => s.wersja)).size === 2 &&
    poUsunieciu.filter((s) => s.wersja === poUsunieciu[0].wersja).length !==
      poUsunieciu.filter((s) => s.wersja !== poUsunieciu[0].wersja).length,
  JSON.stringify(poUsunieciu.map((s) => `${s.nazwa}@${s.wersja.slice(0, 4)}`)))

// kolejność stron przeciąganiem — wracamy do wersji z dwiema stronami
await page.locator('.version-pill').first().click()
await page.waitForTimeout(900)
const nazwyPrzed = await page
  .locator('.subpage-item .subpage-name')
  .allTextContents()
check('starsza wersja ma obie strony', nazwyPrzed.length === 3, nazwyPrzed.join(' | '))
await page.dragAndDrop(
  '.subpage-item:has-text("Szkic")',
  '.subpage-item:has-text("Dowod")',
)
await page.waitForTimeout(1000)
const nazwyPo = await page.locator('.subpage-item .subpage-name').allTextContents()
check('przeciągnięcie zmienia kolejność stron',
  nazwyPo.indexOf('Szkic') < nazwyPo.indexOf('Dowod'),
  `${nazwyPrzed.join(' | ')}  ⟶  ${nazwyPo.join(' | ')}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
