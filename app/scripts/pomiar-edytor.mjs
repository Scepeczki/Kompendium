// Płynność pisania w edytorze klocka przy dużej treści (długie dowody).
// Użycie: node scripts/pomiar-edytor.mjs [ile akapitów]
import { chromium } from 'playwright'

const N = Number(process.argv[2] ?? 60)
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('pageerror', (e) => console.log('BŁĄD:', String(e)))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Dlugi dowod')
await page.waitForTimeout(700)

// wstawiamy treść przez bazę — pisanie tego z klawiatury trwałoby wieczność
await page.click('.view-switch button:has-text("Kod")')
await page.waitForSelector('.editor-code .cm-content')
const akapit = (i) =>
  `Krok ${i}. Niech $\\varepsilon > 0$ i niech $N$ bedzie takie, ze $|a_n - g| < \\varepsilon$ ` +
  `dla $n > N$. Wowczas z nierownosci trojkata $|a_n - a_m| \\le |a_n - g| + |g - a_m| < 2\\varepsilon$, ` +
  `co konczy ten krok dowodu.`
await page.evaluate(async (tresc) => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const dbh = req.result
  const tx = dbh.transaction('versions', 'readwrite')
  const st = tx.objectStore('versions')
  const all = st.getAll()
  await new Promise((res) => (all.onsuccess = res))
  for (const v of all.result) st.put({ ...v, content: tresc })
  await new Promise((res) => (tx.oncomplete = res))
}, Array.from({ length: N }, (_, i) => akapit(i + 1)).join('\n\n'))
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.concept-item:has-text("Dlugi dowod")')
await page.waitForSelector('.editor-name')

const mierz = async (nazwa, akcja) => {
  await page.evaluate(() => {
    window.__k = []
    let ost = performance.now()
    const tik = (t) => {
      window.__k.push(t - ost)
      ost = t
      window.__raf = requestAnimationFrame(tik)
    }
    window.__raf = requestAnimationFrame(tik)
  })
  await akcja()
  const czasy = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    return window.__k.slice(1)
  })
  const p = [...czasy].sort((a, b) => a - b)
  const med = p[Math.floor(p.length / 2)] ?? 0
  const zle = czasy.filter((t) => t > 50).length
  console.log(
    `   ${nazwa.padEnd(22)} mediana ${med.toFixed(1)} ms, najgorsza ` +
      `${Math.max(...czasy, 0).toFixed(1)} ms, zacięć >50 ms: ${zle}/${czasy.length}`,
  )
}

console.log(`\n=== ${N} akapitów ze wzorami ===`)
// 1. wejście w tryb wizualny
const t0 = Date.now()
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await page.waitForSelector('.rich-content .katex')
console.log(`   wejście w Wizualny     ${Date.now() - t0} ms`)
await page.waitForTimeout(1200)

// 2. pisanie w wizualnym
await page.click('.rich-content .tiptap p')
await page.keyboard.press('End')
await mierz('pisanie (Wizualny)', async () => {
  await page.keyboard.type(' Dopisuje dluzsze zdanie do dowodu.', { delay: 25 })
  await page.waitForTimeout(400)
})

// 3. pisanie w Kodzie — dla porównania (bez wzorów rysowanych w locie)
await page.click('.view-switch button:has-text("Kod")')
await page.waitForSelector('.editor-code .cm-content')
await page.waitForTimeout(800)
await page.click('.editor-code .cm-content')
await page.keyboard.press('End')
await mierz('pisanie (Kod)', async () => {
  await page.keyboard.type(' Dopisuje dluzsze zdanie do dowodu.', { delay: 25 })
  await page.waitForTimeout(400)
})

await browser.close()
