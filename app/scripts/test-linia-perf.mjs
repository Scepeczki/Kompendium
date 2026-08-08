// Pomiar płynności widoku Linia przy prawdziwym skrypcie (25 kafelków):
// pisanie w kafelku i przeciąganie segmentu nie mogą kleić całej ścieżki.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const ILE = 25
for (let i = 1; i <= ILE; i++) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', `Klocek ${i}`)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(
    `Tresc klocka ${i}. Zdanie drugie z odrobina dluzszym tekstem, zeby kafelek mial wysokosc.`,
  )
  await page.waitForTimeout(150)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await nowaSciezka(page, 'Duza')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (let i = 1; i <= ILE; i++) {
  await page.dragAndDrop(`.concept-item:has-text("Klocek ${i}")`, '.linear-append')
  await page.waitForTimeout(200)
}
await page.waitForTimeout(1200)

/** Ile edytorów żyje naraz — sedno sprawy przy długiej ścieżce. */
const edytory = await page.locator('.linear-pole .tiptap').count()
check('edytory tylko tam, gdzie widać', edytory > 0 && edytory <= 12,
  `żywych edytorów: ${edytory} przy ${ILE} kafelkach`)

/** Mierzy czas klatek w trakcie działania. */
const mierz = async (nazwa, akcja) => {
  await page.evaluate(() => {
    window.__klatki = []
    let ost = performance.now()
    const tik = (t) => {
      window.__klatki.push(t - ost)
      ost = t
      window.__raf = requestAnimationFrame(tik)
    }
    window.__raf = requestAnimationFrame(tik)
  })
  await akcja()
  const czasy = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    return window.__klatki.slice(1)
  })
  const posort = [...czasy].sort((a, b) => a - b)
  const mediana = posort[Math.floor(posort.length / 2)] ?? 0
  const zle = czasy.filter((t) => t > 50).length
  console.log(
    `   ${nazwa}: mediana ${mediana.toFixed(1)} ms/klatkę, ` +
      `najgorsza ${Math.max(...czasy, 0).toFixed(1)} ms, klatek > 50 ms: ${zle} (z ${czasy.length})`,
  )
  return { mediana, zle }
}

// 1. pisanie w kafelku
await page.click('.linear-pole .tiptap')
const pisanie = await mierz('pisanie w kafelku', async () => {
  await page.keyboard.press('End')
  await page.keyboard.type(' Dopisuje dluzsze zdanie, zeby zmierzyc plynnosc pisania.', {
    delay: 25,
  })
})
check('pisanie płynne (mediana poniżej 25 ms/klatkę)', pisanie.mediana < 25,
  `${pisanie.mediana.toFixed(1)} ms`)
check('bez zacięć powyżej 50 ms przy pisaniu', pisanie.zle <= 2, `zacięć: ${pisanie.zle}`)

// 2. przeciąganie segmentu
const uchwyt = await page.locator('.linear-seg .linear-grip').nth(3).boundingBox()
const cel = await page.locator('.linear-seg').first().boundingBox()
const ciagniecie = await mierz('przeciąganie segmentu', async () => {
  await page.mouse.move(uchwyt.x + 5, uchwyt.y + 5)
  await page.mouse.down()
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(
      uchwyt.x + 5,
      uchwyt.y + 5 - ((uchwyt.y - cel.y) * i) / 20,
      { steps: 2 },
    )
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
})
check('przeciąganie płynne (mediana poniżej 25 ms/klatkę)', ciagniecie.mediana < 25,
  `${ciagniecie.mediana.toFixed(1)} ms`)

console.log('')
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
