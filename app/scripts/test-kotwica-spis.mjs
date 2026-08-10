// Trzy udogodnienia do pracy w długiej ścieżce:
//  1. ścieżka pamięta, gdzie się skończyło czytanie,
//  2. spis treści rozwija rozdziały i prowadzi wprost do kafelka,
//  3. zakotwiczona ścieżka ma przycisk powrotu i skrót Alt+Z.
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
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dwadzieścia kafelków — dość, żeby było co przewijać
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const dbh = req.result
  const teraz = new Date().toISOString()
  const tx = dbh.transaction(['concepts', 'versions'], 'readwrite')
  for (let i = 1; i <= 20; i++) {
    const cid = `k-c-${i}`
    const vid = `k-v-${i}`
    tx.objectStore('concepts').put({
      id: cid, name: `Klocek ${i}`, type: i % 2 ? 'definicja' : 'twierdzenie',
      tags: [], folderId: null, order: i, createdAt: teraz, updatedAt: teraz,
      currentVersionId: vid,
    })
    tx.objectStore('versions').put({
      id: vid, conceptId: cid, version: 1,
      content: `Tresc klocka ${i}. Dosc dluga, zeby zajac troche wysokosci na ekranie ` +
        `i dalo sie w tej sciezce naprawde przewijac w dol i w gore.`,
      sourceRefs: [], createdAt: teraz, updatedAt: teraz,
    })
  }
  await new Promise((res) => (tx.oncomplete = res))
})
await page.reload()
await page.waitForSelector('text=Kompendium')

await nowaSciezka(page, 'Dluga')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (let i = 1; i <= 20; i++) {
  await page.dragAndDrop(`.concept-item:has-text("Klocek ${i}")`, '.linear-append')
  await page.waitForTimeout(160)
}
// rozdział na początku
await page.click('.linear-append .btn:has-text("§ Rozdział")')
await podaj(page, 'Rozdzial pierwszy')
await page.waitForTimeout(1200)

// --- 2. spis treści: rozdział rozwija się i pokazuje kafelki ---
const spis = page.locator('.outline')
check('spis treści jest', (await spis.count()) === 1)
const przedRozwinieciem = await spis.locator('.outline-kafelek').count()
check('nierozwinięty spis pokazuje same rozdziały', przedRozwinieciem === 0,
  `${przedRozwinieciem}`)
await spis.locator('.outline-chev').first().click()
await page.waitForTimeout(400)
const poRozwinieciu = await spis.locator('.outline-kafelek').count()
check('rozwinięcie pokazuje kafelki rozdziału', poRozwinieciu > 0, `${poRozwinieciu}`)
const znaki = await spis.locator('.outline-kafelek .outline-znak').allTextContents()
check('kafelki w spisie mają plakietkę rodzaju',
  znaki.length > 0 && znaki.some((z) => z.trim() !== ''), znaki.slice(0, 4).join(' '))

// klik w kafelek w spisie przewija do niego
const widok = '.linear-view'
await page.evaluate((s) => document.querySelector(s).scrollTo(0, 0), widok)
await page.waitForTimeout(300)
await spis.locator('.outline-kafelek').last().click()
await page.waitForTimeout(1200)
const poSkoku = await page.evaluate((s) => document.querySelector(s).scrollTop, widok)
check('klik w kafelek w spisie przewija do niego', poSkoku > 200, `scrollTop: ${poSkoku}`)

// --- 1. pamięć miejsca ---
await page.evaluate((s) => document.querySelector(s).scrollTo(0, 900), widok)
await page.waitForTimeout(900)
await page.click('.concept-item:has-text("Klocek 1")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(500)
await page.click('.concept-item:has-text("Dluga")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(2500)
const poPowrocie = await page.evaluate((s) => document.querySelector(s).scrollTop, widok)
check('ścieżka wraca tam, gdzie się skończyło', poPowrocie > 400,
  `scrollTop po powrocie: ${poPowrocie}`)

// --- 3. kotwica ---
check('przycisku powrotu nie ma, dopóki nie zakotwiczysz',
  (await page.locator('.kotwica-powrot').count()) === 0)
await page.click('.path-toolbar button[title*="Zakotwicz"]')
await page.waitForTimeout(400)
await page.click('.concept-item:has-text("Klocek 3")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(500)
check('poza ścieżką widać przycisk powrotu',
  (await page.locator('.kotwica-powrot').count()) === 1)
check('przycisk podaje nazwę ścieżki',
  (await page.textContent('.kotwica-powrot')).includes('Dluga'))
await page.click('.kotwica-powrot')
await page.waitForSelector('.linear-seg')
check('przycisk wraca do ścieżki',
  (await page.inputValue('.path-name')) === 'Dluga')
check('w samej ścieżce przycisku nie ma',
  (await page.locator('.kotwica-powrot').count()) === 0)

// skrót Alt+Z
await page.click('.concept-item:has-text("Klocek 5")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(400)
await page.keyboard.press('Alt+z')
await page.waitForTimeout(900)
check('Alt+Z wraca do zakotwiczonej ścieżki',
  (await page.locator('.path-name').count()) === 1 &&
    (await page.inputValue('.path-name')) === 'Dluga')

// zdjęcie kotwicy
await page.click('.path-toolbar button[title*="Zdejmij kotwicę"]')
await page.waitForTimeout(300)
await page.click('.concept-item:has-text("Klocek 7")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(400)
check('po zdjęciu kotwicy przycisk znika',
  (await page.locator('.kotwica-powrot').count()) === 0)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
