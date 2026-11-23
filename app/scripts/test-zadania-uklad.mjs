// Zadania w Linii i układanie ich w sektorze:
// - jeden rodzaj „Zadanie" (dawny własny o tej samej nazwie scalony z wbudowanym),
// - oko przy stronie kafelka: „widać w teście zakrytym",
// - lista zadań na końcu sektora: przeciąganie z Linii, kolejność, z powrotem do Linii,
// - zadanie wpina się do sektora, w którym stoi (wyjęte poza — wypada),
// - ekran zadań: spis sektora z przeciąganiem (do Linii i na listę),
// - test zakryty: odsłonięte strony widać, reszta zakryta.
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
  // dawny własny rodzaj „Zadanie" obok wbudowanego
  T.objectStore('blockTypes').put({ id: 'moje-zad', label: 'Zadanie', short: 'ZAD', color: '#884488', order: 99 })
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
  kafelek('zd', 'Dawne zadanie', 'moje-zad', 'Stary rodzaj.')
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

// --- jeden rodzaj „Zadanie" ---
check('jeden rodzaj „Zadanie": dawny własny scalony z wbudowanym, kafelek nie stracił rodzaju', await czekaj((b) =>
  !b.blockTypes.some((t) => t.id === 'moje-zad') && b.blockTypes.some((t) => t.id === 'zadanie') && b.concepts.find((c) => c.id === 'zd')?.type === 'zadanie'))

await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('[data-seg="nc1"] .oko-testu')

// --- oko przy stronie ---
check('oko: zadanie ma polecenie odsłonięte, rozwiązanie zakryte; zwykły kafelek zakryty',
  (await page.locator('[data-seg="nzt"] .oko-testu').first().getAttribute('data-oko-testu')) === 'widoczna' &&
  (await page.locator('[data-seg="nzt"] .oko-testu').nth(1).getAttribute('data-oko-testu')) === 'zakryta' &&
  (await page.locator('[data-seg="nc1"] .oko-testu').first().getAttribute('data-oko-testu')) === 'zakryta')
await page.locator('[data-seg="nc1"] .oko-testu').first().click()
check('klik w oko: strona główna „Kuli" widoczna w teście (zapisane w wersji)', await czekaj((b) => b.versions.find((v) => v.id === 'vc1')?.glownaWTescie === true) &&
  (await page.locator('[data-seg="nc1"] .oko-testu').first().getAttribute('data-oko-testu')) === 'widoczna')

if (process.env.SHOT_LINIA) { await page.click(`[data-pasek-zadan="s1"] .zadania-pasek-glowa`); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT_LINIA }); await page.click(`[data-pasek-zadan="s1"] .zadania-pasek-glowa`) }
// --- lista na końcu sektora: z Linii na listę ---
const P = '[data-pasek-zadan="s1"]'
await page.waitForSelector(P)
check('lista na końcu sektora: „Zadania (1)"', (await page.locator(`${P} .zadania-pasek-glowa`).innerText()).includes('Zadania (1)'))
await page.hover('[data-seg="nzt"]')
await ciagnij('[data-seg="nzt"] .linear-grip', `${P} .zadania-pasek-glowa`)
check('zadanie z Linii przeciągnięte na listę: znika z Linii i z sektora, ląduje na końcu listy, kafelek zostaje', await czekaj((b) =>
  !wezelPojecia(b, 'zt') && JSON.stringify(s1(b).zadania) === JSON.stringify(['zl', 'zt']) && !s1(b).wezly.includes('nzt') && b.concepts.some((c) => c.id === 'zt')))

// zwykły kafelek na listę — odmowa
await page.hover('[data-seg="nc2"]')
await ciagnij('[data-seg="nc2"] .linear-grip', `${P} .zadania-pasek-glowa`)
await page.waitForSelector('.sidebar-komunikat')
check('zwykły kafelek na listę zadań: odmowa z wyjaśnieniem, nic się nie zmienia', (await page.locator('.sidebar-komunikat').innerText()).includes('tylko kafelki-zadania') &&
  !!wezelPojecia(await baza(), 'c2'))

// kolejność w obrębie listy
if (!(await page.locator(`${P}.otwarty`).count())) await page.click(`${P} .zadania-pasek-glowa`)
await page.waitForSelector(`${P} [data-zadanie="zt"]`)
await page.hover(`${P} [data-zadanie="zt"]`)
await ciagnij(`${P} [data-zadanie="zt"] .zadania-grip`, `${P} [data-zadanie="zl"]`, { x: 200, y: 6 })
check('przeciąganie w liście zmienia kolejność', await czekaj((b) => JSON.stringify(s1(b).zadania) === JSON.stringify(['zt', 'zl'])))
// prawdziwe przeciąganie zaczyna się od wciśnięcia myszy — pasek nie może go wstrzymywać
check('uchwyt na liście: wciśnięcie myszy nie jest blokowane (da się zacząć przeciąganie)', !(await page.evaluate(() => {
  const g = document.querySelector('[data-pasek-zadan="s1"] .zadania-grip')
  const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  g.dispatchEvent(e)
  return e.defaultPrevented
})))

// kilka zaznaczonych na liście (Ctrl+klik) — do Linii razem
await page.click(`${P} [data-zadanie="zt"] .zadania-pasek-kafelek`, { modifiers: ['Control'], position: { x: 8, y: 8 } })
await page.click(`${P} [data-zadanie="zl"] .zadania-pasek-kafelek`, { modifiers: ['Control'], position: { x: 8, y: 8 } })
check('Ctrl+klik zaznacza kilka zadań na liście', (await page.locator(`${P} .zadania-pasek-zadanie.zaznaczone`).count()) === 2)
await ciagnij(`${P} [data-zadanie="zt"] .zadania-grip`, '[data-seg="nc2"]', { x: 200, y: 8 })
check('zaznaczone zadania z listy przeciągnięte razem do Linii, w kolejności listy', await czekaj((b) =>
  JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'zt', 'zl', 'c2', 'c3']) && !s1(b).zadania.length &&
  s1(b).wezly.includes(wezelPojecia(b, 'zt')?.id) && s1(b).wezly.includes(wezelPojecia(b, 'zl')?.id)), JSON.stringify(kolejnosc(await baza())))
// kilka zaznaczonych w Linii — na listę razem
{
  const b = await baza()
  for (const cid of ['zt', 'zl']) {
    await page.click(`[data-seg="${wezelPojecia(b, cid).id}"] .script-block-body`, { modifiers: ['Control'], position: { x: 4, y: 4 } })
  }
  await page.hover(`[data-seg="${wezelPojecia(b, 'zt').id}"]`)
  await ciagnij(`[data-seg="${wezelPojecia(b, 'zt').id}"] .linear-grip`, `${P} .zadania-pasek-glowa`)
}
check('zaznaczone zadania z Linii przeciągnięte razem na listę', await czekaj((b) =>
  JSON.stringify(s1(b).zadania) === JSON.stringify(['zt', 'zl']) && JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'c2', 'c3'])), JSON.stringify(kolejnosc(await baza())))
if (!(await page.locator(`${P}.otwarty`).count())) await page.click(`${P} .zadania-pasek-glowa`)
await page.waitForSelector(`${P} [data-zadanie="zl"]`)

// z wciśniętym Ctrl przeglądarka chce „kopiować" — Linia i lista mają brać to jako przenoszenie
check('upuszczanie przyjmuje przeciąganie z wciśniętym Ctrl (zawsze „przenieś")', await page.evaluate(() => {
  const nad = (el) => {
    const dt = new DataTransfer()
    dt.setData('text/x-komp-zadanie', '{}')
    // poza prawdziwym przeciąganiem przeglądarka nie zmienia dropEffect — podglądamy, co ustawia program
    let efekt = 'copy'
    Object.defineProperty(dt, 'dropEffect', { get: () => efekt, set: (v) => (efekt = v) })
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, ctrlKey: true, clientX: r.x + 20, clientY: r.y + 10, dataTransfer: dt }))
    return dt.dropEffect
  }
  return nad(document.querySelector('[data-seg="nc1"]')) === 'move' && nad(document.querySelector('[data-pasek-zadan="s1"] .zadania-pasek-glowa')) === 'move'
}))

// między ostatnim kafelkiem sektora a ROZWINIĘTĄ listą: dolna część samego kafelka
{
  const kafelek = '[data-seg="nc2"] .linear-content > .script-block'
  const h = (await page.locator(kafelek).boundingBox()).height
  await ciagnij(`${P} [data-zadanie="zl"] .zadania-grip`, kafelek, { x: 200, y: h - 8 })
}
check('dolna część ostatniego kafelka (lista rozwinięta): zadanie staje między kafelkiem a listą, w sektorze', await czekaj((b) =>
  JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'c2', 'zl', 'c3']) && s1(b).wezly.includes(wezelPojecia(b, 'zl')?.id)), JSON.stringify(kolejnosc(await baza())))
// i z powrotem na listę (za „Zadanie w linii")
{
  const idx = wezelPojecia(await baza(), 'zl').id
  await page.hover(`[data-seg="${idx}"]`)
  const P2 = '[data-pasek-zadan="s1"]'
  await page.waitForSelector(`${P2} [data-zadanie="zt"]`).catch(() => {})
  if (!(await page.locator(`${P2}.otwarty`).count())) await page.click(`${P2} .zadania-pasek-glowa`)
  const h = (await page.locator(`${P2} [data-zadanie="zt"]`).boundingBox()).height
  await ciagnij(`[data-seg="${idx}"] .linear-grip`, `${P2} [data-zadanie="zt"]`, { x: 200, y: h - 4 })
}
check('z Linii na listę w wybrane miejsce (pod pierwszym zadaniem)', await czekaj((b) =>
  JSON.stringify(s1(b).zadania) === JSON.stringify(['zt', 'zl']) && JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'c2', 'c3'])), JSON.stringify(kolejnosc(await baza())))

// usuwanie kilku zaznaczonych z listy (pod prawym przyciskiem): dwa dodatkowe
// zadania — Dołóż na końcu Linii (poza sektorem), razem na listę
const znane = ['zt', 'zl', 'zd']
for (let k = 0; k < 2; k++) {
  await page.hover('.linear-append .dodaj-kafelek-pasek > .btn-dolacz')
  await page.click('.linear-append .dodaj-kafelek-rodzaje .tree-menu-item:has-text("Zadanie")')
  await czekaj((b) => b.concepts.filter((x) => x.type === 'zadanie' && !znane.includes(x.id) && wezelPojecia(b, x.id)).length === k + 1)
}
const dodatkowe = (b) => b.concepts.filter((x) => x.type === 'zadanie' && !znane.includes(x.id)).map((c) => ({ cid: c.id, nid: wezelPojecia(b, c.id)?.id }))
let extra = dodatkowe(await baza())
check('dwa zadania dołożone za kafelkiem spoza sektora — poza sektorem', extra.length === 2 && !(await baza()).nauka.some((j) => extra.some((x) => j.wezly.includes(x.nid))))
for (const x of extra) await page.click(`[data-seg="${x.nid}"] .script-block-body`, { modifiers: ['Control'], position: { x: 4, y: 4 } })
await page.hover(`[data-seg="${extra[0].nid}"]`)
await ciagnij(`[data-seg="${extra[0].nid}"] .linear-grip`, `${P} .zadania-pasek-glowa`)
check('dwa zaznaczone w Linii — razem na listę', await czekaj((b) => JSON.stringify(s1(b).zadania) === JSON.stringify(['zt', 'zl', ...extra.map((x) => x.cid)])))
for (const x of extra) await page.click(`${P} [data-zadanie="${x.cid}"] .zadania-pasek-kafelek`, { modifiers: ['Control'], position: { x: 8, y: 8 } })
check('zaznaczenie na liście widać po obwódce, bez dodatkowego paska', (await page.locator(`${P} .zadania-pasek-zadanie.zaznaczone`).count()) === 2 &&
  (await page.locator(`${P} [data-zaznaczone-zadania]`).count()) === 0)
await page.click(`${P} [data-zadanie="${extra[1].cid}"] .zadania-pasek-kafelek`, { button: 'right', position: { x: 8, y: 8 } })
await page.waitForSelector('.menu-zadania')
check('prawy przycisk na zaznaczonym: menu dla całej grupy', (await page.locator('.menu-zadania').innerText()).includes('Zaznaczone zadania (2)'))
await page.click('.menu-zadania [data-usun-zaznaczone]')
await page.click('.ask-dialog .btn-danger-strong')
check('„Usuń zaznaczone (2)" (po pytaniu): oba znikają z listy i z biblioteki, reszta zostaje', await czekaj((b) =>
  extra.every((x) => !b.concepts.some((c) => c.id === x.cid)) && JSON.stringify(s1(b).zadania) === JSON.stringify(['zt', 'zl'])))

// z listy do Linii — między „Kulą" a „Otoczeniem"
await page.hover(`${P} [data-zadanie="zl"]`)
await ciagnij(`${P} [data-zadanie="zl"] .zadania-grip`, '[data-seg="nc2"]', { x: 200, y: 8 })
check('zadanie z listy przeciągnięte do Linii: staje w tym miejscu i wpina się do sektora', await czekaj((b) => {
  const n = wezelPojecia(b, 'zl')
  return !!n && JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'zl', 'c2', 'c3']) && s1(b).wezly.includes(n.id) && !s1(b).zadania.includes('zl')
}), JSON.stringify(kolejnosc(await baza())))

// przesunięte poza sektor — wypada z niego
const idZl = wezelPojecia(await baza(), 'zl').id
await page.hover(`[data-seg="${idZl}"]`)
const h3 = (await page.locator('[data-seg="nc3"]').boundingBox()).height
await ciagnij(`[data-seg="${idZl}"] .linear-grip`, '[data-seg="nc3"]', { x: 200, y: h3 - 6 })
check('zadanie przesunięte za kafelek spoza sektora wypada z sektora', await czekaj((b) =>
  JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'c2', 'c3', 'zl']) && !s1(b).wezly.includes(idZl)), JSON.stringify(kolejnosc(await baza())))
// z powrotem do środka sektora — wraca do niego
await page.hover(`[data-seg="${idZl}"]`)
await ciagnij(`[data-seg="${idZl}"] .linear-grip`, '[data-seg="nc2"]', { x: 200, y: 8 })
check('przesunięte między kafelki sektora — znów w sektorze', await czekaj((b) =>
  JSON.stringify(kolejnosc(b)) === JSON.stringify(['c1', 'zl', 'c2', 'c3']) && s1(b).wezly.includes(idZl)))

// --- ekran zadań: spis sektora ---
await page.click('.view-switch button:has-text("Nauka")')
const K = '.karta-sektora[data-sektor="s1"]'
await page.waitForSelector(`${K} [data-zadania]`)
await page.click(`${K} [data-zadania]`)
const E = '.sesja-czat-proba'
await page.waitForSelector(`${E} .ez3-spis`)
if (process.env.SHOT_SPIS) await page.screenshot({ path: process.env.SHOT_SPIS })
const spisTekst = await page.locator(`${E} .ez3-spis`).innerText()
check('spis sektora: kafelki po kolei, zadanie z Linii na swoim miejscu', /Kula[\s\S]*Zadanie z listy[\s\S]*Otoczenie/.test(spisTekst) && !spisTekst.includes('Poza sektorem'), spisTekst.replace(/\s+/g, ' '))
check('„Na końcu sektora": zadanie z listy', (await page.locator(`${E} .ez3-lista-konca`).innerText()).includes('Zadanie w linii'))
check('w kolumnie oba zadania (z Linii i z listy)', (await page.locator(`${E} .ez2-kafelek`).count()) === 2)
// z listy do spisu: przed „Kulą"
await ciagnij(`${E} .ez3-lista-konca .ez2-poz`, `${E} .ez3-spis > li:first-child`, { x: 60, y: 3 })
check('spis: zadanie z listy przeciągnięte przed „Kulę" staje w Linii i w sektorze', await czekaj((b) => {
  const n = wezelPojecia(b, 'zt')
  return !!n && kolejnosc(b)[0] === 'zt' && s1(b).wezly.includes(n.id) && !s1(b).zadania.includes('zt')
}), JSON.stringify(kolejnosc(await baza())))
// z Linii na listę
await page.waitForSelector(`${E} .ez3-spis .ez2-poz[data-zadanie="zl"]`)
await ciagnij(`${E} .ez3-spis .ez2-poz[data-zadanie="zl"]`, `${E} .ez3-lista-konca`)
check('spis: zadanie z Linii przeciągnięte na listę na końcu sektora', await czekaj((b) =>
  !wezelPojecia(b, 'zl') && s1(b).zadania.includes('zl') && b.concepts.some((c) => c.id === 'zl')), JSON.stringify(kolejnosc(await baza())))

// --- test zakryty: odsłonięte strony widać ---
await page.waitForSelector(`${E} [data-test-koncowy]`)
await page.click(`${E} [data-test-koncowy]`)
await page.waitForSelector('.sesja-element')
await page.waitForTimeout(500)
if (process.env.SHOT) { await page.locator('.sesja-element', { has: page.locator('.sesja-nazwa', { hasText: /^Kula$/ }) }).scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.SHOT }) }
const kula = page.locator('.sesja-element', { has: page.locator('.sesja-nazwa', { hasText: /^Kula$/ }) })
check('test: u góry odsłonięta treść, na dole wypisane zakryte strony („Dowód")', (await kula.locator('.sesja-zadanie-tresc').innerText()).includes('zbiór punktów') &&
  (await kula.locator('.sesja-zakryte [data-zakryte-strony]').innerText()).includes('Dowód') &&
  !(await kula.locator('.sesja-zadanie-tresc').innerText()).includes('Dowód') && !(await kula.innerText()).includes('nierówności trójkąta'))
await kula.locator('.sesja-zakryte .btn-primary').click()
check('test: po „Sprawdź" na dole otwiera się zakryty „Dowód"', (await kula.locator('.sesja-odkryta').innerText()).includes('nierówności trójkąta') &&
  (await kula.locator('[data-zakryte-strony]').count()) === 0)
const otoczenie = page.locator('.sesja-element', { has: page.locator('.sesja-nazwa', { hasText: /^Otoczenie$/ }) })
check('test: zwykły kafelek bez odsłoniętych stron — zakryty w całości', (await otoczenie.innerText()).toLowerCase().includes('kafelek zakryty') && !(await otoczenie.innerText()).includes('Otoczenie punktu'))
const zad = page.locator('.sesja-element', { has: page.locator('.sesja-nazwa', { hasText: /^Zadanie w linii$/ }) })
check('test: zadanie — polecenie widać, rozwiązanie zakryte', (await zad.innerText()).includes('Polecenie w linii') && (await zad.innerText()).toLowerCase().includes('rozwiązanie zakryte') &&
  !(await zad.innerText()).includes('Rozwiązanie w linii'))

// --- próba zadań: układanie w spisie na niby ---
await page.click('.sesja-glowa button:has-text("Wróć")').catch(() => {})
await page.waitForTimeout(300)
/** Treść ścieżek i sektorów — bez kolejności pól i znacznika zapisu (Linia zapisuje węzły po swojemu). */
const tresc = (b) => {
  const norm = (x) => (Array.isArray(x) ? x.map(norm) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().filter((k) => k !== 'updatedAt').map((k) => [k, norm(x[k])])) : x)
  return JSON.stringify(norm({ paths: b.paths, nauka: b.nauka }))
}
const przedProba = tresc(await baza())
await page.click('.sidebar-foot-btn[title*="Ustawienia"], .sidebar-foot-btn:has-text("Ustawienia")')
await page.click('.settings-nav-item:has-text("Próba")')
await page.waitForSelector('[data-proba-zadania]')
await page.click('[data-proba-zadania]')
await page.waitForSelector(`${E} .ez3-spis`)
await page.click(`${E} [data-nowe-zadanie]`)
await page.waitForSelector(`${E} .ez3-lista-konca .ez2-poz`)
await ciagnij(`${E} .ez3-lista-konca .ez2-poz`, `${E} .ez3-spis > li:first-child`, { x: 60, y: 3 })
check('próba: zadanie przeciągnięte w spis staje w nim (na niby)', (await page.locator(`${E} .ez3-spis .ez2-poz`).count()) === 1 &&
  (await page.locator(`${E} .ez3-lista-konca .ez2-poz`).count()) === 0)
check('próba: Linia i sektor bez zmian', tresc(await baza()) === przedProba)

check('bez błędów konsoli', errors.length === 0, errors.join(' | '))
console.log(problems.length ? `\n${problems.length} problem(ów)` : '\nWszystko OK')
await browser.close()
process.exit(problems.length ? 1 : 0)
