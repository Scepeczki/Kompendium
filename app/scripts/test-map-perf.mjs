// Test płynności mapy i układania kafelków: mierzy czas przerysowania przy
// przeciąganiu, sprawdza brak nakładania po dodaniu i po „Ułóż".
import { chromium } from 'playwright'

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
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Sciezka'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dziesięć klocków z realistyczną treścią (wzory = najdroższe renderowanie)
const N = 10
for (let i = 1; i <= N; i++) {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', `Klocek ${i}`)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(
    `Definicja numer ${i}: dla $x \\in \\mathbb{R}$ zachodzi\n\n$$\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}$$\n\noraz $\\lim_{n \\to \\infty} a_n = g$.`,
  )
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')

// wszystkie klocki w to samo miejsce — sprawdzamy, czy się rozsuwają
for (let i = 1; i <= N; i++) {
  await page.dragAndDrop(`.concept-item:has-text("Klocek ${i}")`, '.path-flow', {
    targetPosition: { x: 400, y: 200 },
  })
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1200)

const overlaps = () =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((n) =>
      n.getBoundingClientRect(),
    )
    let count = 0
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const inter =
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
        if (inter > 400) count++ // ignorujemy muśnięcia krawędzi
      }
    }
    return count
  })

const afterDrop = await overlaps()
check('kafelki upuszczone w to samo miejsce nie nakładają się',
  afterDrop === 0, `nakładających się par: ${afterDrop}`)

// --- pomiar płynności: przeciąganie kafelka przez mapę ---
const measureDrag = async () => {
  const box = await page.locator('.react-flow__node').first().boundingBox()
  await page.evaluate(() => {
    window.__frames = []
    window.__raf = true
    const tick = () => {
      window.__frames.push(performance.now())
      if (window.__raf) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.mouse.move(box.x + box.width / 2, box.y + 10)
  await page.mouse.down()
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 8, box.y + 10 + i * 4)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  return page.evaluate(() => {
    window.__raf = false
    const f = window.__frames
    const deltas = []
    for (let i = 1; i < f.length; i++) deltas.push(f[i] - f[i - 1])
    deltas.sort((a, b) => a - b)
    return {
      klatek: deltas.length,
      medianaMs: Math.round(deltas[Math.floor(deltas.length / 2)] * 10) / 10,
      najgorszaMs: Math.round(deltas[deltas.length - 1] * 10) / 10,
      dlugieKlatki: deltas.filter((d) => d > 50).length,
    }
  })
}

const perf = await measureDrag()
console.log(
  `   płynność przeciągania: mediana ${perf.medianaMs} ms/klatkę, najgorsza ${perf.najgorszaMs} ms, klatek > 50 ms: ${perf.dlugieKlatki} (z ${perf.klatek})`,
)
check('przeciąganie płynne (mediana poniżej 25 ms/klatkę)', perf.medianaMs < 25,
  `${perf.medianaMs} ms`)
check('brak długich zacięć podczas przeciągania (max 2 klatki > 50 ms)',
  perf.dlugieKlatki <= 2, `${perf.dlugieKlatki} klatek`)

// --- przycisk „Ułóż" ---
await page.click('button:has-text("⇅ Ułóż")')
await page.waitForTimeout(1500)
const afterArrange = await overlaps()
check('po „Ułóż" żaden kafelek nie nachodzi na inny', afterArrange === 0,
  `nakładających się par: ${afterArrange}`)

const columns = await page.evaluate(() => {
  const xs = [...document.querySelectorAll('.react-flow__node')].map(
    (n) => Math.round(n.getBoundingClientRect().left),
  )
  return new Set(xs).size
})
check('„Ułóż" ustawia kafelki w jednej kolumnie', columns === 1, `kolumn: ${columns}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
