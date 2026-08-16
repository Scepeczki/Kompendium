// Dwie umowy edytora kafelka:
//  1. Przełączanie stron i wersji NIE zmienia treści — puste linie zostają.
//  2. Starsza wersja jest do pisania i ma własne źródła, nie cudze.
import { chromium } from 'playwright'
import { podaj } from './lib.mjs'

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

const zBazy = async (tabela) =>
  page.evaluate(async (t) => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction(t, 'readonly').objectStore(t).getAll()
    await new Promise((res) => (r.onsuccess = res))
    return r.result
  }, tabela)

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// kafelek z dwiema pustymi liniami w środku
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Puste linie')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Pierwszy akapit.')
for (let i = 0; i < 4; i++) await page.keyboard.press('Enter')
await page.keyboard.type('Drugi po dwoch pustych.')
await page.waitForTimeout(900)

const trescGlownej = async () => {
  const v = await zBazy('versions')
  return v.find((x) => x.content.includes('Pierwszy akapit'))?.content ?? ''
}
const zapisana = await trescGlownej()
check('puste linie zapisały się w kafelku', zapisana.includes('\n\n\n\n'),
  JSON.stringify(zapisana))

// druga strona kafelka
await page.click('button:has-text("+ strona")')
await podaj(page, 'Dowod')
await page.waitForTimeout(800)
await page.click('.editor-code .cm-content')
await page.keyboard.type('Tresc dowodu.')
await page.waitForTimeout(800)

// tam i z powrotem, w obu trybach pisania
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForTimeout(600)
for (let i = 0; i < 2; i++) {
  await page.click('.subpage-item:has-text("Treść")')
  await page.waitForTimeout(700)
  await page.click('.subpage-item:has-text("Dowod")')
  await page.waitForTimeout(700)
}
await page.click('.subpage-item:has-text("Treść")')
await page.waitForTimeout(900)
const poPrzelaczaniu = await trescGlownej()
check('przełączanie stron nie rusza pustych linii',
  poPrzelaczaniu === zapisana,
  `${JSON.stringify(zapisana)}  ⟶  ${JSON.stringify(poPrzelaczaniu)}`)

// nowa wersja, potem powrót do starszej
await page.click('button:has-text("+ nowa wersja")')
await page.waitForSelector('.ask-dialog')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(900)
const wersjeDoWyboru = await page.locator('.version-item, .version-chip, [class*="version"]').count()
check('są dwie wersje do wyboru', wersjeDoWyboru >= 2, `${wersjeDoWyboru}`)

// przełącz na starszą (v1) i pisz po niej
await page.click('.view-switch button:has-text("Kod")')
await page.waitForTimeout(400)
const starsza = page.locator('.version-item, .version-chip').filter({ hasText: 'v1' }).first()
if ((await starsza.count()) === 0) {
  // awaryjnie: pierwszy element listy wersji
  await page.locator('[class*="version"]').first().click()
} else {
  await starsza.click()
}
await page.waitForTimeout(900)
check('po starszej wersji da się pisać',
  await page.locator('.editor-code .cm-content').isEditable().catch(() => false))
await page.click('.editor-code .cm-content')
await page.keyboard.press('End')
await page.keyboard.type(' DOPISEK-DO-STARSZEJ')
await page.waitForTimeout(900)
const wersje = await zBazy('versions')
check('tekst trafia do tej wersji, po której piszemy',
  wersje.some((v) => v.content.includes('DOPISEK-DO-STARSZEJ')),
  wersje.map((v) => `v${v.version}: ${v.content.slice(0, 34)}`).join(' | '))
check('druga wersja zostaje nietknięta',
  wersje.filter((v) => v.content.includes('DOPISEK-DO-STARSZEJ')).length === 1,
  wersje.map((v) => `v${v.version}`).join(' | '))
check('puste linie przetrwały i to wszystko',
  wersje.every((v) => v.content.includes('\n\n\n\n')),
  wersje.map((v) => JSON.stringify(v.content.slice(0, 40))).join(' | '))

// źródła starszej wersji: przyciski nie są zablokowane
const zablokowane = await page.evaluate(() =>
  [...document.querySelectorAll('.editor-toolbar button')].filter((b) => b.disabled).length,
)
check('zarządzanie źródłami działa też w starszej wersji', zablokowane === 0,
  `zablokowanych przycisków: ${zablokowane}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
