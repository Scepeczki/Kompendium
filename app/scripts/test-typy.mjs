// Test edytora typów kafelków: dodawanie własnych, nazwa, skrót, barwa,
// chowanie z listy wyboru, usuwanie z przepisaniem kafelków, zapis w bazie
// i w kopii zapasowej. Plus błąd: Ustawienia nie mogą blokować listy.
import { chromium } from 'playwright'
import { potwierdz } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const doTypow = async () => {
  await page.click('.sidebar-foot-btn[title="Ustawienia"]')
  await page.waitForSelector('.settings-page')
  await page.click('.settings-nav-item:has-text("Typy kafelków")')
  await page.waitForSelector('.type-row')
}

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Kafelek próbny')
await page.waitForTimeout(400)

// 1. BŁĄD Z ZGŁOSZENIA: klik w kafelek przy otwartych Ustawieniach
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.concept-item:has-text("Kafelek próbny")')
await page.waitForTimeout(400)
check('klik w kafelek zamyka Ustawienia i otwiera edytor',
  (await page.locator('.settings-page').count()) === 0 &&
    (await page.locator('.editor-name').count()) === 1)

// 2. lista typów: sześć do wyboru, osiem wszystkich (dowód i intuicja schowane)
await doTypow()
const wiersze = await page.locator('.type-row').count()
const doWyboru = await page.evaluate(
  () =>
    [...document.querySelectorAll('.type-row')].filter(
      (r) => r.querySelector('input[type=checkbox]').checked,
    ).length,
)
check('wszystkie typy fabryczne widoczne w edytorze', wiersze === 9, `${wiersze}`)
check('siedem typów proponowanych przy kafelku', doWyboru === 7, `${doWyboru}`)
check('każdy typ da się usunąć, także fabryczny',
  (await page.locator('.type-row-del:disabled').count()) === 0)

// 2a. „nowy w ścieżce" — te rodzaje dostają w wykładzie przycisk do pisania
// kafelka na miejscu. Fabrycznie: przykład i zadanie.
const wSciezce = await page.evaluate(() =>
  [...document.querySelectorAll('.type-row')]
    .filter((r) => r.querySelectorAll('input[type=checkbox]')[1].checked)
    .map((r) => r.querySelector('.type-row-name').value),
)
check('fabrycznie wprost w ścieżce pisze się przykład i zadanie',
  wSciezce.length === 2 && wSciezce.includes('Przykład') && wSciezce.includes('Zadanie'),
  wSciezce.join(' · '))

// 3. zmiana nazwy typu przechodzi do całego programu
await page.fill('.type-row:has(input[value="Definicja"]) .type-row-name', 'Określenie')
await page.waitForTimeout(400)
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.type-select')
const wybrane = await page.locator('.type-select option:checked').textContent()
check('nowa nazwa typu widoczna w edytorze kafelka', wybrane === 'Określenie', wybrane)

// 4. własny typ
await doTypow()
await page.click('.type-add')
await page.fill('.type-row-nowy .type-row-name', 'Aksjomat')
await page.fill('.type-row-nowy .type-row-abbr', 'AKS')
await page.click('.type-row-nowy button:has-text("Dodaj")')
await page.waitForTimeout(400)
check('własny typ dopisany', (await page.locator('.type-row').count()) === 10)

// 5. własny typ jest do wyboru przy kafelku i barwi plakietkę
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.type-select')
await page.selectOption('.type-select', { label: 'Aksjomat' })
await page.waitForTimeout(500)
const plakietka = await page.evaluate(() => {
  const el = document.querySelector('.concept-item .type-mini')
  return { txt: el.textContent, typ: el.dataset.typ, kolor: getComputedStyle(el).color }
})
check('plakietka pokazuje skrót własnego typu', plakietka.txt === 'AKS', plakietka.txt)
check('plakietka niesie identyfikator typu', !!plakietka.typ)

// 6. chowanie typu z listy wyboru
await doTypow()
// zwykły klik, nie uncheck(): pole jest sterowane danymi z bazy, więc stan
// wraca dopiero po zapisie — uncheck() sprawdza je natychmiast i się myli
await page.click('.type-row:has(input[value="Lemat"]) input[type=checkbox]')
await page.waitForFunction(() => {
  const r = [...document.querySelectorAll('.type-row')].find(
    (x) => x.querySelector('.type-row-name')?.value === 'Lemat',
  )
  return r && !r.querySelector('input[type=checkbox]').checked
})
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.type-select')
const opcje = await page.locator('.type-select option').allTextContents()
check('schowany typ znika z listy wyboru', !opcje.includes('Lemat'), opcje.join(' · '))

// 7. usunięcie własnego typu przepisuje kafelki na inny
await doTypow()
await page.click('.type-row:has(input[value="Aksjomat"]) .type-row-del')
await page.waitForSelector('.ask-dialog')
const pytanie = await page.textContent('.ask-message')
check('pytanie o usunięcie mówi, ile kafelków zmieni typ', pytanie.includes('1'), pytanie)
await potwierdz(page)
check('typ usunięty', (await page.locator('.type-row').count()) === 9)
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForTimeout(500)
const poUsunieciu = await page.locator('.concept-item .type-mini').textContent()
check('kafelek dostał inny typ, nie zniknął', poUsunieciu !== 'AKS' && poUsunieciu.length > 0,
  poUsunieciu)

// 7a. typ fabryczny też da się usunąć — i wraca przyciskiem
await doTypow()
await page.click('.type-row:has(input[value="Intuicja"]) .type-row-del')
await potwierdz(page)
const poKasacjiFabrycznego = await page.locator('.type-row').count()
check('typ fabryczny daje się usunąć', poKasacjiFabrycznego === 8, `${poKasacjiFabrycznego}`)
check('pojawia się „Przywróć fabryczne"',
  (await page.locator('button:has-text("Przywróć fabryczne")').count()) === 1)
await page.click('button:has-text("Przywróć fabryczne")')
await page.waitForTimeout(600)
const poPrzywroceniu = await page.evaluate(() =>
  [...document.querySelectorAll('.type-row-name')].map((i) => i.value),
)
check('fabryczny wraca, a przemianowany zostaje przemianowany',
  poPrzywroceniu.includes('Intuicja') &&
    poPrzywroceniu.includes('Określenie') &&
    !poPrzywroceniu.includes('Definicja'),
  poPrzywroceniu.join(' · '))
await page.click('.settings-page-head button:has-text("Wróć")')

// 8. wszystko przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
await doTypow()
const poReload = await page.evaluate(() =>
  [...document.querySelectorAll('.type-row-name')].map((i) => i.value),
)
check('zmiany typów zapamiętane', poReload.includes('Określenie') && !poReload.includes('Aksjomat'),
  poReload.join(' · '))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
