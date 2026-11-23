import { chromium } from 'playwright'

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
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
// Powrót do ścieżki: to samo miejsce w Linii i ten sam spis treści
// (rozwinięte/zwinięte rozdziały, przewinięcie spisu).
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  for (let r = 0; r < 30; r++) {
    nodes.push({ id: `h${r}`, kind: 'heading', text: `Rozdział ${r}`, level: 1, x: 0, y: 0 })
    for (let k = 0; k < 3; k++) {
      const id = `c${r}_${k}`
      // różne długości — po powrocie zgadywane wysokości się mylą
      const tresc = Array.from({ length: 1 + ((r * 3 + k) % 7) * 3 }, (_, j) => `Akapit ${j} kafelka ${id}.`).join('\n\n')
      T.objectStore('concepts').put({ id, name: `Kafelek ${r}.${k}`, type: 'definicja', pathId: 'pm', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
      T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: tresc, sourceRefs: [], createdAt: now, updatedAt: now })
      nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: 0 })
    }
  }
  const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'pm', name: 'Długa ścieżka', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  T.objectStore('paths').put({ id: 'pk', name: 'Krótka inna', folderId: null, order: 1, nodes: [], edges: [], createdAt: now, updatedAt: now })
  await new Promise((r) => (T.oncomplete = r))
})
await page.evaluate(() => { localStorage.setItem('ui.outline', '1'); localStorage.setItem('ui.outlineRodzaj', 'szczegolowy') })
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Długa ścieżka")')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('[data-seg="nc0_0"]')
await page.waitForTimeout(600)

// przewijamy Linię głęboko — kółkiem, jak człowiek
await page.mouse.move(900, 500)
for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 600)
await page.waitForTimeout(800)
const miejsce = () => page.evaluate(() => {
  const el = document.querySelector('.linear-view')
  const gora = el.getBoundingClientRect().top
  const seg = [...el.querySelectorAll('.linear-seg[data-seg]')].find((x) => x.getBoundingClientRect().bottom > gora + 1)
  return { seg: seg?.dataset.seg, dy: Math.round(gora - seg.getBoundingClientRect().top) }
})
const przed = await miejsce()
check('Linia przewinięta daleko od początku', !!przed.seg && !['h0', 'nc0_0', 'nc0_1'].includes(przed.seg), JSON.stringify(przed))

// spis (szczegółowy): rozwijamy ręcznie rozdział 3 i przewijamy listę spisu
await page.locator('.outline-wiersz:has-text("Rozdział 3") .outline-chev').first().click()
await page.waitForTimeout(300)
await page.evaluate(() => { document.querySelector('.outline-list').scrollTop = 220 })
await page.waitForTimeout(500)
const spis = () => page.evaluate(() => ({
  s: Math.round(document.querySelector('.outline-list').scrollTop),
  otw: [...document.querySelectorAll('.outline-wiersz')].filter((w) => w.querySelector('.outline-chev.open')).map((w) => w.textContent.trim()).join('|'),
}))
const spisPrzed = await spis()
check('spis: rozdział 3 rozwinięty, lista przewinięta', spisPrzed.otw.includes('Rozdział 3') && spisPrzed.s > 100, JSON.stringify(spisPrzed))

const porownaj = async (nazwa) => {
  await page.waitForSelector(`[data-seg="${przed.seg}"]`, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(3500)
  const po = await miejsce()
  check(`${nazwa}: Linia w tym samym miejscu`, po.seg === przed.seg && Math.abs(po.dy - przed.dy) <= 3, `${JSON.stringify(przed)} → ${JSON.stringify(po)}`)
  const sp = await spis()
  check(`${nazwa}: spis taki sam (rozwinięte rozdziały, przewinięcie)`, sp.otw === spisPrzed.otw && Math.abs(sp.s - spisPrzed.s) <= 2, `${JSON.stringify(spisPrzed)} → ${JSON.stringify(sp)}`)
}

// wyjście do innej ścieżki i powrót
await page.click('.path-item:has-text("Krótka inna")')
await page.waitForTimeout(700)
await page.click('.path-item:has-text("Długa ścieżka")')
await porownaj('po powrocie z innej ścieżki')

// i po ponownym uruchomieniu programu
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Długa ścieżka")')
await porownaj('po ponownym uruchomieniu')

// podświetlony rozdział w spisie: ten, w którym się czyta (21), a nie następny
const aktywny = await page.locator('.outline-item.active').first().innerText().catch(() => '')
check('spis podświetla rozdział, w którym się czyta (21)', aktywny.includes('Rozdział 21'), aktywny)

check('bez błędów konsoli', errors.length === 0, errors.join(' | '))
await browser.close()
if (problems.length) {
  console.log(`\n>>> BŁĘDY: ${problems.length}`)
  process.exit(1)
}
console.log('\n>>> Wszystko OK')
