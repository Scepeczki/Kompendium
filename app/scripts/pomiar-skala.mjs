// Pomiar Linii przy bardzo długich ścieżkach. Baza zasiewana wprost do
// IndexedDB — klikanie dwóch tysięcy kafelków trwałoby godziny.
// Użycie: node skala.mjs 500 1000 2000
import { chromium } from 'playwright'

const ROZMIARY = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(Number)
const ROZMIARY_OK = ROZMIARY.length ? ROZMIARY : [500]
/** --prod mierzy zbudowaną aplikację (npm run preview), a nie tryb pracy.
 *  Różnica jest duża: w trybie pracy React sprawdza każdy atrybut z osobna. */
const PROD = process.argv.includes('--prod')
const ADRES = PROD ? 'http://localhost:4173' : 'http://localhost:5173'
/** --brave mierzy w przeglądarce użytkownika; domyślnie czysty Chromium,
 *  bo tarcze Brave'a skanują cały DOM i zjadają wynik pomiaru. */
const BRAVE = process.argv.includes('--brave')

const browser = await chromium.launch({
  ...(BRAVE
    ? {
        executablePath:
          'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      }
    : {}),
  headless: true,
})

const zasiej = async (page, ile) =>
  page.evaluate(async (N) => {
    const req = indexedDB.open('kompendium')
    await new Promise((res, rej) => {
      req.onsuccess = res
      req.onerror = rej
    })
    const dbh = req.result
    const teraz = new Date().toISOString()
    const concepts = []
    const versions = []
    const nodes = []
    for (let i = 1; i <= N; i++) {
      const cid = `perf-c-${i}`
      const vid = `perf-v-${i}`
      concepts.push({
        id: cid,
        name: `Klocek ${i}`,
        type: 'definicja',
        tags: [],
        folderId: null,
        order: i,
        createdAt: teraz,
        updatedAt: teraz,
        currentVersionId: vid,
      })
      versions.push({
        id: vid,
        conceptId: cid,
        version: 1,
        content:
          `Tresc klocka ${i}. Niech $(a_n)$ bedzie ciagiem o wyrazach $a_n = ${i}/n$. ` +
          `Wowczas $\\lim_{n \\to \\infty} a_n = 0$, co wynika z definicji granicy: ` +
          `dla kazdego $\\varepsilon > 0$ istnieje $N$ takie, ze $|a_n| < \\varepsilon$ dla $n > N$.`,
        sourceRefs: [],
        createdAt: teraz,
        updatedAt: teraz,
      })
      nodes.push({
        id: `perf-n-${i}`,
        kind: 'block',
        conceptId: cid,
        versionId: null,
        x: 0,
        y: i * 120,
      })
    }
    const edges = []
    for (let i = 1; i < N; i++) {
      edges.push({ id: `perf-e-${i}`, source: `perf-n-${i}`, target: `perf-n-${i + 1}` })
    }
    const path = {
      id: 'perf-path',
      name: 'Skala',
      folderId: null,
      order: 1,
      nodes,
      edges,
      createdAt: teraz,
      updatedAt: teraz,
    }
    const tx = dbh.transaction(['concepts', 'versions', 'paths'], 'readwrite')
    for (const c of concepts) tx.objectStore('concepts').put(c)
    for (const v of versions) tx.objectStore('versions').put(v)
    tx.objectStore('paths').put(path)
    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = rej
    })
  }, ile)

const mierz = async (page, nazwa, akcja) => {
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
    `   ${nazwa.padEnd(14)} mediana ${med.toFixed(1)} ms, najgorsza ` +
      `${Math.max(...czasy, 0).toFixed(1)} ms, zacięć >50 ms: ${zle}/${czasy.length}`,
  )
}

for (const ile of ROZMIARY_OK) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const bledy = []
  page.on('pageerror', (e) => bledy.push(String(e)))
  await page.goto(ADRES)
  await page.waitForSelector('text=Kompendium')
  await zasiej(page, ile)
  await page.reload()
  await page.waitForSelector('text=Kompendium')

  console.log(`\n=== ${ile} kafelków ===`)
  // najpierw niech ułoży się sama lista po lewej — to osobny koszt
  const tLista = Date.now()
  await page.waitForFunction(
    (n) => document.querySelectorAll('.concept-item').length >= n,
    ile,
    { timeout: 120000 },
  )
  console.log(`   lista po lewej ${Date.now() - tLista} ms`)
  const t0 = Date.now()
  await page.click('[data-nazwa="Skala"], .concept-item:has-text("Skala")')
  // ścieżka otwiera się najpierw na Mapie — czekamy, aż naprawdę się ułoży,
  // inaczej jej koszt doliczyłby się do Linii
  await page.waitForFunction(
    () => document.querySelectorAll('.react-flow__node').length > 0,
    null,
    { timeout: 180000 },
  )
  await page.evaluate(
    () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))),
  )
  console.log(`   otwarcie Mapy  ${Date.now() - t0} ms`)
  const t1 = Date.now()
  await page.click('.view-switch button:has-text("Linia")')
  await page.waitForSelector('.linear-seg')
  await page.waitForFunction(() => document.querySelectorAll('.markdown-body').length > 3)
  console.log(`   otwarcie Linii ${Date.now() - t1} ms`)
  await page.waitForTimeout(1500)

  const narysowane = await page.locator('.linear-seg[data-pelny="1"]').count()
  const wszystkie = await page.locator('.linear-seg').count()
  console.log(`   narysowanych kafelków: ${narysowane} z ${wszystkie}`)

  await mierz(page, 'przewijanie', async () => {
    await page.mouse.move(800, 500)
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 500)
      await page.waitForTimeout(25)
    }
    await page.waitForTimeout(400)
  })

  await page.evaluate(() => document.querySelector('.linear-view').scrollTo(0, 0))
  await page.waitForTimeout(800)
  await page.locator('.linear-seg .markdown-body').first().click()
  await page.waitForSelector('.linear-pole .tiptap')
  await mierz(page, 'pisanie', async () => {
    await page.keyboard.press('End')
    await page.keyboard.type(' Dopisuje dluzsze zdanie, zeby zmierzyc plynnosc pisania.', {
      delay: 25,
    })
    await page.waitForTimeout(1400)
  })

  const uchwyt = await page.locator('.linear-seg .linear-grip').nth(3).boundingBox()
  const cel = await page.locator('.linear-seg').first().boundingBox()
  await mierz(page, 'przeciąganie', async () => {
    await page.mouse.move(uchwyt.x + 5, uchwyt.y + 5)
    await page.mouse.down()
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(uchwyt.x + 5, uchwyt.y + 5 - ((uchwyt.y - cel.y) * i) / 20, {
        steps: 2,
      })
    }
    await page.mouse.up()
    await page.waitForTimeout(500)
  })

  if (bledy.length) console.log(`   BŁĘDY: ${bledy.slice(0, 3).join(' | ').slice(0, 300)}`)
  await page.close()
}

await browser.close()
