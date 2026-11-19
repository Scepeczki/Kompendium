// Notatki z komputera na telefon: cała droga tam i z powrotem.
//
// Prawdziwego GitHuba nie ruszamy — podstawiamy jego odpowiedzi, a migawkę
// trzymamy w pamięci testu. Sprawdzamy to, na czym naprawdę zależy:
//  1. komputer wysyła to, co ma,
//  2. drugie urządzenie (czyli „telefon" — osobna, pusta baza) to pobiera
//     i widzi kafelki ORAZ ścieżki,
//  3. pobranie NIE KASUJE tego, co na telefonie już było.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

/** Migawka „na GitHubie" — jedyne miejsce, w którym coś między urządzeniami
 *  przechodzi. Zaczynamy z pustym, tak jak przy pierwszym wysłaniu. */
let migawka = null
/** Czy udawany klucz widzi repozytorium — do sprawdzania komunikatów błędów. */
let widacRepo = true

/** Udawany GitHub. Odpowiada dokładnie tak, jak potrzebuje src/telefon.ts. */
async function podstawGitHuba(context) {
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (req.method() === 'POST' && url.pathname.endsWith('/git/blobs')) {
      migawka = JSON.parse(req.postData()).content
      return json({ sha: 'blob-1' })
    }
    if (req.method() === 'POST' && url.pathname.endsWith('/git/trees')) return json({ sha: 'tree-1' })
    if (req.method() === 'POST' && url.pathname.endsWith('/git/commits')) return json({ sha: 'commit-1' })
    if (url.pathname.includes('/git/refs')) return json({ ref: 'refs/heads/dane' })
    if (url.pathname.endsWith('/contents/migawka.json')) {
      if (!migawka) return json({ message: 'Not Found' }, 404)
      return json({ content: migawka, encoding: 'base64' })
    }
    // samo repozytorium — po tym program rozpoznaje, czy klucz w ogóle widzi
    // to miejsce, czy tylko nie ma jeszcze migawki
    if (/^\/repos\/[^/]+\/[^/]+$/.test(url.pathname)) {
      return widacRepo ? json({ full_name: 'Scepeczki/Kompendium' }) : json({ message: 'Not Found' }, 404)
    }
    return json({ message: `nieobsługiwane w teście: ${req.method()} ${url.pathname}` }, 500)
  })
}

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})

/** Wypełnia pola i klika przycisk w Ustawieniach → Dane. */
async function ustawTelefon(page) {
  await page.click('.sidebar-foot-btn[title*="Ustawienia"], .sidebar-foot-btn:has-text("Ustawienia")')
  await page.waitForSelector('.settings-page')
  await page.click('.settings-nav button:has-text("Dane")')
  await page.waitForSelector('.settings-telefon')
  await page.fill('.settings-pole:has-text("Repozytorium") input', 'Scepeczki/Kompendium')
  await page.fill('.settings-pole:has-text("Klucz") input', 'github_pat_udawany')
  await page.click('.settings-label:has-text("Notatki na telefonie")')
}

// ============ KOMPUTER: robimy notatki i wysyłamy ============
const komputer = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await podstawGitHuba(komputer)
const pc = await komputer.newPage()
pc.on('pageerror', (e) => errors.push(`komputer: ${e}`))
await pc.goto('http://localhost:5173')
await pc.waitForSelector('text=Kompendium')

for (const n of ['Zbiór', 'Suma zbiorów']) {
  await pc.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await pc.waitForSelector('.editor-name')
  await pc.fill('.editor-name', n)
  await pc.click('.view-switch button:has-text("Kod")')
  await pc.click('.editor-code .cm-content')
  await pc.keyboard.type(`Definicja ${n} — z komputera.`)
  await pc.waitForTimeout(350)
  await pc.click('.btn-close[title*="Zamknij kafelek"]')
}
await nowaSciezka(pc, 'Wykład o mnogości')
await pc.click('.view-switch button:has-text("Linia")')
await pc.waitForSelector('.linear-append')
await pc.dragAndDrop('.concept-item:has-text("Zbiór")', '.linear-append')
await pc.waitForTimeout(500)

await ustawTelefon(pc)
await pc.click('.btn:has-text("Wyślij notatki")')
await pc.waitForSelector('.settings-status', { timeout: 20000 })
const wynik = await pc.textContent('.settings-status')
check('komputer wysyła notatki', wynik.includes('Wysłane'), wynik)
check('i wie, ile ich wysłał', /2 kafelków/.test(wynik), wynik)
check('migawka naprawdę powstała', typeof migawka === 'string' && migawka.length > 100,
  `${typeof migawka} ${migawka?.length ?? 0}`)

// ============ TELEFON: pusta baza, pobieramy ============
const telefon = await browser.newContext({ viewport: { width: 390, height: 844 } })
await podstawGitHuba(telefon)
const tel = await telefon.newPage()
tel.on('pageerror', (e) => errors.push(`telefon: ${e}`))
await tel.goto('http://localhost:5173')
await tel.waitForSelector('text=Kompendium')
await tel.click('.szuflada-przycisk')
await tel.waitForTimeout(400)
check('telefon startuje z pustą listą',
  (await tel.locator('.concept-item').count()) === 0,
  `${await tel.locator('.concept-item').count()}`)

// coś zrobione na telefonie — nie może zginąć przy pobraniu
await tel.click('.sidebar-create-btn[title="Nowy kafelek"]')
await tel.waitForSelector('.editor-name')
await tel.fill('.editor-name', 'Notatka z tramwaju')
await tel.waitForTimeout(500)
await tel.click('.btn-close[title*="Zamknij kafelek"]')
await tel.waitForTimeout(300)

await tel.click('.szuflada-przycisk')
await tel.waitForTimeout(300)
await ustawTelefon(tel)
await tel.click('.btn:has-text("Pobierz notatki")')
await tel.waitForSelector('.ask-dialog')
await tel.click('.ask-foot .btn:last-child')
await tel.waitForSelector('.settings-status', { timeout: 20000 })
const wynikTel = await tel.textContent('.settings-status')
check('telefon pobiera migawkę', wynikTel.includes('Pobrano'), wynikTel)

await tel.click('.settings-page-head button:has-text("Wróć")')
await tel.waitForTimeout(600)
await tel.click('.szuflada-przycisk')
await tel.waitForTimeout(400)
const naTelefonie = await tel.locator('.concept-item').allTextContents()
check('kafelki z komputera są na telefonie',
  ['Zbiór', 'Suma zbiorów'].every((n) => naTelefonie.some((t) => t.includes(n))),
  naTelefonie.join(' | '))
check('ścieżka też doszła',
  naTelefonie.some((t) => t.includes('Wykład o mnogości')),
  naTelefonie.join(' | '))
check('to, co było na telefonie, zostało',
  naTelefonie.some((t) => t.includes('Notatka z tramwaju')),
  naTelefonie.join(' | '))

// migawka niesie notatki, a nie wygląd komputera: spis treści na telefonie
// musi zostać schowany, choć na komputerze był otwarty
await tel.click('.concept-item:has-text("Wykład o mnogości")')
await tel.waitForSelector('.path-canvas')
await tel.waitForTimeout(500)
const spisWidoczny = await tel.evaluate(() => {
  const el = document.querySelector('.outline')
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.left < window.innerWidth && r.right > 0
})
check('migawka nie przywozi wyglądu komputera na telefon', !spisWidoczny)
await tel.click('.view-switch button:has-text("Linia")')
await tel.waitForSelector('.linear-seg')
await tel.waitForTimeout(600)
const tresc = await tel.locator('.linear-seg').first().innerText()
check('i daje się ją czytać z treścią kafelka',
  tresc.includes('z komputera'), tresc.slice(0, 50))

// ============ druga wysyłka nadpisuje, nie dokłada ============
await pc.click('.settings-page-head button:has-text("Wróć")')
await pc.waitForTimeout(400)
await pc.click('.sidebar-create-btn[title="Nowy kafelek"]')
await pc.waitForSelector('.editor-name')
await pc.fill('.editor-name', 'Iloczyn zbiorów')
await pc.waitForTimeout(500)
await pc.click('.btn-close[title*="Zamknij kafelek"]')
await ustawTelefon(pc)
await pc.click('.btn:has-text("Wyślij notatki")')
await pc.waitForSelector('.settings-status', { timeout: 20000 })
const drugi = await pc.textContent('.settings-status')
check('druga wysyłka niesie już trzy kafelki', /3 kafelków/.test(drugi), drugi)

// ============ ta sama migawka, ale plikiem (bez GitHuba) ============
//
// GitHub bywa niedostępny akurat wtedy, gdy człowiek chce wyjść z domu, więc
// druga droga musi działać sama z siebie. Zawartość jest ta sama, więc i tu
// wczytanie nie może niczego skasować.
const { promises: fs } = await import('node:fs')
const os = await import('node:os')
const path = await import('node:path')

const pobieranie = pc.waitForEvent('download')
await pc.click('.btn:has-text("Migawka do pliku")')
const plik = await pobieranie
const sciezkaPliku = path.join(os.tmpdir(), 'migawka-test.json')
await plik.saveAs(sciezkaPliku)
const zawartosc = JSON.parse(await fs.readFile(sciezkaPliku, 'utf8'))
check('plik migawki powstaje i ma notatki',
  Array.isArray(zawartosc.concepts) && zawartosc.concepts.length === 3,
  `kafelków w pliku: ${zawartosc.concepts?.length}`)
check('nazwa pliku mówi, co to jest', /^notatki-\d{4}-\d{2}-\d{2}\.json$/.test(plik.suggestedFilename()),
  plik.suggestedFilename())

// trzecie urządzenie: pusta baza, żadnego GitHuba, tylko plik
const drugiTelefon = await browser.newContext({ viewport: { width: 390, height: 844 } })
// GitHub podstawiamy też tutaj — droga plikowa go nie dotyka, ale niżej
// sprawdzamy komunikaty błędów i nie chcemy przy tym pukać do prawdziwego
await podstawGitHuba(drugiTelefon)
const tel2 = await drugiTelefon.newPage()
tel2.on('pageerror', (e) => errors.push(`telefon2: ${e}`))
await tel2.goto('http://localhost:5173')
await tel2.waitForSelector('text=Kompendium')
await tel2.click('.szuflada-przycisk')
await tel2.waitForTimeout(400)
await tel2.click('.sidebar-create-btn[title="Nowy kafelek"]')
await tel2.waitForSelector('.editor-name')
await tel2.fill('.editor-name', 'Zrobione bez internetu')
await tel2.waitForTimeout(500)
await tel2.click('.btn-close[title*="Zamknij kafelek"]')
await tel2.waitForTimeout(300)
await tel2.click('.szuflada-przycisk')
await tel2.waitForTimeout(300)
await tel2.click('.sidebar-foot-btn[title*="Ustawienia"]')
await tel2.waitForSelector('.settings-page')
await tel2.click('.settings-nav button:has-text("Dane")')
await tel2.waitForSelector('.settings-telefon')
await tel2.setInputFiles('input[type=file][accept*="json"]', sciezkaPliku)
await tel2.waitForSelector('.ask-dialog')
await tel2.click('.ask-foot .btn:last-child')
await tel2.waitForSelector('.settings-status', { timeout: 20000 })
const wynikPlik = await tel2.textContent('.settings-status')
check('wczytanie z pliku działa bez GitHuba', wynikPlik.includes('Wczytane z pliku'), wynikPlik)
await tel2.click('.settings-page-head button:has-text("Wróć")')
await tel2.waitForTimeout(500)
await tel2.click('.szuflada-przycisk')
await tel2.waitForTimeout(400)
const naDrugim = await tel2.locator('.concept-item').allTextContents()
check('kafelki z pliku doszły',
  ['Zbiór', 'Suma zbiorów', 'Iloczyn zbiorów'].every((n) => naDrugim.some((t) => t.includes(n))),
  naDrugim.join(' | '))
check('i tu też nic nie zginęło',
  naDrugim.some((t) => t.includes('Zrobione bez internetu')),
  naDrugim.join(' | '))
await fs.unlink(sciezkaPliku).catch(() => {})

// ============ komunikaty błędów mówią, co poprawić ============
//
// GitHub na brak migawki i na brak dostępu odpowiada tak samo („404"), a to
// dwie zupełnie różne sprawy: raz trzeba wysłać z komputera, raz poprawić
// klucz. Program musi je rozróżniać, bo inaczej zostaje zgadywanie.
migawka = null
widacRepo = true
// szuflada jest w tym miejscu otwarta, więc korzystamy z wejścia w jej stopce
await tel2.click('.sidebar-foot-btn[title*="Ustawienia"]')
await tel2.waitForSelector('.settings-page')
await tel2.click('.settings-nav button:has-text("Dane")')
await tel2.waitForSelector('.settings-telefon')
await tel2.fill('.settings-pole:has-text("Repozytorium") input', 'Scepeczki/Kompendium')
await tel2.fill('.settings-klucz input', 'github_pat_udawany')
await tel2.click('.settings-label:has-text("Notatki na telefonie")')
await tel2.click('.btn:has-text("Pobierz notatki")')
await tel2.waitForSelector('.ask-dialog')
await tel2.click('.ask-foot .btn:last-child')
await tel2.waitForSelector('.settings-status', { timeout: 20000 })
const bezMigawki = await tel2.textContent('.settings-status')
check('brak migawki: program mówi, żeby wysłać z komputera',
  bezMigawki.includes('nie ma w nim jeszcze żadnej migawki'), bezMigawki)

widacRepo = false
await tel2.click('.btn:has-text("Pobierz notatki")')
await tel2.waitForSelector('.ask-dialog')
await tel2.click('.ask-foot .btn:last-child')
await tel2.waitForTimeout(1200)
const bezDostepu = await tel2.textContent('.settings-status')
check('brak dostępu: program mówi o kluczu i uprawnieniach',
  bezDostepu.includes('Klucz nie widzi repozytorium'), bezDostepu)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${String(e).slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
