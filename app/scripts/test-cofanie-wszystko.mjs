// Cofanie (Ctrl+Z) i ponawianie (Ctrl+Y) dla całego programu — nie tylko układ
// Linii, ale też lista zadań, sektory, usunięte kafelki, widoczność w teście.
// Jedno działanie (np. zadanie z Linii na listę: Linia + sektor) = jeden krok.
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

const baza = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const wez = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
    const out = {
      nauka: await wez('nauka'),
      concepts: await wez('concepts'),
      versions: await wez('versions'),
      subpages: await wez('subpages'),
      paths: await wez('paths'),
      blockTypes: await wez('blockTypes'),
    }
    db.close()
    return out
  })
const czekaj = async (f, ms = 6000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await f(await baza())) return true
    await page.waitForTimeout(150)
  }
  return false
}
/** Kolejność Linii: id kafelków (pojęć) po strzałkach. */
const kolejnosc = (b) => {
  const p = b.paths.find((x) => x.id === 'p')
  const wej = new Set(p.edges.map((e) => e.to))
  let n = p.nodes.find((x) => !wej.has(x.id))
  const out = []
  while (n && out.length < 50) {
    out.push(n.kind === 'block' ? n.conceptId : n.id)
    const e = p.edges.find((x) => x.from === n.id)
    n = e ? p.nodes.find((x) => x.id === e.to) : undefined
  }
  return out
}
const s1 = (b) => b.nauka.find((j) => j.id === 's1')
const wezelPojecia = (b, cid) => b.paths.find((x) => x.id === 'p').nodes.find((n) => n.conceptId === cid)

/** Przeciąganie zdarzeniami przeglądarki (dragstart → dragover → drop →
 *  dragend) z jednym DataTransfer — bezgłowa przeglądarka nie zaczyna
 *  natywnego przeciągania z uchwytu. pos: punkt w celu (domyślnie środek). */
const ciagnij = async (zrodlo, cel, pos) => {
  await page.locator(zrodlo).first().scrollIntoViewIfNeeded()
  await page.evaluate(async ({ zrodlo, cel, pos }) => {
    const czekaj = () => new Promise((r) => setTimeout(r, 80))
    const dt = new DataTransfer()
    const ev = (el, typ, x, y) => el.dispatchEvent(new DragEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }))
    const a = document.querySelector(zrodlo)
    const ra = a.getBoundingClientRect()
    ev(a, 'dragstart', ra.x + ra.width / 2, ra.y + ra.height / 2)
    await czekaj()
    // cel bywa widoczny dopiero w trakcie przeciągania (pusta lista zadań)
    document.querySelector(cel)?.scrollIntoView({ block: 'center' })
    await czekaj()
    const punkt = () => {
      const r = document.querySelector(cel).getBoundingClientRect()
      const x = r.x + (pos?.x ?? r.width / 2)
      const y = r.y + (pos?.y ?? r.height / 2)
      return { x, y, el: document.elementFromPoint(x, y) ?? document.querySelector(cel) }
    }
    let p = punkt()
    ev(p.el, 'dragenter', p.x, p.y)
    ev(p.el, 'dragover', p.x, p.y)
    await czekaj()
    p = punkt()
    ev(p.el, 'dragover', p.x, p.y)
    await czekaj()
    ev(p.el, 'drop', p.x, p.y)
    if (a.isConnected) ev(a, 'dragend', p.x, p.y)
    else document.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
  }, { zrodlo, cel, pos })
  await page.waitForTimeout(300)
}

const termin = new Date(Date.now() + 5 * 86400000).toISOString()
await page.evaluate(async (termin) => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'subpages', 'blockTypes'], 'readwrite')
  const now = new Date().toISOString()
  const kafelek = (id, name, type, tresc) => {
    T.objectStore('concepts').put({ id, name, type, pathId: 'p', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1, ...(type === 'zadanie' ? { mainPageName: 'Polecenie' } : {}) })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: tresc, sourceRefs: [], createdAt: now, updatedAt: now })
  }
  const strona = (id, cid, name, content) =>
    T.objectStore('subpages').put({ id, conceptId: cid, versionId: 'v' + cid, name, content, order: 1, createdAt: now, updatedAt: now })
  kafelek('c1', 'Kula', 'definicja', 'Kula to zbiór punktów bliskich środka.')
  strona('sp1', 'c1', 'Dowód', 'Dowód kuli: z nierówności trójkąta.')
  kafelek('c2', 'Otoczenie', 'definicja', 'Otoczenie punktu.')
  kafelek('c3', 'Poza sektorem', 'definicja', 'Coś dalej.')
  kafelek('zt', 'Zadanie w linii', 'zadanie', 'Polecenie w linii.')
  strona('szt', 'zt', 'Rozwiązanie', 'Rozwiązanie w linii.')
  kafelek('zl', 'Zadanie z listy', 'zadanie', 'Polecenie z listy.')
  strona('szl', 'zl', 'Rozwiązanie', 'Rozwiązanie z listy.')
  const nodes = ['c1', 'zt', 'c2', 'c3'].map((c, i) => ({ id: 'n' + c, kind: 'block', conceptId: c, versionId: null, subpageId: null, x: 0, y: i * 200 }))
  const edges = [['nc1', 'nzt'], ['nzt', 'nc2'], ['nc2', 'nc3']].map(([from, to], i) => ({ id: 'e' + i, from, to }))
  T.objectStore('paths').put({ id: 'p', name: 'Topologia', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  const karta = { due: termin, stability: 5, difficulty: 5, scheduled_days: 5, reps: 1, lapses: 0, learning_steps: 0, state: 2, last_review: now }
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Kule', wezly: ['nc1', 'nzt', 'nc2'], kolor: '#5b8def', etap: 'zadania', karta, termin, powtorek: 0, ostatniaRozszerzona: 0, zadania: ['zl'], utworzono: now, zmieniono: now })
  await new Promise((r) => (T.oncomplete = r))
}, termin)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(500)

const P = '[data-pasek-zadan="s1"]'
/** Ctrl+Z / Ctrl+Y poza polem tekstowym. */
const klawisz = async (k) => {
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.keyboard.press(k)
  await page.waitForTimeout(250)
}
/** Odstęp między działaniami (jak u człowieka) — osobne kroki cofania. */
const przerwa = () => page.waitForTimeout(900)

await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('[data-seg="nc1"] .oko-testu')
await przerwa()

// --- z Linii na listę: Linia i sektor razem w jednym kroku ---
check('lista na starcie zwinięta', (await page.locator(`${P}.otwarty`).count()) === 0)
await page.hover('[data-seg="nzt"]')
await ciagnij('[data-seg="nzt"] .linear-grip', `${P} .zadania-pasek-glowa`)
check('z Linii na listę', await czekaj((b) => !wezelPojecia(b, 'zt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl', 'zt'])))
check('po upuszczeniu lista się rozwija (widać, gdzie trafiło)', (await page.locator(`${P}.otwarty`).count()) === 1 &&
  (await page.locator(`${P} [data-zadanie="zt"]`).count()) === 1)
await przerwa()
await klawisz('Control+z')
check('Ctrl+Z: zadanie wraca do Linii na swoje miejsce i do sektora, z listy znika', await czekaj((b) =>
  JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'zt', 'c2', 'c3']) && s1(b).wezly.includes('nzt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl'])),
  JSON.stringify(kolejnosc(await baza())) + ' ' + JSON.stringify(s1(await baza()).zadania))
await klawisz('Control+y')
check('Ctrl+Y: ponawia (znowu na liście)', await czekaj((b) => !wezelPojecia(b, 'zt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl', 'zt']) && !s1(b).wezly.includes('nzt')))
await przerwa()

// --- kolejność na liście ---
if (!(await page.locator(`${P}.otwarty`).count())) await page.click(`${P} .zadania-pasek-glowa`)
await page.waitForSelector(`${P} [data-zadanie="zt"]`)
await page.hover(`${P} [data-zadanie="zt"]`)
await ciagnij(`${P} [data-zadanie="zt"] .zadania-grip`, `${P} [data-zadanie="zl"]`, { x: 200, y: 6 })
check('kolejność na liście zmieniona', await czekaj((b) => JSON.stringify(s1(b).zadania) === JSON.stringify(['zt', 'zl'])))
await przerwa()
await klawisz('Control+z')
check('Ctrl+Z: dawna kolejność listy', await czekaj((b) => JSON.stringify(s1(b).zadania) === JSON.stringify(['zl', 'zt'])))
await przerwa()

// --- usunięcie zadania z listy ---
await page.click(`${P} [data-zadanie="zt"] .zadania-pasek-kafelek`, { button: 'right', position: { x: 8, y: 8 } })
await page.click('.menu-zadania .tree-menu-item.danger')
await page.click('.ask-dialog .btn-danger-strong')
check('zadanie usunięte (z listy i z biblioteki)', await czekaj((b) => !b.concepts.some((c) => c.id === 'zt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl'])))
await przerwa()
await klawisz('Control+z')
check('Ctrl+Z: usunięte zadanie wraca — kafelek, treść, strona rozwiązania i miejsce na liście', await czekaj((b) =>
  b.concepts.some((c) => c.id === 'zt') && b.versions.some((v) => v.id === 'vzt' && v.content.includes('Polecenie w linii')) &&
  b.subpages.some((x) => x.id === 'szt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl', 'zt'])))
await page.waitForSelector(`${P} [data-zadanie="zt"]`)
check('i widać je znowu na liście', (await page.locator(`${P} [data-zadanie="zt"]`).count()) === 1)
await przerwa()

// --- z listy do Linii ---
await page.hover(`${P} [data-zadanie="zt"]`)
await ciagnij(`${P} [data-zadanie="zt"] .zadania-grip`, '[data-seg="nc2"]', { x: 200, y: 8 })
check('z listy do Linii', await czekaj((b) => !!wezelPojecia(b, 'zt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl'])))
await przerwa()
if (process.env.DBG) console.log(await page.evaluate(() => JSON.stringify(window.__cofanie.wstecz.slice(-3).map((k) => ({ baza: k.baza.map((z) => [z.tabela, z.klucz, z.rodzaj, Object.keys(z.po ?? z.przed ?? {})]), plotno: k.plotno.map((p) => [p.pathId, p.przed.nodes.length, p.po.nodes.length]), t: k.ostatnio })))))
await klawisz('Control+z')
check('Ctrl+Z: zadanie wraca na listę i znika z Linii', await czekaj((b) =>
  !wezelPojecia(b, 'zt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl', 'zt']) && JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'c2', 'c3'])),
  JSON.stringify(kolejnosc(await baza())))
await przerwa()

// --- oko widoczności w teście ---
await page.locator('[data-seg="nc1"] .oko-testu').first().click()
check('oko: strona główna widoczna w teście', await czekaj((b) => b.versions.find((v) => v.id === 'vc1')?.glownaWTescie === true))
await przerwa()
await klawisz('Control+z')
check('Ctrl+Z: oko wraca na „zakryta"', await czekaj((b) => !b.versions.find((v) => v.id === 'vc1')?.glownaWTescie) &&
  (await page.locator('[data-seg="nc1"] .oko-testu').first().getAttribute('data-oko-testu')) === 'zakryta')

check('bez błędów konsoli', errors.length === 0, errors.join(' | '))
await browser.close()
if (problems.length) {
  console.log(`\n>>> BŁĘDY: ${problems.length}`)
  process.exit(1)
}
console.log('\n>>> Wszystko OK')
