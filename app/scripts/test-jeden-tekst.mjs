// Kafelek w folderze ścieżki ma jeden tekst ze swoim odpowiednikiem w bibliotece:
// pisanie w ścieżce zmienia bibliotekę i odwrotnie. Kafelek z własnym tekstem
// w ścieżce przy wkładaniu do folderu pyta, który tekst zachować, a drugi
// zostaje jako osobna wersja.
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

const baza = () => page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const wez = (t) => new Promise((r) => {
    const q = db.transaction(t).objectStore(t).getAll()
    q.onsuccess = () => r(q.result)
  })
  const [concepts, versions, paths] = [await wez('concepts'), await wez('versions'), await wez('paths')]
  db.close()
  return { concepts, versions, paths }
})
const kafelek = async (nazwa) => {
  const d = await baza()
  const c = d.concepts.find((k) => k.name === nazwa)
  const wersje = d.versions.filter((v) => v.conceptId === c.id).sort((a, b) => a.version - b.version)
  const wezel = d.paths.find((p) => p.name === 'Wyklad J')?.nodes.find((n) => n.conceptId === c.id)
  return { c, biezaca: wersje.find((v) => v.id === c.currentVersionId)?.content ?? '', wersje, wezel }
}
const seg = (nazwa) => page.locator('.linear-seg').filter({ hasText: nazwa })

for (const n of ['Wspolny', 'Drugi']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.rich-content .tiptap')
  await page.keyboard.type(`Tekst biblioteki ${n}.`)
  await page.waitForTimeout(800)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await nowaSciezka(page, 'Wyklad J')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Wspolny', 'Drugi']) {
  await page.dragAndDrop(`.concept-list > li > .concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(500)
}
// w ścieżce piszemy w obu — powstaje własny tekst ścieżki
for (const n of ['Wspolny', 'Drugi']) {
  await seg(n).locator('.markdown-body').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Dopisane w sciezce.')
  await page.waitForTimeout(1300)
}
check('poza folderem pisanie w ścieżce nie rusza biblioteki',
  (await kafelek('Wspolny')).biezaca === 'Tekst biblioteki Wspolny.')

// --- upuszczenie na ścieżkę: pytanie, wybór tekstu ze ścieżki ---
await page.dragAndDrop('.concept-list > li > .concept-item:has-text("Wspolny")', '.path-item:has-text("Wyklad J")')
await page.waitForSelector('.ask-dialog')
check('wkładanie do folderu pyta, który tekst zachować', (await page.locator('.ask-dialog').innerText()).includes('Który tekst'))
await page.click('.ask-foot .btn:has-text("Tekst ze ścieżki")')
await page.waitForTimeout(1500)
let k = await kafelek('Wspolny')
check('wybrany tekst ścieżki staje się tekstem kafelka', k.biezaca.includes('Dopisane w sciezce'), k.biezaca)
check('tekst z biblioteki zostaje jako osobna wersja',
  k.wersje.length === 2 && k.wersje.some((v) => v.content === 'Tekst biblioteki Wspolny.'))
check('ścieżka nie trzyma już własnej kopii', !k.wezel?.wlasneTresci || !Object.keys(k.wezel.wlasneTresci).length)
check('plakietka mówi, że kafelek mieszka tutaj', (await seg('Wspolny').innerText()).includes('tutejszy'))

// --- od teraz jeden tekst w obie strony ---
await seg('Wspolny').locator('.markdown-body, .tiptap').first().click()
await page.keyboard.press('Control+End')
await page.keyboard.type(' Znowu w sciezce.')
await page.waitForTimeout(1500)
k = await kafelek('Wspolny')
check('pisanie w ścieżce zmienia kafelek w bibliotece', k.biezaca.includes('Znowu w sciezce'), k.biezaca)

// po upuszczeniu ścieżka jest już rozwinięta
if (!(await page.locator('.sciezka-dzieci .concept-item:has-text("Wspolny")').count())) {
  await page.click('.path-item:has-text("Wyklad J") .sciezka-rozwin')
}
await page.click('.sciezka-dzieci .concept-item:has-text("Wspolny")')
await page.waitForSelector('.editor-name')
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+End')
await page.keyboard.type(' Z edytora.')
await page.waitForTimeout(900)
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForTimeout(500)
if (!(await page.locator('.linear-seg').count())) {
  await page.click('.path-item:has-text("Wyklad J")')
  await page.click('.view-switch button:has-text("Linia")')
}
await page.waitForTimeout(1200)
check('poprawka w bibliotece widać w ścieżce', (await seg('Wspolny').innerText()).includes('Z edytora'))

// --- „Trzymaj tylko tutaj" i wybór tekstu z biblioteki ---
await seg('Drugi').click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.linear-menu')
await page.click('.tree-menu-item:has-text("Trzymaj tylko tutaj")')
await page.waitForSelector('.ask-dialog')
await page.click('.ask-foot .btn:has-text("Tekst z biblioteki")')
await page.waitForTimeout(1500)
k = await kafelek('Drugi')
check('wybór biblioteki zostawia jej tekst bieżącym', k.biezaca === 'Tekst biblioteki Drugi.', k.biezaca)
check('tekst ścieżki zostaje jako osobna wersja', k.wersje.some((v) => v.content.includes('Dopisane w sciezce')))
check('Linia pokazuje teraz tekst biblioteki', !(await seg('Drugi').innerText()).includes('Dopisane w sciezce'))

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
