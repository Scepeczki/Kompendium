// Przykłady należą do ścieżki, a nie do biblioteki.
//
// Ścieżka jest folderem na przykłady: robi się je w środku, mieszkają tam
// i nie zaśmiecają listy pojęć po lewej. Że nie widać ich w bibliotece, nie
// znaczy jednak, że wolno im przepaść — wyjęty ze ścieżki przykład ma wrócić
// do listy, a napisany w nim tekst ma siedzieć w samym kafelku.
import { chromium } from 'playwright'
import { nowaSciezka, potwierdz } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// zwykły kafelek w bibliotece — punkt odniesienia
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Zbiór')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij kafelek"]')

await nowaSciezka(page, 'Wykład')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Zbiór")', '.linear-append')
await page.waitForTimeout(500)

// kafelki widoczne w rozwiniętej ścieżce mieszkają w niej, a nie w bibliotece
const wBibliotece = (nazwa) =>
  page.evaluate(
    (n) =>
      [...document.querySelectorAll('.concept-item')].some(
        (el) => !el.closest('.sciezka-dzieci') && el.textContent.includes(n),
      ),
    nazwa,
  )

/** „Kafelek" na dole Linii, a w nim rodzaj z listy po najechaniu. */
const dolozRodzaj = async (rodzaj) => {
  await page.hover('.dodaj-kafelek-pasek > .btn-dolacz')
  await page.click(`.dodaj-kafelek-pasek .dodaj-kafelek-rodzaje .tree-menu-item:has-text("${rodzaj}")`)
}

// --- przykład rodzi się wprost w ścieżce ---
await dolozRodzaj('Przykład')
await page.waitForTimeout(700)
check('przykład wskakuje do ścieżki',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)
check('i nie pokazuje się w bibliotece po lewej', !(await wBibliotece('Przykład')))
check('zwykły kafelek dalej jest w bibliotece', await wBibliotece('Zbiór'))

// --- tekst pisany w przykładzie siedzi w samym kafelku ---
await page.locator('.linear-seg').nth(1).locator('.tiptap').click()
await page.keyboard.type('Zbior liczb parzystych.')
await page.waitForTimeout(900)
// przeładowanie: gdyby tekst został tylko „obok", w kafelku byłaby pustka
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Wykład")')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(1200)
const tresc = await page.locator('.linear-seg').nth(1).innerText()
check('napisany tekst zostaje po przeładowaniu', tresc.includes('parzystych'), tresc.slice(0, 60))

await page.locator('.linear-seg').nth(1).click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Otwórz kafelek w edytorze")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(700)
const wKlocku = await page.locator('.editor-body').innerText()
check('to jest treść kafelka, a nie tekst dopisany obok niego',
  wKlocku.includes('parzystych'), wKlocku.slice(0, 60))
check('edytor mówi, że kafelek mieszka tylko w ścieżce',
  (await page.locator('.editor-sciezka-wlasny').count()) === 1)

// --- wyjęty ze ścieżki wraca do biblioteki ---
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForTimeout(400)
await page.locator('.linear-seg').nth(1).click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Usuń ze ścieżki")')
// mieszkał tylko tutaj, więc program pyta, czy usunąć go na dobre
await page.click('.ask-foot .btn:has-text("Zachowaj w liście")')
await page.waitForTimeout(900)
check('po wyjęciu ze ścieżki i „Zachowaj w liście" przykład wraca do biblioteki', await wBibliotece('Przykład'))
check('i nie ma go już w ścieżce',
  (await page.locator('.linear-seg').count()) === 1,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// --- to samo działa dla zadań: „mieszka w ścieżce" to cecha RODZAJU ---
await dolozRodzaj('Zadanie')
await page.waitForTimeout(700)
check('zadanie też wskakuje wprost do ścieżki',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)
check('i też nie idzie do biblioteki', !(await wBibliotece('Zadanie')))
await page.locator('.linear-seg').nth(1).click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Usuń ze ścieżki")')
await page.click('.ask-foot .btn:has-text("Zachowaj w liście")')
await page.waitForTimeout(900)

// --- kafelek z listy wciągnięty do ścieżki ZOSTAJE w liście ---
//
// Rodzaj nie przesądza już, gdzie kafelek mieszka. Wciągnięcie do ścieżki to
// tylko ułożenie wykładu; o tym, czy kafelek znika z listy, decydujesz osobno.
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Stary przykład')
await page.selectOption('.type-select', 'przyklad')
await page.waitForTimeout(500)
check('zmiana rodzaju o nic nie pyta',
  (await page.locator('.modal-backdrop').count()) === 0)
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForTimeout(400)
await page.dragAndDrop('.concept-item:has-text("Stary przykład")', '.linear-append')
await page.waitForTimeout(900)
check('wciągnięty do skryptu przykład zostaje w liście',
  await wBibliotece('Stary przykład'))
check('i stoi w ścieżce',
  (await page.locator('.linear-seg').count()) === 2,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// Upuszczenie na wiersz ścieżki to „włóż do folderu", nie „dołóż jeszcze raz":
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
// ścieżka jest folderem: upuszczony na nią kafelek przeprowadza się do niej
check('upuszczony na ścieżkę kafelek przeprowadza się do niej', !(await wBibliotece('Zbiór')))

// wciągnięty do Linii zostaje w liście, dopiero ręczna decyzja go zabiera
check('przykład wciągnięty do Linii dalej jest w liście', await wBibliotece('Stary przykład'))
await page.locator('.linear-seg').last().click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Trzymaj tylko tutaj")')
await page.waitForTimeout(800)
check('dopiero „Trzymaj tylko tutaj" zabiera go z listy',
  !(await wBibliotece('Stary przykład')))

// --- skasowanie ścieżki też nie może połknąć przykładu ---
await dolozRodzaj('Przykład')
await page.waitForTimeout(700)
check('przed skasowaniem ścieżki przykładów nie widać',
  !(await wBibliotece('Stary przykład')))
await page.locator('.path-item:has-text("Wykład")').click({ button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Usuń")')
await potwierdz(page)
await page.waitForTimeout(900)
check('skasowanie ścieżki wypuszcza jej przykłady do biblioteki',
  await wBibliotece('Stary przykład'))

// --- decyzja o pojedynczym kafelku: „trzymaj tutaj" / „odeślij" ---
//
// To jest jedyny sposób, w jaki kafelek znika z listy — i działa dla KAŻDEGO
// rodzaju, także zwykłej definicji. Rodzaj rozstrzyga tylko to, czy w ścieżce
// jest przycisk „nowy ‹rodzaj›".
await nowaSciezka(page, 'Wykład drugi')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Tylko na ten wykład')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForTimeout(400)
await page.dragAndDrop('.concept-item:has-text("Tylko na ten wykład")', '.linear-append')
await page.waitForTimeout(900)
check('definicja przeciągnięta w skrypt zostaje w bibliotece',
  await wBibliotece('Tylko na ten wykład'))
await page.locator('.linear-seg').last().click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Trzymaj tylko tutaj")')
await page.waitForTimeout(800)
check('„Trzymaj tylko tutaj" zabiera ją z listy',
  !(await wBibliotece('Tylko na ten wykład')))
await page.locator('.linear-seg').last().click({ button: 'right', position: { x: 240, y: 30 } })
await page.waitForSelector('.tree-menu')
check('a menu proponuje teraz drogę powrotną',
  (await page.locator('.tree-menu-item:has-text("Odeślij do biblioteki")').count()) === 1)
await page.click('.tree-menu-item:has-text("Odeślij do biblioteki")')
await page.waitForTimeout(800)
check('odesłana wraca do listy, zostając w ścieżce',
  (await wBibliotece('Tylko na ten wykład')) &&
    (await page.locator('.linear-seg').count()) === 1,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

// zmiana rodzaju niczego nie przenosi — kafelek zostaje tam, gdzie był
await page.click('.concept-item:has-text("Tylko na ten wykład")')
await page.waitForSelector('.type-select')
await page.selectOption('.type-select', 'zadanie')
await page.waitForTimeout(700)
check('zmiana rodzaju nie rusza kafelka z listy',
  (await page.locator('.modal-backdrop').count()) === 0 &&
    (await wBibliotece('Tylko na ten wykład')))

// --- stara baza: rodzaje sprzed tej zmiany dostają „nowy w ścieżce" ---
//
// Baza założona wcześniej ma „Przykład" bez tej cechy i nie zna „Zadania".
// Bez dosypania przy starcie w ścieżce zabrakłoby przycisków do pisania
// przykładów i zadań na miejscu.
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
check('stara baza dostaje „nowy w ścieżce" dla przykładu i zadania',
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
