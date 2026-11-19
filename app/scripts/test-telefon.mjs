// Kompendium na telefonie: czytelnia, nie warsztat.
//
// Na sześciu calach mieści się jedna kolumna, więc lista i spis treści muszą
// wjeżdżać z boku, a PDF w ogóle się nie pokazuje. Sprawdzamy to, co naprawdę
// się na telefonie robi: znaleźć ścieżkę, przeczytać, skoczyć po spisie treści
// i powtórzyć w trybie zakrytym.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

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
// najpierw duży ekran: zakładamy treść tak, jak robi się to przy biurku
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Zbiór', 'Suma zbiorów']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc kafelka ${n} — kilka slow, zeby bylo co czytac.`)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await nowaSciezka(page, 'Teoria mnogości')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Zbiór', 'Suma zbiorów']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(350)
}
await page.click('.linear-append .btn:has-text("Rozdział")')
await page.waitForSelector('.ask-input')
await page.fill('.ask-input', 'Podstawy')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(800)

// --- i teraz to samo w kieszeni ---
// Telefon to inne urządzenie, więc nie ma tu wyborów zrobionych przy biurku —
// kasujemy zapamiętany stan spisu treści, żeby sprawdzić, jak program wita
// kogoś, kto wchodzi z telefonu pierwszy raz.
await page.evaluate(() => localStorage.removeItem('ui.outline'))
await page.setViewportSize({ width: 390, height: 844 })
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)

const widoczne = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth
  }, sel)

check('lista nie zajmuje ekranu, dopóki jej nie zawołasz', !(await widoczne('.sidebar')))
check('jest czym ją zawołać', await widoczne('.szuflada-przycisk'))

// Wejście w Ustawienia MUSI być widoczne od razu, bez szukania po stopkach:
// stamtąd pobiera się notatki z komputera. Sprawdzamy, że stoi w rogu, jest
// wielkości palca i nie zachodzi na ☰.
const rogi = await page.evaluate(() => {
  const p = (s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), prawa: Math.round(r.right) }
  }
  return { menu: p('.szuflada-przycisk'), ust: p('.ustawienia-przycisk') }
})
check('Ustawienia mają własne wejście w rogu ekranu',
  rogi.ust !== null && rogi.ust.y >= 0 && rogi.ust.w >= 36 && rogi.ust.h >= 36,
  JSON.stringify(rogi.ust))
check('i nie zachodzi na przycisk listy',
  rogi.menu !== null && rogi.ust !== null && rogi.ust.x >= rogi.menu.prawa,
  `☰ kończy się na ${rogi.menu?.prawa}, zębatka zaczyna na ${rogi.ust?.x}`)
await page.click('.ustawienia-przycisk')
await page.waitForSelector('.settings-page')
check('i naprawdę otwiera Ustawienia', (await page.locator('.settings-page').count()) === 1)
await page.click('.settings-nav button:has-text("Dane")')
await page.waitForSelector('.settings-telefon')
check('a w nich sekcję pobierania notatek',
  (await page.locator('.btn:has-text("Pobierz notatki")').count()) === 1)
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForTimeout(400)
check('panel PDF się nie pokazuje', !(await widoczne('.pdf-panel')))

// nic nie może wystawać poza ekran — poziome przewijanie to pierwszy objaw,
// że układ się nie zmieścił
const szerokosc = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  okno: window.innerWidth,
}))
check('nic nie wystaje poza szerokość ekranu', szerokosc.doc <= szerokosc.okno + 1,
  `${szerokosc.doc} / ${szerokosc.okno}`)

await page.click('.szuflada-przycisk')
await page.waitForTimeout(400)
check('szuflada wjeżdża', await widoczne('.sidebar'))

// Wejście w Ustawienia musi dać się TRAFIĆ PALCEM. Na dole ekranu telefonu
// siedzi pasek przeglądarki i pasek gestów, więc przycisk przyklejony do
// krawędzi jest formalnie widoczny, a w dłoni nieosiągalny.
const ust = await page.evaluate(() => {
  const el = document.querySelector('.sidebar-foot-btn[title*="Ustawienia"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    odDolu: Math.round(innerHeight - r.bottom),
    w: Math.round(r.width),
    h: Math.round(r.height),
  }
})
check('wejście w Ustawienia nie klei się do dolnej krawędzi',
  ust !== null && ust.odDolu >= 16, `${ust?.odDolu} px od dołu`)
check('i jest wielkości palca, nie kursora',
  ust !== null && ust.w >= 40 && ust.h >= 40, `${ust?.w}×${ust?.h}`)
await page.click('.concept-item:has-text("Teoria mnogości")')
await page.waitForTimeout(600)
check('wybór ścieżki chowa szufladę z powrotem', !(await widoczne('.sidebar')))
check('i widać ścieżkę', (await page.locator('.path-canvas').count()) === 1)

await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(500)
const tresc = await page.locator('.linear-seg').first().innerText()
check('treść kafelka daje się przeczytać', tresc.includes('Tresc kafelka'), tresc.slice(0, 40))

// spis treści: na telefonie startuje schowany i wjeżdża z prawej
check('spis treści nie zabiera miejsca treści', !(await widoczne('.outline')))
await page.click('.outline-reopen')
await page.waitForTimeout(400)
check('i wraca przyciskiem', await widoczne('.outline'))
const poza = await page.evaluate(() => {
  const r = document.querySelector('.outline').getBoundingClientRect()
  return { right: Math.round(r.right), okno: window.innerWidth }
})
check('spis mieści się w ekranie', poza.right <= poza.okno + 1, `${poza.right} / ${poza.okno}`)

// wybór miejsca w spisie chowa go — inaczej zasłaniałby to, do czego właśnie
// skoczyłeś, i trzeba by go zamykać osobnym ruchem
// „Początek" to tylko podpis grupy, nie miejsce — celujemy w prawdziwy rozdział
await page.locator('.outline-item.level-1:not(.outline-poczatek)').first().click()
await page.waitForTimeout(500)
check('klik w spisie chowa go i pokazuje treść', !(await widoczne('.outline')))

// tryb zakryty — po to się w tramwaju wyjmuje telefon
await page.click('.path-toolbar button:has-text("Zakryj")')
await page.waitForTimeout(500)
check('tryb zakryty działa na telefonie',
  (await page.locator('.kafelek-zakryty').count()) > 0,
  `zakrytych: ${await page.locator('.kafelek-zakryty').count()}`)
await page.locator('.kafelek-zakryty').first().click()
await page.waitForTimeout(400)
check('odsłonięcie kliknięciem też',
  (await page.locator('.kafelek-odslony').count()) === 1)

// --- aplikacja da się zainstalować na ekranie głównym ---
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel=manifest]')
  if (!link) return null
  const r = await fetch(link.href)
  return r.ok ? await r.json() : null
})
check('manifest jest i ma nazwę', manifest?.name === 'Kompendium', JSON.stringify(manifest?.name))
check('ma ikony dla ekranu głównego',
  (manifest?.icons ?? []).some((i) => i.sizes === '512x512'),
  (manifest?.icons ?? []).map((i) => i.sizes).join(' '))
check('wchodzi w tryb pełnoekranowy', manifest?.display === 'standalone')

const sw = await page.evaluate(() =>
  navigator.serviceWorker.getRegistration().then((r) => !!r),
)
check('tryb offline włączony', sw)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
