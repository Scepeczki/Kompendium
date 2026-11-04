// Scalanie = KOMPONOWANIE: ze scalanych kafelków składa się jeden własny
// kafelek, wybierając, co w nim wyląduje.
//
// To jest test bezpieczeństwa, nie wyglądu. Sprawdza dwie rzeczy, które nie
// mają prawa zawieść: kafelki-materiały zostają w bibliotece nietknięte,
// a ścieżki zapisane PRZED przebudową nie tracą ani zdania.
import { chromium } from 'playwright'
import { nowaSciezka, podaj } from './lib.mjs'

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

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const zrob = async (nazwa, tekst, strona) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', nazwa)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(tekst)
  await page.waitForTimeout(400)
  if (strona) {
    await page.click('.subpage-add')
    await podaj(page, strona.nazwa)
    await page.click('.view-switch button:has-text("Kod")')
    await page.click('.editor-code .cm-content')
    await page.keyboard.type(strona.tresc)
    await page.waitForTimeout(400)
  }
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await zrob('Pierwszy', 'AAA tekst pierwszego kafelka.', {
  nazwa: 'Dowod',
  tresc: 'DOWOD-PIERWSZEGO w osobnej stronie.',
})
await zrob('Drugi', 'BBB tekst drugiego kafelka.')
await zrob('Trzeci', 'CCC tekst trzeciego kafelka.')

await nowaSciezka(page, 'Skladanie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Pierwszy', 'Drugi']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}

// 1. scalenie od razu otwiera ekran komponowania — bez pytania o nazwę
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await page.waitForTimeout(1200)
check('scalenie otwiera ekran komponowania, a nie pyta o nazwę',
  (await page.locator('.komp-okno').count()) === 1)
check('po lewej stoi materiał — kafelki i ich strony',
  (await page.locator('.komp-material .komp-kafelek').count()) === 2,
  `kafelków ${await page.locator('.komp-material .komp-kafelek').count()}`)
const stronyMaterialu = await page.locator('.komp-material .komp-strona-nazwa').allTextContents()
check('a w materiale widać też strony dodatkowe',
  stronyMaterialu.some((t) => t.includes('Dowod')), stronyMaterialu.join(' · '))

// 2. nazwa nadaje się na miejscu
await page.fill('.komp-nazwa', 'Zlozony kafelek')
await page.waitForTimeout(400)

// 3. wstawianie kopiuje tekst do powstającego kafelka
await page.locator('.komp-material .komp-strona-wiersz:has-text("Dowod") button:has-text("Wstaw")').click()
await page.waitForTimeout(700)
await page.locator('.komp-material .komp-strona-wiersz').last().locator('button:has-text("Wstaw")').click()
await page.waitForTimeout(900)
const wSrodku = await page.textContent('.komp-srodek')
check('wstawione kawałki lądują w powstającym kafelku',
  wSrodku.includes('DOWOD-PIERWSZEGO') && wSrodku.includes('BBB tekst drugiego'),
  wSrodku.slice(0, 140))
check('a wzięte strony są odhaczone',
  (await page.locator('.komp-strona-nazwa:has-text("✓")').count()) === 2,
  `${await page.locator('.komp-strona-nazwa:has-text("✓")').count()}`)

// 4. własna strona złożonego kafelka
await page.click('.komp-srodek button:has-text("+ strona")')
await podaj(page, 'Uwagi')
await page.waitForTimeout(700)
await page.click('.komp-pole .tiptap')
await page.keyboard.type('UWAGI-ZLOZONEGO')
await page.waitForTimeout(900)

// 5. wyjście — w ścieżce stoi jeden kafelek z tym, co złożone
await page.click('.komp-head button:has-text("Gotowe")')
await page.waitForTimeout(900)
check('ekran komponowania się zamyka',
  (await page.locator('.komp-okno').count()) === 0)
check('w ścieżce stoi jeden złożony kafelek',
  (await page.locator('.script-group-block').count()) === 1)
const wSciezce = await page.textContent('.script-group-block')
check('ze złożonym tekstem i nazwą',
  wSciezce.includes('DOWOD-PIERWSZEGO') &&
    wSciezce.includes('BBB tekst drugiego'),
  wSciezce.slice(0, 160))
check('nazwa nadana w komponowaniu trafia do ścieżki',
  (await page.inputValue('.script-group-block .inline-title')) === 'Zlozony kafelek',
  await page.inputValue('.script-group-block .inline-title'))
check('i z własną stroną',
  (await page.locator('.script-group-block .block-page:has-text("Uwagi")').count()) === 1)
await page.click('.script-group-block .block-page:has-text("Uwagi")')
await page.waitForTimeout(600)
check('strona złożonego kafelka pokazuje swoją treść',
  (await page.textContent('.script-group-block')).includes('UWAGI-ZLOZONEGO'))

// 6. NAJWAŻNIEJSZE: kafelki-materiały w bibliotece nietknięte
const wBibliotece = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  const db = await new Promise((res) => {
    req.onsuccess = () => res(req.result)
  })
  const czytaj = (sklep) =>
    new Promise((res) => {
      const r = db.transaction(sklep).objectStore(sklep).getAll()
      r.onsuccess = () => res(r.result)
    })
  const [concepts, versions] = await Promise.all([czytaj('concepts'), czytaj('versions')])
  return concepts.map((c) => ({
    nazwa: c.name,
    tresc: versions.find((v) => v.id === c.currentVersionId)?.content ?? '',
  }))
})
check('kafelki-materiały w bibliotece nietknięte',
  wBibliotece.some((c) => c.nazwa === 'Pierwszy' && c.tresc.includes('AAA')) &&
    wBibliotece.some((c) => c.nazwa === 'Drugi' && c.tresc.includes('BBB')),
  JSON.stringify(wBibliotece.map((c) => c.nazwa)))
check('i nadal są w bibliotece jako osobne kafelki',
  (await page.locator('.concept-item:has-text("Pierwszy")').count()) === 1 &&
    (await page.locator('.concept-item:has-text("Drugi")').count()) === 1)

// 7. powrót do komponowania — materiały zostają przy bloku na zawsze
const pud = await page.locator('.linear-seg:first-child').boundingBox()
await page.mouse.click(pud.x + pud.width / 2, pud.y + 30, { button: 'right' })
await page.waitForSelector('.linear-menu')
await page.click('.linear-menu .tree-menu-item:has-text("Komponuj")')
await page.waitForTimeout(900)
check('do komponowania da się wrócić',
  (await page.locator('.komp-okno').count()) === 1)
check('a materiał wciąż tam jest',
  (await page.locator('.komp-material .komp-kafelek').count()) === 2)

// 8. dokładanie materiału, którego się nie scalało
await page.click('.komp-doloz')
await page.waitForSelector('.picker-modal')
await page.click('.picker-modal .picker-item:has-text("Trzeci")')
await page.waitForTimeout(900)
check('można dołożyć kafelek do materiału',
  (await page.locator('.komp-material .komp-kafelek').count()) === 3,
  `kafelków ${await page.locator('.komp-material .komp-kafelek').count()}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

// 9. przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
await page.click('.concept-item:has-text("Skladanie")')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(900)
check('złożony tekst przeżywa przeładowanie',
  (await page.textContent('.script-group-block')).includes('DOWOD-PIERWSZEGO'))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
