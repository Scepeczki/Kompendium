// Nowy wygląd: dwa spisy treści, źródła jako nazwy, prawy panel, filtry nad
// listą, „Wyślij do biblioteki", zmiana palety i Skrypt z numeracją.
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
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)
await page.evaluate(() => localStorage.setItem('ui.showPdf', '0'))

/** Baza bez przeglądarkowego klikania — interesuje nas wygląd i zachowanie. */
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  const db = await new Promise((r) => {
    req.onsuccess = () => r(req.result)
  })
  const put = (t, v) =>
    new Promise((r) => {
      const q = db.transaction(t, 'readwrite').objectStore(t).put(v)
      q.onsuccess = r
    })
  const t = new Date().toISOString()
  await put('pdfs', { id: 'p1', title: 'Wykład 2', folderId: null, createdAt: t, data: new Blob(['x']) })
  const kafelek = async (id, type, name, content, reszta = {}) => {
    await put('concepts', {
      id, type, name, tags: [], currentVersionId: `v${id}`, folderId: null, order: 1,
      createdAt: t, updatedAt: t, ...reszta,
    })
    await put('versions', {
      id: `v${id}`, conceptId: id, version: 1, content,
      sourceRefs: id === 'a'
        ? [{ id: 'r1', kind: 'pdf', pdfId: 'p1', page: 3, rect: { x: 0, y: 0, w: 1, h: 1 } }]
        : [],
      createdAt: t, updatedAt: t,
    })
  }
  await kafelek('a', 'definicja', 'Alfa', 'Tekst alfa z biblioteki.')
  await kafelek('b', 'twierdzenie', 'Beta', 'Tekst beta z biblioteki.')
  await kafelek('c', 'zadanie', 'Gamma', 'Tekst gamma.', { pathId: 's' })
  await put('relations', { id: 'x1', fromId: 'a', toId: 'b', kind: 'skala', createdAt: t })
  const luk = (nodes) => nodes.slice(1).map((n, k) => ({ id: `e${k}`, from: nodes[k].id, to: n.id }))
  const nodes = [
    { id: 'h1', kind: 'heading', level: 1, text: 'Pierwszy', x: 0, y: 0 },
    { id: 'n1', kind: 'block', conceptId: 'a', versionId: null, x: 0, y: 100 },
    { id: 'h2', kind: 'heading', level: 1, text: 'Drugi', x: 0, y: 200 },
    { id: 'n2', kind: 'block', conceptId: 'b', versionId: null, x: 0, y: 300,
      wlasneTresci: { 'vb:': 'Tekst beta napisany w ścieżce.' } },
    { id: 'n3', kind: 'block', conceptId: 'c', versionId: null, x: 0, y: 400 },
  ]
  await put('paths', { id: 's', name: 'Glowna', nodes, edges: luk(nodes), createdAt: t, updatedAt: t, order: 5, folderId: null })
  // druga ścieżka ma własny tekst Bety — wysyłka z pierwszej nie może go ukryć
  const inne = [
    { id: 'm1', kind: 'block', conceptId: 'b', versionId: null, x: 0, y: 0,
      wlasneTresci: { 'vb:': 'Tekst beta tylko z drugiej ścieżki.' } },
  ]
  await put('paths', { id: 't', name: 'Druga', nodes: inne, edges: [], createdAt: t, updatedAt: t, order: 6, folderId: null })
  // paleta: jeden kolor fabryczny sprzed zmiany i jeden wybrany ręcznie
  await new Promise((r) => {
    const tx = db.transaction('blockTypes', 'readwrite')
    const s = tx.objectStore('blockTypes')
    const q = s.getAll()
    q.onsuccess = () => {
      for (const typ of q.result) {
        if (typ.id === 'definicja') s.put({ ...typ, color: '#31619e' })
        if (typ.id === 'twierdzenie') s.put({ ...typ, color: '#123456' })
      }
    }
    tx.oncomplete = r
  })
})
await page.evaluate(() => localStorage.removeItem('ui.paleta.v2'))
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(900)

const zBazy = (tabela) =>
  page.evaluate(async (t) => {
    const req = indexedDB.open('kompendium')
    const db = await new Promise((r) => {
      req.onsuccess = () => r(req.result)
    })
    return new Promise((r) => {
      const q = db.transaction(t).objectStore(t).getAll()
      q.onsuccess = () => r(q.result)
    })
  }, tabela)

// --- paleta ---
const typy = await zBazy('blockTypes')
check('barwa fabryczna przechodzi na nową paletę',
  typy.find((t) => t.id === 'definicja').color === '#c2612c')
check('barwa wybrana ręcznie zostaje', typy.find((t) => t.id === 'twierdzenie').color === '#123456')

// --- lista po lewej ---
check('pole szukania jest zawsze widoczne', await page.isVisible('.sidebar-filters input[type=search]'))
await page.keyboard.press('Control+k')
check('Ctrl+K przenosi do szukania',
  await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search'))
await page.keyboard.press('Escape')

await page.click('.sidebar-chip:has-text("DEF")')
await page.waitForTimeout(250)
check('filtr rodzaju pokazuje tylko ten rodzaj',
  (await page.locator('.concept-item:has-text("Alfa")').count()) === 1 &&
    (await page.locator('.concept-item:has-text("Beta")').count()) === 0)
await page.click('.sidebar-chip:has-text("Wszystko")')
await page.click('.sidebar-chip:has-text("Tutejsze 1")')
await page.waitForTimeout(250)
check('filtr „Tutejsze" pokazuje kafelek ze ścieżki',
  (await page.locator('.concept-item:has-text("Gamma")').count()) === 1 &&
    (await page.locator('.concept-item:has-text("Alfa")').count()) === 0)
await page.click('.sidebar-chip:has-text("Wszystko")')
await page.waitForTimeout(250)
const stopka = await page.evaluate(() => document.querySelector('.sidebar-footer').getBoundingClientRect().bottom)
check('stopka listy mieści się w oknie', stopka <= innerHeightSafe(), `dół: ${stopka}`)
function innerHeightSafe() {
  return 950
}

// --- Linia ---
await page.click('.concept-item:has-text("Glowna")')
await page.waitForTimeout(600)
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(900)

check('kafelek pokazuje skrót rodzaju',
  (await page.locator('.linear-seg .script-block-type').first().textContent()) === 'DEF')
check('źródło widać od razu jako nazwę, bez rozwijania',
  (await page.locator('.source-list-item .source-jump').first().textContent()).trim() === 'Wykład 2, s. 3')
check('przy kafelku nie ma obrazka strony',
  (await page.locator('.linear-seg img').count()) === 0)
const plakietki = await page.locator('.block-pochodzenie').allTextContents()
check('plakietki mówią, skąd jest tekst',
  plakietki.join('|') === 'z biblioteki · v1|tekst tej ścieżki|tutejszy', plakietki.join('|'))
check('przycisk PDF stoi na górnym pasku', await page.isVisible('.gorny-pasek .path-toolbar .btn:has-text("PDF")'))
check('boczny pasek PDF znika przy ścieżce', (await page.locator('.pdf-reopen').count()) === 0)
check('pasek narzędzi schowany, gdy nikt nie pisze',
  !(await page.locator('.linear-toolbar .rich-btn').first().isVisible().catch(() => false)))
check('nazwa ścieżki stoi tuż obok nazwy programu',
  await page.evaluate(() => {
    const a = document.querySelector('.app-title').getBoundingClientRect()
    const b = document.querySelector('.path-name').getBoundingClientRect()
    return b.left - a.right < 40 && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 6
  }))

// --- dwa spisy ---
check('domyślnie spis ogólny', await page.isVisible('.outline-ogolny'))
check('spis ogólny to same nazwy rozdziałów',
  (await page.locator('.outline-item.level-1').first().textContent()).trim() === 'Pierwszy')
check('spis ogólny nie ma plakietek', (await page.locator('.outline-znak').count()) === 0)
check('spis ogólny nie ma kafelków', (await page.locator('.outline-kafelek').count()) === 0)
check('spisy przełącza się ikonami, bez napisów',
  (await page.locator('.outline-rodzaj button svg').count()) === 2 &&
    (await page.textContent('.outline-rodzaj')).trim() === '')
await page.click('.outline-rodzaj button[title^="Szczegółowy"]')
await page.waitForTimeout(200)
const znaki = await page.locator('.outline-znak').allTextContents()
check('szczegółowy: wszystkie kafelki z rodzajem', znaki.join(',') === 'DEF,TW,ZAD', znaki.join(','))

// --- rozdziały: ważność w spisie, wielkość w Ustawieniach ---
const rozdzial = () => page.evaluate(() => {
  const h = document.querySelector('.linear-content .script-heading-node')
  return { klasa: h.className, px: getComputedStyle(h).fontSize, rodzina: getComputedStyle(h).fontFamily }
})
const przed = await rozdzial()
check('rozdział jest wyraźny: krój do czytania i 20 px',
  przed.px === '20px' && przed.rodzina.includes('Source Serif'), JSON.stringify(przed))
check('pierwszy rozdział nie ma już wyższego poziomu',
  await page.locator('.outline-poziom button[title^="Ważniejszy"]').first().isDisabled())
await page.locator('.outline-wiersz').first().hover()
await page.locator('.outline-poziom button[title^="Mniej ważny"]').first().click()
await page.waitForTimeout(600)
const po = await rozdzial()
check('strzałka obniża rozdział także w treści',
  po.klasa.includes('level-2') && po.px === '16px', JSON.stringify(po))
check('spis pokazuje nowy poziom', (await page.locator('.outline-item.level-2').count()) >= 1)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)
await page.click('.concept-item:has-text("Glowna")')
await page.waitForTimeout(500)
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-content .script-heading-node')
await page.waitForTimeout(700)
check('poziom rozdziału zostaje po odświeżeniu', (await rozdzial()).klasa.includes('level-2'))
await page.locator('.outline-wiersz').first().hover()
await page.locator('.outline-poziom button[title^="Ważniejszy"]').first().click()
await page.waitForTimeout(600)
check('strzałka podnosi rozdział z powrotem', (await rozdzial()).klasa.includes('level-1'))
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.fill('.settings-row:has-text("Wielkość nazwy: rozdział") .settings-slider', '28')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.linear-content .script-heading-node')
await page.waitForTimeout(500)
check('suwak zmienia wielkość rozdziału', (await rozdzial()).px === '28px')
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.fill('.settings-row:has-text("Wielkość nazwy: rozdział") .settings-slider', '20')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.linear-content .script-heading-node')
await page.waitForTimeout(400)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)
await page.click('.concept-item:has-text("Glowna")')
await page.waitForTimeout(500)
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(800)
check('wybór spisu zostaje po odświeżeniu', await page.isVisible('.outline-szczegolowy'))

// --- prawy panel ---
check('panel bez wyboru podpowiada, co zrobić', await page.isVisible('.kontekst-pusto'))
await page.locator('.linear-seg[data-seg="n1"] .script-block-head').click({ position: { x: 420, y: 12 } })
await page.waitForTimeout(300)
const panel = await page.textContent('.kontekst')
check('panel pokazuje kafelek', panel.includes('Alfa') && panel.includes('1 wersja') && panel.includes('1 ścieżka'), panel)
check('panel pokazuje źródło jako nazwę', panel.includes('Wykład 2, s. 3'))
check('panel pokazuje powiązanie', panel.includes('mocniejsze niż') && panel.includes('Beta'))
check('panel nie ma obrazka strony', (await page.locator('.kontekst img').count()) === 0)

// --- pisanie ---
await page.locator('.linear-seg[data-seg="n1"] .markdown-body, .linear-seg[data-seg="n1"] .tiptap').first().click()
await page.waitForTimeout(500)
check('pasek narzędzi stoi w stopce pisanego kafelka',
  await page.isVisible('[data-seg="n1"] .block-stopka .rich-btn >> nth=0'))
check('w stopce zostają tylko najczęstsze znaki',
  (await page.locator('[data-seg="n1"] .block-stopka .rich-btn').count()) === 5)
await page.click('[data-seg="n1"] .rich-polecenia')
await page.waitForTimeout(200)
check('polecenia rozwijają resztę narzędzi',
  (await page.locator('[data-seg="n1"] .block-stopka .rich-btn').count()) >= 10)
await page.click('[data-seg="n1"] .rich-polecenia')
check('stare szerokości kolumn raz wracają do nowych domyślnych',
  (await page.evaluate(() => localStorage.getItem('ui.gestyUklad.v1'))) === '1' &&
    Math.round((await page.locator('.sidebar').boundingBox()).width) === 250)
check('kafelek z biblioteki dostaje napis o pisaniu w ścieżce',
  await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-seg="n1"] .script-block'), '::before')
      .content.includes('Piszesz w tej ścieżce')))
await page.locator('.linear-seg[data-seg="n3"] .markdown-body, .linear-seg[data-seg="n3"] .tiptap').first().click()
await page.waitForTimeout(500)
check('kafelek tutejszy tego napisu nie dostaje',
  await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-seg="n3"] .script-block'), '::before').content === 'none'))

// --- wyślij do biblioteki ---
check('przycisk tylko przy tekście tej ścieżki',
  (await page.locator('.btn-wyslij').count()) === 1 &&
    (await page.locator('[data-seg="n2"] .btn-wyslij').count()) === 1)
await page.click('[data-seg="n2"] .btn-wyslij')
await page.waitForSelector('.ask-dialog')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(1500)
const wersje = (await zBazy('versions')).filter((v) => v.conceptId === 'b').sort((x, y) => x.version - y.version)
check('powstała nowa wersja z tekstem ścieżki',
  wersje.length === 2 && wersje[1].content === 'Tekst beta napisany w ścieżce.')
check('stara wersja została nietknięta', wersje[0].content === 'Tekst beta z biblioteki.')
const klocki = await zBazy('concepts')
check('nowa wersja jest bieżąca', klocki.find((c) => c.id === 'b').currentVersionId === wersje[1].id)
check('kafelek wraca do podglądu biblioteki',
  (await page.textContent('[data-seg="n2"] .block-pochodzenie')).includes('z biblioteki · v2'))
check('i dalej pokazuje ten sam tekst',
  (await page.textContent('[data-seg="n2"]')).includes('Tekst beta napisany w ścieżce.'))
const sciezki = await zBazy('paths')
const obca = sciezki.find((p) => p.id === 't').nodes[0]
check('druga ścieżka zachowuje swój tekst (przypięta do starej wersji)',
  obca.versionId === wersje[0].id && obca.wlasneTresci[`${wersje[0].id}:`].includes('drugiej ścieżki'))

// --- Skrypt ---
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body')
await page.waitForTimeout(900)
const numery = await page.locator('.ks-liczba').allTextContents()
check('Skrypt numeruje rozdział.pozycja', numery.join(',') === '1.1,2.1,2.2', numery.join(','))
check('Skrypt nazywa akapit jak książka',
  (await page.locator('.ks-slowo').first().textContent()).trim() === 'Definicja 1.1')
check('spis Skryptu też zna kafelki', (await page.locator('.outline-znak').count()) === 3)
await page.click('.outline-kafelek:has-text("Gamma")')
await page.waitForTimeout(700)
check('skok ze spisu Skryptu działa',
  await page.evaluate(() => {
    const r = document.querySelector('.script-body [data-seg="n3"]').getBoundingClientRect()
    return r.top >= 0 && r.top < innerHeight
  }))
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(200)
check('na wydruku źródła nie zabierają marginesu',
  await page.evaluate(() => getComputedStyle(document.querySelector('.ks-blok .source-list') ?? document.body).display === 'none' ||
    !document.querySelector('.ks-blok .source-list')))
await page.emulateMedia({ media: 'screen' })

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
if (problems.length > 0 || errors.length > 0) process.exitCode = 1
