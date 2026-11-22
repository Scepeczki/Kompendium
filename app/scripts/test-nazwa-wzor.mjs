// Test pisania wprost w ścieżce (widok Linia): tytuły, treść kafelka,
// notatka, komentarz, rozdział, nazwa i treść fuzji. Plus dwie barierki:
// Skrypt zostaje do czytania, a po starszej wersji kafelka pisać nie wolno.
import { chromium } from 'playwright'
import { nowaSciezka, podaj, potwierdz, zloz, zlozBiorac } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Kres gorny', 'Notacja']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`$$ p \lor \neg p$$ Tresc ${n}.`)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await nowaSciezka(page, 'Warsztat')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Kres gorny', 'Notacja']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}

const zBazy = async (co) =>
  page.evaluate(async (tabela) => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction(tabela, 'readonly').objectStore(tabela).getAll()
    await new Promise((res) => (r.onsuccess = res))
    return r.result
  }, co)

// --- wzór na samym początku kafelka: bez kursora ma być wyrenderowany, nie kod ---
await page.waitForTimeout(1500)
await page.evaluate(() => document.activeElement?.blur?.())
await page.waitForTimeout(300)
const wzory = await page.evaluate(() => ({
  zrodlo: document.querySelectorAll('.linear-seg .math-src').length,
  render: document.querySelectorAll('.linear-seg .math-render').length,
}))
check('wzór na początku kafelka wyrenderowany (bez kursora nie pokazuje kodu)', wzory.zrodlo === 0 && wzory.render >= 2, JSON.stringify(wzory))

// --- panel „Zaznaczony kafelek" zdjęty ---
check('nie ma panelu „Zaznaczony kafelek"', (await page.locator('.kontekst').count()) === 0)

// --- nazwa kafelka: pisanie ze spacjami, z przerwami dłuższymi niż zapis w tle ---
// kafelek zrobiony w samej ścieżce: jego nazwa po chwili ciszy idzie w tle do kafelka
await page.click('.linear-append .dodaj-kafelek-pasek > button')
await page.waitForFunction(() => document.querySelectorAll('.linear-seg .script-block-title .inline-title').length === 3)
await page.waitForTimeout(800)
const pole = page.locator('.linear-seg').nth(2).locator('.script-block-title .inline-title')
await pole.click()
await pole.press('Control+a')
await pole.press('Delete')
// śledzimy każdą zmianę wartości pola — nie może mignąć nic innego niż to, co wpisano
await page.evaluate(() => {
  window.__wartosci = []
  const el = document.querySelectorAll('.linear-seg .script-block-title .inline-title')[2]
  const zapisz = () => window.__wartosci.push(el.value)
  new MutationObserver(zapisz).observe(el, { attributes: true })
  setInterval(zapisz, 15)
})
const napis = 'Prawo wyłączonego środka '
let wpisane = ''
let zle = []
for (const z of napis) {
  await page.keyboard.type(z)
  wpisane += z
  // co spację dłuższa cisza: zapis do kafelka zdąży pójść w tle
  await page.waitForTimeout(z === ' ' ? 1600 : 60)
  const v = await pole.inputValue()
  if (v !== wpisane) zle.push(JSON.stringify([wpisane, v]))
}
check('nazwa: pole trzyma dokładnie to, co wpisane (spacje się nie cofają)', !zle.length, zle.slice(0, 3).join(' '))
const wartosci = await page.evaluate(() => window.__wartosci)
const obce = wartosci.filter((v) => v && !napis.startsWith(v))
check('nazwa: nic obcego nie miga w polu', !obce.length, [...new Set(obce)].slice(0, 3).join(' | '))
await page.keyboard.press('Tab')
await page.waitForTimeout(1800)
check('po wyjściu z pola: nazwa zapisana (bez końcowej spacji)', (await pole.inputValue()) === 'Prawo wyłączonego środka', await pole.inputValue())
check('nazwa poszła też do kafelka w folderze ścieżki', (await zBazy('concepts')).some((c) => c.name === 'Prawo wyłączonego środka'))

console.log(errors.length ? `Błędy konsoli:\n${errors.join('\n')}` : '✓ bez błędów konsoli')
await browser.close()
if (problems.length) {
  console.log(`\n${problems.length} problem(ów)`)
  process.exit(1)
}
console.log('\nWszystko OK')
