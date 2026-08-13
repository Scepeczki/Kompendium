// Przykłady należą do ścieżki, a nie do biblioteki.
//
// Ścieżka jest folderem na przykłady: robi się je w środku, mieszkają tam
// i nie zaśmiecają listy pojęć po lewej. Że nie widać ich w bibliotece, nie
// znaczy jednak, że wolno im przepaść — wyjęty ze ścieżki przykład ma wrócić
// do listy, a napisany w nim tekst ma siedzieć w samym klocku.
import { chromium } from 'playwright'
import { nowaSciezka, potwierdz } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// zwykły klocek w bibliotece — punkt odniesienia
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Zbiór')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij klocek"]')

await nowaSciezka(page, 'Wykład')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Zbiór")', '.linear-append')
await page.waitForTimeout(500)

const wBibliotece = async (nazwa) =>
  (await page.locator(`.concept-item:has-text("${nazwa}")`).count()) > 0

// --- przykład rodzi się wprost w ścieżce ---
await page.click('.linear-append-actions .btn:has-text("Przykład")')
await page.waitForTimeout(700)
check('przykład wskakuje do ścieżki',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)
check('i nie pokazuje się w bibliotece po lewej', !(await wBibliotece('Przykład')))
check('zwykły klocek dalej jest w bibliotece', await wBibliotece('Zbiór'))

// --- tekst pisany w przykładzie siedzi w samym klocku ---
await page.locator('.linear-seg').nth(1).locator('.tiptap').click()
await page.keyboard.type('Zbior liczb parzystych.')
await page.waitForTimeout(900)
// przeładowanie: gdyby tekst został tylko „obok", w klocku byłaby pustka
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Wykład")')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(1200)
const tresc = await page.locator('.linear-seg').nth(1).innerText()
check('napisany tekst zostaje po przeładowaniu', tresc.includes('parzystych'), tresc.slice(0, 60))

await page.locator('.linear-seg').nth(1).click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Otwórz klocek w edytorze")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(700)
const wKlocku = await page.locator('.editor-body').innerText()
check('to jest treść klocka, a nie tekst dopisany obok niego',
  wKlocku.includes('parzystych'), wKlocku.slice(0, 60))
check('edytor mówi, że kafelek mieszka tylko w ścieżce',
  (await page.locator('.editor-sciezka-wlasny').count()) === 1)

// --- wyjęty ze ścieżki wraca do biblioteki ---
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(400)
await page.locator('.linear-seg').nth(1).click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Usuń ze ścieżki")')
await page.waitForTimeout(900)
check('po wyjęciu ze ścieżki przykład wraca do biblioteki', await wBibliotece('Przykład'))
check('i nie ma go już w ścieżce',
  (await page.locator('.linear-seg').count()) === 1,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// --- to samo działa dla zadań: „mieszka w ścieżce" to cecha RODZAJU ---
await page.click('.linear-append-actions .btn:has-text("Zadanie")')
await page.waitForTimeout(700)
check('zadanie też wskakuje wprost do ścieżki',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)
check('i też nie idzie do biblioteki', !(await wBibliotece('Zadanie')))
await page.locator('.linear-seg').nth(1).click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Usuń ze ścieżki")')
await page.waitForTimeout(900)

// --- przykład zrobiony wcześniej w bibliotece też da się schować w ścieżce ---
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Stary przykład')
await page.selectOption('.type-select', 'przyklad')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(400)
check('nowy przykład startuje w bibliotece', await wBibliotece('Stary przykład'))
// upuszczenie na ścieżkę w liście po lewej — ścieżka zachowuje się jak folder
await page.dragAndDrop(
  '.concept-item:has-text("Stary przykład")',
  '.path-item:has-text("Wykład")',
  { targetPosition: { x: 90, y: 11 } },
)
await page.waitForTimeout(900)
check('upuszczony na ścieżkę przykład znika z biblioteki',
  !(await wBibliotece('Stary przykład')))
check('a stoi w ścieżce',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// Upuszczenie na ścieżkę to „włóż do folderu", nie „dołóż jeszcze raz":
// kafelek, który już tam stoi, nie może zrobić sobie kopii na dole.
await page.dragAndDrop(
  '.concept-item:has-text("Zbiór")',
  '.path-item:has-text("Wykład")',
  { targetPosition: { x: 90, y: 11 } },
)
await page.waitForTimeout(900)
check('kafelek już obecny w ścieżce nie robi sobie kopii',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// --- przeciągnięcie WPROST W SKRYPT też wkłada do ścieżki ---
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Przykład sprzed zmiany')
await page.selectOption('.type-select', 'przyklad')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(400)
await page.dragAndDrop('.concept-item:has-text("Przykład sprzed zmiany")', '.linear-append')
await page.waitForTimeout(900)
// To jest droga, którą się naprawdę pracuje: chwyta się kafelek w liście
// i wrzuca WPROST W SKRYPT. Musi znikać z listy tak samo, jak przy upuszczeniu
// na wiersz ścieżki — dawniej ta droga omijała zadomawianie.
check('przeciągnięty wprost w skrypt też znika z biblioteki',
  !(await wBibliotece('Przykład sprzed zmiany')))
check('i stoi w ścieżce',
  (await page.locator('.linear-seg').count()) === 3,
  `segmentów: ${await page.locator('.linear-seg').count()}`)
// --- przycisk „Schowaj w ścieżce" sprząta to, co zostało z dawnych czasów ---
//
// Przykłady zrobione przed tą zmianą stoją w ścieżce, ale nie są do niej
// przypisane, więc dalej sterczą w liście. Udajemy taki stan, odpinając
// przypisanie wprost w bazie — inaczej nie da się go już zrobić z ekranu.
check('zanim jest co sprzątać, przycisku nie ma',
  (await page.locator('.path-toolbar .btn:has-text("Schowaj w ścieżce")').count()) === 0)
await page.evaluate(
  () =>
    new Promise((res, rej) => {
      const req = indexedDB.open('kompendium')
      req.onerror = () => rej(req.error)
      req.onsuccess = () => {
        const d = req.result
        const tx = d.transaction('concepts', 'readwrite')
        const st = tx.objectStore('concepts')
        st.getAll().onsuccess = (e) => {
          for (const c of e.target.result) {
            if (c.name === 'Przykład sprzed zmiany') {
              delete c.pathId
              st.put(c)
            }
          }
        }
        tx.oncomplete = () => {
          d.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      }
    }),
)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Wykład")')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForTimeout(900)
check('odpięty przykład wraca do listy po lewej',
  await wBibliotece('Przykład sprzed zmiany'))
check('pasek ścieżki proponuje sprzątanie',
  (await page.locator('.path-toolbar .btn:has-text("Schowaj w ścieżce")').count()) === 1)
await page.click('.path-toolbar .btn:has-text("Schowaj w ścieżce")')
await potwierdz(page)
await page.waitForTimeout(700)
check('po schowaniu znika z biblioteki', !(await wBibliotece('Przykład sprzed zmiany')))
check('a przycisk się chowa, bo nie ma już czego sprzątać',
  (await page.locator('.path-toolbar .btn:has-text("Schowaj w ścieżce")').count()) === 0)

// --- skasowanie ścieżki też nie może połknąć przykładu ---
await page.click('.linear-append-actions .btn:has-text("Przykład")')
await page.waitForTimeout(700)
check('przed skasowaniem ścieżki przykładów nie widać',
  !(await wBibliotece('Stary przykład')) && !(await wBibliotece('Przykład sprzed zmiany')))
await page.locator('.path-item:has-text("Wykład")').click({ button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Usuń")')
await potwierdz(page)
await page.waitForTimeout(900)
check('skasowanie ścieżki wypuszcza jej przykłady do biblioteki',
  (await wBibliotece('Stary przykład')) && (await wBibliotece('Przykład sprzed zmiany')))

// --- decyzja o pojedynczym kafelku: „trzymaj tutaj" / „odeślij" ---
//
// Rodzaj załatwia zwykły przypadek, ale o każdym kafelku musi dać się
// zdecydować ręcznie, bez chodzenia do ustawień i bez pytań przy zmianie
// rodzaju. Zwykła definicja też może zostać w ścieżce, jeśli tak chcesz.
await nowaSciezka(page, 'Wykład drugi')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Tylko na ten wykład')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(400)
await page.dragAndDrop('.concept-item:has-text("Tylko na ten wykład")', '.linear-append')
await page.waitForTimeout(900)
check('definicja przeciągnięta w skrypt zostaje w bibliotece',
  await wBibliotece('Tylko na ten wykład'))
await page.locator('.linear-seg').last().click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Trzymaj tylko tutaj")')
await page.waitForTimeout(800)
check('„Trzymaj tylko tutaj" zabiera ją z listy',
  !(await wBibliotece('Tylko na ten wykład')))
await page.locator('.linear-seg').last().click({ button: 'right', position: { x: 240, y: 8 } })
await page.waitForSelector('.tree-menu')
check('a menu proponuje teraz drogę powrotną',
  (await page.locator('.tree-menu-item:has-text("Odeślij do biblioteki")').count()) === 1)
await page.click('.tree-menu-item:has-text("Odeślij do biblioteki")')
await page.waitForTimeout(800)
check('odesłana wraca do listy, zostając w ścieżce',
  (await wBibliotece('Tylko na ten wykład')) &&
    (await page.locator('.linear-seg').count()) === 1,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// zmiana rodzaju o nic nie pyta — sam rodzaj nikogo nigdzie nie przenosi
await page.click('.concept-item:has-text("Tylko na ten wykład")')
await page.waitForSelector('.type-select')
await page.selectOption('.type-select', 'zadanie')
await page.waitForTimeout(700)
check('nadanie rodzaju ścieżkowego niczego nie pyta',
  (await page.locator('.modal-backdrop').count()) === 0)

// --- stara baza: rodzaje sprzed tej zmiany dostają „w ścieżce" przy starcie ---
//
// Baza założona wcześniej ma „Przykład" bez tej cechy i nie zna „Zadania".
// Bez dosypania przy starcie wkładanie do ścieżki nic by nie robiło —
// kafelek wchodziłby do ścieżki i dalej sterczał w liście po lewej.
await page.evaluate(
  () =>
    new Promise((res, rej) => {
      const req = indexedDB.open('kompendium')
      req.onerror = () => rej(req.error)
      req.onsuccess = () => {
        const d = req.result
        const tx = d.transaction('blockTypes', 'readwrite')
        const st = tx.objectStore('blockTypes')
        st.getAll().onsuccess = (e) => {
          for (const t of e.target.result) {
            if (t.id === 'zadanie') st.delete('zadanie')
            else if (t.wSciezce) {
              delete t.wSciezce
              st.put(t)
            }
          }
        }
        tx.oncomplete = () => {
          d.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      }
    }),
)
await page.evaluate(() => localStorage.removeItem('ui.rodzajeWSciezce.v1'))
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(900)
const rodzaje = await page.evaluate(
  () =>
    new Promise((res, rej) => {
      const req = indexedDB.open('kompendium')
      req.onerror = () => rej(req.error)
      req.onsuccess = () => {
        const d = req.result
        const st = d.transaction('blockTypes', 'readonly').objectStore('blockTypes')
        st.getAll().onsuccess = (e) => {
          d.close()
          res(e.target.result.filter((t) => t.wSciezce).map((t) => t.id))
        }
      }
    }),
)
check('stara baza dostaje „w ścieżce" dla przykładu i zadania',
  rodzaje.length === 2 && rodzaje.includes('przyklad') && rodzaje.includes('zadanie'),
  rodzaje.join(' · '))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
