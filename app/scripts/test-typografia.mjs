// Test typografii: jeden krój na interfejs, skala rozmiarów zamiast
// przypadkowych liczb, podpisy przycisków tworzenia wysuwane pod kursorem,
// ustawienie wielkości listy i kroju treści.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Granica ciągu')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('## Nagłówek\n\nTreść z wzorem $a_n$.')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForTimeout(300)

// 1. dowieziony krój faktycznie się wczytał (a nie tylko stoi w deklaracji)
const fonts = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    interLoaded: document.fonts.check('600 15px "Figtree Variable"'),
    serifLoaded: document.fonts.check('400 15px "Source Serif 4 Variable"'),
    body: getComputedStyle(document.body).fontFamily,
  }
})
check('krój interfejsu wczytany (Figtree)', fonts.interLoaded, fonts.body)
check('krój do czytania wczytany (Source Serif)', fonts.serifLoaded)

// 2. nazwa kafelka w edytorze nie jest już szeryfowa
await page.click('.concept-item:has-text("Granica ciągu")')
await page.waitForSelector('.editor-name')
const nameFont = await page.evaluate(
  () => getComputedStyle(document.querySelector('.editor-name')).fontFamily,
)
check('nazwa kafelka bezszeryfowa', nameFont.includes('Figtree'), nameFont)
await page.click('.btn-close[title*="Zamknij kafelek"]')

// 3. żaden napis w interfejsie nie jest mniejszy niż 11px
const tooSmall = await page.evaluate(() =>
  [...document.querySelectorAll('body *')]
    .filter((el) => el.textContent?.trim() && el.children.length === 0)
    .map((el) => ({ t: el.textContent.trim().slice(0, 18), s: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.s < 10.5),
)
check('nic nie jest drobniejsze niż 10,5px', tooSmall.length === 0,
  JSON.stringify(tooSmall.slice(0, 5)))

// 4. przyciski tworzenia: dwa z napisem, folder jako znaczek — każdy z dymkiem
const create = await page.evaluate(() =>
  [...document.querySelectorAll('.sidebar-create-btn')].map((b) => ({
    txt: b.textContent.trim(),
    tip: b.getAttribute('title'),
    svg: b.querySelectorAll('svg').length,
  })),
)
check('przyciski tworzenia podpisane', create[0].txt === '+ Kafelek' && create[1].txt === '+ Ścieżka' && create[2].svg === 1,
  JSON.stringify(create))
check('każdy ma dymek z opisem', create.every((b) => (b.tip ?? '').length > 4),
  create.map((b) => b.tip).join(' · '))

// 5. znaczki są rysowane kreską (SVG), nie emoji — i wszystkie jedną grubością
const icons = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('.sidebar svg')]
  return {
    ile: svgs.length,
    grubosci: [...new Set(svgs.map((s) => s.getAttribute('stroke-width')))],
    kolory: [...new Set(svgs.map((s) => s.getAttribute('stroke')))],
  }
})
check('znaczki paska bocznego rysowane kreską', icons.ile >= 4, `sztuk: ${icons.ile}`)
check('jedna grubość kreski w całym pasku', icons.grubosci.length === 1,
  icons.grubosci.join(', '))
check('znaczki biorą kolor z tekstu', icons.kolory.every((k) => k === 'currentColor'),
  icons.kolory.join(', '))

// 6. wielkość listy z Ustawień naprawdę zmienia nazwy kafelków
const before = await page.evaluate(
  () => getComputedStyle(document.querySelector('.concept-name')).fontSize,
)
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.fill('.settings-row:has-text("Wielkość tekstu w liście") .settings-slider', '19')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForTimeout(400)
const after = await page.evaluate(
  () => getComputedStyle(document.querySelector('.concept-name')).fontSize,
)
check('suwak wielkości listy zmienia nazwy kafelków', before === '12px' && after === '19px',
  `${before} → ${after}`)

// 7. krój treści przełączalny i dotyczy tylko treści, nie interfejsu
await page.click('.concept-item:has-text("Granica ciągu")')
await page.waitForSelector('.view-switch')
// tryb widoku jest zapamiętany — wracamy do wizualnego, bo to on pokazuje treść
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
const contentBefore = await page.evaluate(
  () => getComputedStyle(document.querySelector('.rich-content .tiptap')).fontFamily,
)
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Tekst")')
// „Bezszeryfowy" też zawiera słowo „szeryfowy" — stąd dopasowanie dokładne
await page.click('.settings-row:has-text("Krój pisma treści") button:text-is("Szeryfowy")')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.rich-content .tiptap')
await page.waitForTimeout(400)
const contentAfter = await page.evaluate(() => ({
  tresc: getComputedStyle(document.querySelector('.rich-content .tiptap')).fontFamily,
  lista: getComputedStyle(document.querySelector('.concept-name')).fontFamily,
}))
check('treść przechodzi na krój szeryfowy',
  contentBefore.includes('Figtree') && contentAfter.tresc.includes('Source Serif'),
  `${contentBefore} → ${contentAfter.tresc}`)
check('interfejs zostaje bezszeryfowy', contentAfter.lista.includes('Figtree'),
  contentAfter.lista)

// 8. deseń tła: rysuje się na papierze, nie pod tekstem
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Wygląd")')
const swatches = await page.locator('.settings-bg-btn').count()
check('są cztery desenie do wyboru', swatches === 4, `${swatches}`)
await page.click('.settings-bg-btn[data-bg-preview="kratka"]')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.rich-content .tiptap')
await page.waitForTimeout(400)
const wzor = await page.evaluate(() => ({
  atrybut: document.documentElement.dataset.bg,
  papier: getComputedStyle(document.body).backgroundImage,
  margines: getComputedStyle(document.querySelector('.rich-content')).backgroundImage,
  kartka: getComputedStyle(document.querySelector('.rich-content .tiptap')).backgroundImage,
}))
check('kratka włączona', wzor.atrybut === 'kratka', String(wzor.atrybut))
check('deseń na papierze', wzor.papier.includes('gradient'), wzor.papier.slice(0, 40))
check('deseń na marginesach wokół kartki', wzor.margines.includes('gradient'))
check('pod tekstem czysto', wzor.kartka === 'none', wzor.kartka)

// 9. wybór kroju i deseniu przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
const afterReload = await page.evaluate(() => ({
  font: document.documentElement.style.getPropertyValue('--font-content'),
  bg: document.documentElement.dataset.bg,
}))
check('wybrany krój zapamiętany', afterReload.font.includes('font-read'), afterReload.font)
check('wybrany deseń zapamiętany', afterReload.bg === 'kratka', String(afterReload.bg))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
