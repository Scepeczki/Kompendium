// Pomiar płynności przeciągania kafelków w Firefoksie — czyli w przeglądarce,
// w której aplikacja jest naprawdę używana (reszta testów chodzi na Brave).
//
// Wymaga jednorazowo:  npx playwright install firefox
//
// Mierzy długość klatek podczas ciągłego przeciągania kafelka oraz liczbę
// przebudów treści kafelków (przy dobrej memoizacji powinno być 0).
import { firefox } from 'playwright'

const browser = await firefox.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('dialog', (d) => d.accept('Sciezka'))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const N = 10
for (let i = 1; i <= N; i++) {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', `Klocek ${i}`)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(
    `Definicja ${i}: dla $x \\in \\mathbb{R}$\n\n$$\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}$$\n\noraz $\\lim_{n \\to \\infty} a_n = g$.`,
  )
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
for (let i = 1; i <= N; i++) {
  await page.dragAndDrop(`.concept-item:has-text("Klocek ${i}")`, '.path-flow', {
    targetPosition: { x: 400, y: 200 },
  })
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1200)

const box = await page.locator('.react-flow__node').first().boundingBox()
await page.evaluate(() => {
  window.__f = []
  window.__raf = true
  const tick = () => {
    window.__f.push(performance.now())
    if (window.__raf) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__r = 0
  window.__o = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.target instanceof Element && m.target.closest('.path-node-body')) window.__r++
    }
  })
  window.__o.observe(document.querySelector('.react-flow__nodes'), {
    childList: true,
    subtree: true,
    characterData: true,
  })
})
await page.mouse.move(box.x + box.width / 2, box.y + 10)
await page.mouse.down()
for (let i = 0; i < 60; i++) {
  await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + 10 + i * 3)
}
await page.mouse.up()
const r = await page.evaluate(() => {
  window.__raf = false
  window.__o.disconnect()
  const d = []
  for (let i = 1; i < window.__f.length; i++) d.push(window.__f[i] - window.__f[i - 1])
  d.sort((a, b) => a - b)
  return {
    mediana: Math.round(d[Math.floor(d.length / 2)] * 10) / 10,
    najgorsza: Math.round(d[d.length - 1] * 10) / 10,
    dlugie: d.filter((x) => x > 50).length,
    klatek: d.length,
    przebudowy: window.__r,
  }
})
console.log(
  `FIREFOX — mediana ${r.mediana} ms/klatkę, najgorsza ${r.najgorsza} ms, ` +
    `klatek > 50 ms: ${r.dlugie} (z ${r.klatek}), przebudowy treści: ${r.przebudowy}`,
)
console.log(
  r.mediana < 25 && r.dlugie === 0 && r.przebudowy === 0
    ? '>>> PŁYNNIE'
    : '>>> ZA WOLNO — sprawdź memoizację kafelków i wartości kontekstu',
)
await browser.close()
