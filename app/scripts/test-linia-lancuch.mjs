// Test spójności łańcucha w widoku Linia: dokładanie, przenoszenie i fuzja
// (także kafelków NIE po kolei) nie mogą gubić kafelków ani rozrywać kolejności.
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

for (const n of ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.waitForTimeout(200)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await nowaSciezka(page, 'Lancuch')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')

for (const n of ['Alfa', 'Beta', 'Gamma', 'Delta']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}

/** Nazwy segmentów w kolejności pokazywania. */
const widoczne = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.linear-seg')].map((s) => {
      const pole = s.querySelector('.script-block-title .inline-title')
      if (pole) return pole.value.trim()
      const t = s.querySelector('.script-block-title, .group-name')
      return (t?.textContent ?? s.textContent ?? '').trim()
    }),
  )

/** Czy strzałki tworzą jeden ciąg obejmujący wszystkie kafelki — i czy jest
 *  w nim cykl. To jedyny stan, w którym Linia nie ma prawa nikogo zgubić. */
const lancuch = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction('paths', 'readonly').objectStore('paths').getAll()
    await new Promise((res) => (r.onsuccess = res))
    const p = r.result.find((x) => x.name === 'Lancuch')
    const ids = new Set(p.nodes.map((n) => n.id))
    const wejscia = new Map([...ids].map((i) => [i, 0]))
    const wyjscia = new Map([...ids].map((i) => [i, 0]))
    for (const e of p.edges) {
      wejscia.set(e.to, (wejscia.get(e.to) ?? 0) + 1)
      wyjscia.set(e.from, (wyjscia.get(e.from) ?? 0) + 1)
    }
    // przejście od początku: ile węzłów da się osiągnąć jednym ciągiem
    const start = [...ids].filter((i) => (wejscia.get(i) ?? 0) === 0)
    const nastepny = new Map(p.edges.map((e) => [e.from, e.to]))
    let ile = 0
    let cykl = false
    if (start.length === 1) {
      const odwiedzone = new Set()
      let cur = start[0]
      while (cur && !odwiedzone.has(cur)) {
        odwiedzone.add(cur)
        ile++
        cur = nastepny.get(cur)
      }
      cykl = !!cur && odwiedzone.has(cur)
    }
    return {
      wezly: ids.size,
      poczatki: start.length,
      wLancuchu: ile,
      cykl,
      rozgalezienia: [...wyjscia.values()].filter((v) => v > 1).length,
    }
  })

// zapis ścieżki ma pół sekundy zwłoki — inaczej czytamy bazę sprzed ostatniego drop-u
await page.waitForTimeout(900)
const l0 = await lancuch()
check('cztery kafelki tworzą jeden ciąg',
  l0.wezly === 4 && l0.wLancuchu === 4 && !l0.cykl, JSON.stringify(l0))

// 1. wstawienie pomiędzy nie gubi sąsiadów
const drugi = await page.locator('.linear-seg').nth(1).boundingBox()
await page.dragAndDrop('.concept-item:has-text("Epsilon")', '.linear-seg >> nth=1', {
  targetPosition: { x: drugi.width / 2, y: 6 },
})
// zapis ścieżki ma pół sekundy zwłoki, a po upuszczeniu dochodzi jeszcze
// stawianie pól tekstowych — czekamy z zapasem
await page.waitForTimeout(1000)
const po1 = await widoczne()
const l1 = await lancuch()
check('wstawienie pomiędzy zachowuje wszystkie kafelki',
  po1.length === 5 && l1.wLancuchu === 5 && !l1.cykl,
  `${po1.join(' | ')} — w bazie ${JSON.stringify(l1)}`)
check('wstawiony kafelek trafia we wskazane miejsce',
  po1[1].includes('Epsilon'), po1.join(' | '))

// 2. przeniesienie segmentu nie gubi nikogo
const ostatni = await page.locator('.linear-seg').last().boundingBox()
const pierwszy = await page.locator('.linear-seg').first().boundingBox()
await page.mouse.move(ostatni.x + 14, ostatni.y + 20)
await page.mouse.down()
await page.mouse.move(pierwszy.x + 14, pierwszy.y + 4, { steps: 10 })
await page.mouse.up()
// zapis ścieżki ma pół sekundy zwłoki, a po upuszczeniu dochodzi jeszcze
// stawianie pól tekstowych — czekamy z zapasem
await page.waitForTimeout(1000)
const po2 = await widoczne()
const l2 = await lancuch()
check('przeniesienie segmentu zachowuje wszystkie kafelki',
  po2.length === 5 && l2.wLancuchu === 5 && !l2.cykl, po2.join(' | '))

// 3. fuzja sąsiadów z Linii
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await podaj(page, 'Para')
await page.waitForTimeout(800)
const po3 = await widoczne()
const l3 = await lancuch()
check('fuzja sąsiadów nie rozrywa ciągu',
  po3.length === 4 && l3.wLancuchu === 4 && !l3.cykl, JSON.stringify(l3))

// 4. GŁÓWNY BŁĄD: fuzja kafelków NIE po kolei
await page.click('.view-switch button:has-text("Mapa")')
await page.waitForSelector('.path-node')
await page.click('button[title*="Ułóż"]')
await page.waitForTimeout(900)
const kafelki = await page.locator('.react-flow__node-block').all()
// pierwszy i trzeci klocek na mapie — czyli na pewno nie sąsiedzi w ciągu
await kafelki[0].click()
await page.keyboard.down('Control')
await kafelki[2].click()
await page.keyboard.up('Control')
await page.click('button:has-text("⧉ Scal")')
await podaj(page, 'Nie po kolei')
await page.waitForTimeout(900)
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(600)
const po4 = await widoczne()
const l4 = await lancuch()
check('fuzja nie po kolei nie tworzy pętli', !l4.cykl, JSON.stringify(l4))
check('fuzja nie po kolei nie gubi kafelków',
  l4.wLancuchu === l4.wezly && po4.length === l4.wezly,
  `w ciągu ${l4.wLancuchu} z ${l4.wezly}, widocznych ${po4.length}`)

// 5. wszystko przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
await page.click('.concept-item:has-text("Lancuch")')
await page.waitForSelector('.linear-seg')
// zapis ścieżki ma pół sekundy zwłoki, a po upuszczeniu dochodzi jeszcze
// stawianie pól tekstowych — czekamy z zapasem
await page.waitForTimeout(1000)
const po5 = await widoczne()
check('po przeładowaniu ta sama kolejność', JSON.stringify(po5) === JSON.stringify(po4),
  `${po4.join(' | ')}  ⟶  ${po5.join(' | ')}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
