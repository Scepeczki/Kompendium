// Głęboki test poprawności ścieżek: wszystkie rodzaje kafelków, strzałki,
// kolejność, grupowanie/rozgrupowanie, tryb liniowy, skrypt, trwałość
// i odporność na usunięte kafelki. Zgłasza każdą niezgodność jako BŁĄD.
import { chromium } from 'playwright'
import { nazwij, podaj, potwierdz, zloz, zlozBiorac } from './lib.mjs'

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

const answers = [
  'Rozdzial I', // rozdział
  'Grupa pojec', // nazwa grupy
]
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

/** Autozapis ścieżki ma 500 ms zwłoki — czekamy, zanim czytamy bazę. */
const settle = () => page.waitForTimeout(900)

/** Kafelki bywają nałożone w wąskim widoku testowym — klikamy bez sprawdzania
 *  przesłonięcia, bo interesuje nas logika, nie układ. */
const clickNode = (name, opts = {}) =>
  page.click(`.react-flow__node:has-text("${name}") .path-node-head`, opts)

const readPath = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const tx = req.result.transaction('paths', 'readonly')
    const all = await new Promise((res) => {
      const r = tx.objectStore('paths').getAll()
      r.onsuccess = () => res(r.result)
    })
    const p = all[0]
    return {
      wezly: p.nodes.map((n) => n.kind),
      krawedzie: p.edges.length,
      krawedzieId: p.edges.map((e) => `${e.from}->${e.to}`),
      grupy: p.nodes.filter((n) => n.kind === 'fusion').map((n) => ({
        nazwa: n.name,
        typ: n.type ?? null,
        czesci: n.parts.length,
        czesciId: n.parts.map((x) => x.conceptId),
      })),
      blokiId: p.nodes.filter((n) => n.kind === 'block').map((n) => n.conceptId),
    }
  })

/** Mapa id pojęcia → nazwa, żeby sprawdzać, co dokładnie trafiło do grupy. */
const conceptNames = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const tx = req.result.transaction('concepts', 'readonly')
    const all = await new Promise((res) => {
      const r = tx.objectStore('concepts').getAll()
      r.onsuccess = () => res(r.result)
    })
    return Object.fromEntries(all.map((c) => [c.id, c.name]))
  })

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// --- przygotowanie: cztery kafelki ---
for (const [name, type] of [
  ['Alfa', 'definicja'],
  ['Beta', 'definicja'],
  ['Gamma', 'twierdzenie'],
  ['Delta', 'przyklad'],
]) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.selectOption('.type-select', type)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc kafelka ${name}.`)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Sciezka testowa")
await page.waitForSelector('.path-canvas')

// --- 1. przeciąganie kafelków na mapę (rozstawione, żeby się nie nakładały) ---
const spots = [
  { x: 200, y: 120 },
  { x: 200, y: 480 },
  { x: 700, y: 120 },
  { x: 700, y: 480 },
]
const names = ['Alfa', 'Beta', 'Gamma', 'Delta']
for (let i = 0; i < names.length; i++) {
  await page.dragAndDrop(`.concept-item:has-text("${names[i]}")`, '.path-flow', {
    targetPosition: spots[i],
  })
  await page.waitForTimeout(450)
}
await settle()
let st = await readPath()
check('cztery kafelki na mapie', st.wezly.filter((k) => k === 'block').length === 4,
  `jest ${st.wezly.filter((k) => k === 'block').length}`)

// --- 2. łączenie strzałkami (Alfa → Beta) ---
for (let attempt = 1; attempt <= 4; attempt++) {
  const src = await page.locator('.react-flow__node:has-text("Alfa") .react-flow__handle-bottom').boundingBox()
  const dst = await page.locator('.react-flow__node:has-text("Beta") .react-flow__handle-top').boundingBox()
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
  await page.mouse.down()
  await page.mouse.move(src.x + 4, src.y + 8)
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  if ((await page.locator('.react-flow__edge:not(.relation-edge)').count()) > 0) break
}
await settle()
st = await readPath()
check('strzałka kolejności zapisana w ścieżce', st.krawedzie === 1, `krawędzi: ${st.krawedzie}`)

// --- 3. grupowanie dwóch kafelków ---
await clickNode('Alfa')
await page.keyboard.down('Control')
await clickNode('Beta')
await page.keyboard.up('Control')
await page.click('button:has-text("⧉ Scal")')
await zlozBiorac(page, 'Grupa pojec')
await page.waitForSelector('.path-node-group')
await settle()
st = await readPath()
const nazwy = await conceptNames()
const wGrupie = (st.grupy[0]?.czesciId ?? []).map((i) => nazwy[i]).sort()
check('grupa utworzona z dwóch kafelków', st.grupy.length === 1 && st.grupy[0].czesci === 2,
  JSON.stringify(st.grupy?.[0]?.czesci))
check('zgrupowane zostały właśnie Alfa i Beta', wGrupie.join(',') === 'Alfa,Beta',
  `w grupie: ${wGrupie.join(', ')}`)
check('typ grupy przejęty z jednakowych części (obie definicje)',
  st.grupy[0]?.typ === 'definicja', `typ: ${st.grupy[0]?.typ}`)
check('strzałka Alfa→Beta zniknęła po zgrupowaniu obu końców',
  st.krawedzie === 0, `krawędzi: ${st.krawedzie} (${st.krawedzieId.join(', ')})`)

// --- 4. dołożenie i wyjęcie kafelka z grupy ---
await page.click('.path-node-group button[title*="Dodaj kafelek"]')
await page.waitForSelector('.picker-modal')
await page.fill('.picker-search', 'Delta')
await page.waitForTimeout(300)
await page.click('.picker-item:has-text("Delta")')
await settle()
st = await readPath()
check('dołożenie kafelka do grupy', st.grupy[0]?.czesci === 3, `części: ${st.grupy[0]?.czesci}`)
await page.hover('.group-member:last-child')
await page.click('.group-member:last-child .folder-action', { force: true })
await settle()
st = await readPath()
check('wyjęcie kafelka z grupy', st.grupy[0]?.czesci === 2, `części: ${st.grupy[0]?.czesci}`)

// --- 5. rozdział i notatka (po grupowaniu, żeby nie zasłaniały kafelków) ---
await page.click('button:has-text("+ § Rozdział")')
await podaj(page, 'Rozdzial I')
await page.waitForSelector('.path-node-heading')
await page.click('button:has-text("+ Notatka")')
await page.waitForSelector('.path-node-text')
// odsuń notatkę i rozdział z centrum (przy okazji test przeciągania kafelków)
const dragNode = async (selector, dx, dy) => {
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 8 + dy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}
await dragNode('.path-node-text .path-node-grip', 380, 260)
await dragNode('.path-node-heading', -420, 260)
await settle()
st = await readPath()
check('rozdział i notatka dodane', st.wezly.includes('heading') && st.wezly.includes('text'),
  st.wezly.join(','))

// --- 6. wybór wersji członka grupy nie psuje reszty ---
const memberSelects = await page.locator('.group-member-version').count()
check('każdy członek grupy ma wybór wersji', memberSelects === 2, `jest ${memberSelects}`)

// --- 7. tryb liniowy: kolejność i zawartość ---
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-column')
await page.waitForTimeout(700)
const linear = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].map((s) => {
    if (s.querySelector('.script-group-block')) return 'grupa'
    if (s.querySelector('.script-heading-node')) return 'rozdział'
    if (s.querySelector('.linear-note')) return 'notatka'
    if (s.querySelector('.script-block')) return 'blok'
    return '?'
  }),
)
check('tryb liniowy pokazuje wszystkie segmenty (2 bloki, grupa, rozdział, notatka)',
  linear.length === 5 && linear.includes('grupa') && linear.filter((s) => s === 'blok').length === 2,
  linear.join(' | '))

// --- 8. skrypt: grupa jako jeden blok, reszta osobno ---
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body')
await page.waitForTimeout(700)
const script = await page.evaluate(() => ({
  grupy: document.querySelectorAll('.script-group-block').length,
  bloki: document.querySelectorAll('.script-block:not(.script-group-block)').length,
  naglowki: document.querySelectorAll('.script-heading-node').length,
  // złożony kafelek to JEDEN tekst — liczymy treść, nie „części"
  trescGrupy: document.querySelector('.script-group-block .block-content')?.textContent ?? '',
  zagniezdzone: document.querySelectorAll('.script-group-block .script-block').length,
}))
check('skrypt: grupa jako jeden blok', script.grupy === 1, JSON.stringify(script))
check('skrypt: kafelki w grupie bez własnych ramek', script.zagniezdzone === 0,
  `zagnieżdżonych: ${script.zagniezdzone}`)
check('skrypt: treść obu kafelków w złożonym bloku',
  script.trescGrupy.includes('Tresc kafelka Alfa') &&
    script.trescGrupy.includes('Tresc kafelka Beta'),
  script.trescGrupy.slice(0, 120))
check('skrypt: pozostałe kafelki osobno', script.bloki === 2, `bloków: ${script.bloki}`)

// --- 9. trwałość po przeładowaniu ---
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.concept-item:has-text("Sciezka testowa")')
await page.waitForSelector('.path-canvas')
await settle()
const afterReload = await readPath()
check('ścieżka przetrwała przeładowanie',
  afterReload.wezly.length === st.wezly.length && afterReload.grupy[0]?.czesci === 2,
  `węzły: ${afterReload.wezly.join(',')}`)

// --- 10. rozgrupowanie przywraca osobne kafelki ---
await page.click('.view-switch button:has-text("Mapa")')
await page.waitForSelector('.path-node-group')
// dopasuj widok, żeby kafelek grupy nie chował się pod paskiem narzędzi
// dopasuj widok, żeby cała mapa (w tym grupa) była w obszarze płótna
await page.click('.react-flow__controls-fitview')
await page.waitForTimeout(700)
await page.click('.path-node-group button[title*="Rozgrupuj"]')
// blok ma złożony tekst, więc rozdzielenie pyta — i zostawia go jako notatkę
await potwierdz(page)
await settle()
const ungrouped = await readPath()
check('rozgrupowanie usuwa kafelek grupy', ungrouped.grupy.length === 0,
  `grup: ${ungrouped.grupy.length}`)
check('rozgrupowanie przywraca oba kafelki jako osobne kafelki',
  ungrouped.wezly.filter((k) => k === 'block').length === 4,
  `bloków: ${ungrouped.wezly.filter((k) => k === 'block').length}, węzły: ${ungrouped.wezly.join(',')}`)

// --- 11. usunięcie kafelka z bazy nie wywraca ścieżki ---
await page.click('.concept-item:has-text("Gamma")')
await page.waitForSelector('.editor-name')
await page.click('.editor-header button:has-text("Usuń")')
await potwierdz(page)
await page.waitForTimeout(600)
await page.click('.concept-item:has-text("Sciezka testowa")')
await page.waitForSelector('.path-canvas')
await page.waitForTimeout(700)
const missing = await page.locator('.path-node-missing').count()
check('usunięty kafelek pokazany jako brakujący, ścieżka działa', missing === 1,
  `kafelków „usunięte": ${missing}`)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body')
await page.waitForTimeout(500)
check('skrypt nie wywala się po usunięciu kafelka',
  (await page.locator('.script-body').count()) === 1)

// --- 12. strzałki powiązań nie trafiają do zapisu ---
const finalState = await readPath()
check('zapis ścieżki bez strzałek powiązań',
  finalState.krawedzieId.every((e) => !e.includes('rel-')),
  finalState.krawedzieId.join(' | '))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
