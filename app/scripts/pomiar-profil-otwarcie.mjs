// Profil procesora przy otwieraniu długiej Linii.
// Użycie: node scripts/pomiar-profil-otwarcie.mjs 2000 [--prod] [--brave]
import { chromium } from 'playwright'

const N = Number(process.argv[2] ?? 1000)
const PROD = process.argv.includes('--prod')
const BRAVE = process.argv.includes('--brave')
const ADRES = PROD ? 'http://localhost:4173' : 'http://localhost:5173'

const browser = await chromium.launch({
  ...(BRAVE
    ? {
        executablePath:
          'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      }
    : {}),
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto(ADRES)
await page.waitForSelector('text=Kompendium')

await page.evaluate(async (ile) => {
  const req = indexedDB.open('kompendium')
  await new Promise((res, rej) => {
    req.onsuccess = res
    req.onerror = rej
  })
  const dbh = req.result
  const teraz = new Date().toISOString()
  const nodes = []
  const tx = dbh.transaction(['concepts', 'versions', 'paths'], 'readwrite')
  for (let i = 1; i <= ile; i++) {
    const cid = `perf-c-${i}`
    const vid = `perf-v-${i}`
    tx.objectStore('concepts').put({
      id: cid, name: `Klocek ${i}`, type: 'definicja', tags: [], folderId: null,
      order: i, createdAt: teraz, updatedAt: teraz, currentVersionId: vid,
    })
    tx.objectStore('versions').put({
      id: vid, conceptId: cid, version: 1,
      content:
        `Tresc klocka ${i}. Niech $(a_n)$ bedzie ciagiem o wyrazach $a_n = ${i}/n$. ` +
        `Wowczas $\\lim_{n \\to \\infty} a_n = 0$, co wynika z definicji granicy: ` +
        `dla kazdego $\\varepsilon > 0$ istnieje $N$ takie, ze $|a_n| < \\varepsilon$ dla $n > N$.`,
      sourceRefs: [], createdAt: teraz, updatedAt: teraz,
    })
    nodes.push({ id: `perf-n-${i}`, kind: 'block', conceptId: cid, versionId: null, x: 0, y: i * 120 })
  }
  const edges = []
  for (let i = 1; i < ile; i++) {
    edges.push({ id: `perf-e-${i}`, source: `perf-n-${i}`, target: `perf-n-${i + 1}` })
  }
  tx.objectStore('paths').put({
    id: 'perf-path', name: 'Skala', folderId: null, order: 1, nodes, edges,
    createdAt: teraz, updatedAt: teraz,
  })
  await new Promise((res, rej) => {
    tx.oncomplete = res
    tx.onerror = rej
  })
}, N)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForFunction((n) => document.querySelectorAll('.concept-item').length >= n, N)
await page.click('.concept-item:has-text("Skala")')
await page.waitForTimeout(1500)

const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 300 })
await cdp.send('Profiler.start')

const t0 = Date.now()
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForFunction(() => document.querySelectorAll('.markdown-body').length > 3)
const czasOtwarcia = Date.now() - t0

const { profile } = await cdp.send('Profiler.stop')
const wg = new Map()
for (const w of profile.nodes) wg.set(w.id, w)
const czas = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const w = wg.get(profile.samples[i])
  if (!w) continue
  const f = w.callFrame
  const klucz = `${f.functionName || '(anonim)'} @ ${(f.url || '(bez pliku)').split('/').pop()}:${f.lineNumber + 1}`
  czas.set(klucz, (czas.get(klucz) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000)
}
console.log(`\n=== profil otwarcia, ${N} kafelków, ${czasOtwarcia} ms ===`)
for (const [k, v] of [...czas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`   ${v.toFixed(1).padStart(8)} ms  ${k}`)
}
await browser.close()
