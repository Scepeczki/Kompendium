// Test lokalnego rozmiaru tekstu (jak w Google Docs): zaznaczenie + wybór
// rozmiaru, znaczniki w Kodzie, render w podglądzie, zmiana i powrót
// do domyślnego, brak wpływu na resztę tekstu.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

/** Zaznacza dokładnie podany tekst wewnątrz akapitu edytora (DOM Range —
 *  dwuklik w trybie headless nie tworzy zaznaczenia słowa). */
const selectText = async (needle) => {
  await page.click('.rich-content .tiptap p')
  await page.evaluate((txt) => {
    const p = document.querySelector('.rich-content .tiptap p')
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(txt)
      if (i >= 0) {
        const r = document.createRange()
        r.setStart(node, i)
        r.setEnd(node, i + txt.length)
        const s = getSelection()
        s.removeAllRanges()
        s.addRange(r)
        return
      }
    }
    throw new Error('nie znaleziono tekstu do zaznaczenia: ' + txt)
  }, needle)
  await page.waitForTimeout(200)
}

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.rich-content .tiptap')
await page.fill('.editor-name', 'Rozmiary')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Zwykły tekst i ważny fragment na końcu.')
await page.waitForTimeout(400)

/** Kontrolka rozmiaru to pole do wpisania (z listą podpowiedzi), a nie lista
 *  wyboru — dowolną liczbę też da się wpisać ręcznie. */
const ustawRozmiar = async (v) => {
  await page.fill('.rich-size', String(v))
  await page.press('.rich-size', 'Enter')
  await page.waitForTimeout(500)
}

// 1. zaznacz „ważny fragment" i ustaw rozmiar 20
await selectText('ważny fragment')
await ustawRozmiar(20)

// 2. w edytorze fragment ma font-size 20px (dekoracja), znaczniki schowane
const sized = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('.rich-content .tiptap p span')]
  const s = spans.find((x) => x.style.fontSize === '20px')
  return s ? s.textContent : null
})
console.log(`✓ fragment powiększony w wizualnym: ${sized ? `ok („${sized.trim()}")` : 'BRAK!'}`)
const visibleMarker = await page.evaluate(() =>
  document.querySelector('.rich-content .tiptap p').innerText.includes('⟦'),
)
console.log(`✓ znaczniki schowane w wizualnym: ${!visibleMarker ? 'ok' : 'WIDOCZNE!'}`)

// 3. kontrolka pokazuje rozmiar pod kursorem (klik w powiększony fragment)
await page.click('.rich-content .tiptap p >> text=ważny')
await page.waitForTimeout(200)
const ctrlVal = await page.inputValue('.rich-size')
console.log(`✓ kontrolka pokazuje rozmiar pod kursorem: ${ctrlVal} (oczekiwane 20)`)

// 4. w Kodzie widać znaczniki ⟦s20⟧…⟦/s⟧
await page.click('.view-switch button:has-text("Kod")')
await page.waitForSelector('.editor-code .cm-content')
const code = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ znaczniki w Kodzie: ${/⟦s20⟧.*⟦\/s⟧/.test(code) ? 'ok' : 'BRAK! ' + code}`,
)

// 5. podgląd (Podział) renderuje span z font-size
await page.click('.view-switch button:has-text("Podział")')
await page.waitForSelector('.editor-preview')
const prevSized = await page.evaluate(() => {
  const s = [...document.querySelectorAll('.editor-preview span')].find(
    (x) => x.style.fontSize === '20px',
  )
  return s?.textContent ?? null
})
console.log(`✓ podgląd renderuje rozmiar: ${prevSized ? 'ok' : 'BRAK!'}`)

// 6. zmiana rozmiaru tego samego zaznaczenia (20 → 14) bez dublowania znaczników
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await selectText('ważny fragment')
await ustawRozmiar(14)
await page.click('.view-switch button:has-text("Kod")')
const code2 = await page.textContent('.editor-code .cm-content')
const opens = (code2.match(/⟦s\d+⟧/g) ?? []).length
const closes = (code2.match(/⟦\/s⟧/g) ?? []).length
console.log(
  `✓ zmiana rozmiaru: ${code2.includes('⟦s14⟧') && !code2.includes('⟦s20⟧') ? 'ok' : 'ZLE: ' + code2}` +
    ` (znaczniki: ${opens} otwarcia / ${closes} domknięcia — oczekiwane 1/1)`,
)

// 6b. dowolna liczba spoza listy — wpisana ręcznie
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await selectText('ważny fragment')
await ustawRozmiar(23)
await page.click('.view-switch button:has-text("Kod")')
const code23 = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ rozmiar wpisany ręcznie (23): ${code23.includes('⟦s23⟧') ? 'ok' : 'ZLE: ' + code23}`,
)

// 7. puste pole przywraca rozmiar podstawowy i usuwa znaczniki
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await selectText('ważny fragment')
await ustawRozmiar('')
await page.click('.view-switch button:has-text("Kod")')
const code3 = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ powrót do domyślnego usuwa znaczniki: ${!code3.includes('⟦s') ? 'ok' : 'ZOSTAŁY: ' + code3}`,
)
console.log(
  `✓ treść nietknięta: ${code3.includes('ważny fragment') && code3.includes('Zwykły tekst') ? 'ok' : 'ZEPSUTA: ' + code3}`,
)

// 8. wzór LaTeX wewnątrz powiększonego fragmentu skaluje się razem z tekstem
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+a')
await page.keyboard.type('Mały $a^2$ i ⟦s28⟧duży $b^2$ wzór⟦/s⟧.')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .katex')
await page.waitForTimeout(400)
const mathSizes = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.rich-content .math-render')]
  return els.map((e) => Math.round(e.getBoundingClientRect().height))
})
console.log(
  `✓ wzory w wizualnym — wysokości ${mathSizes.join(' vs ')}: ${
    mathSizes.length === 2 && mathSizes[1] > mathSizes[0] ? 'powiększony większy, ok' : 'BRAK SKALOWANIA!'
  }`,
)

// 9. to samo w podglądzie (Podział)
await page.click('.view-switch button:has-text("Podział")')
await page.waitForSelector('.editor-preview .katex')
const prevMath = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.editor-preview .katex')]
  return els.map((e) => Math.round(e.getBoundingClientRect().height))
})
console.log(
  `✓ wzory w podglądzie — wysokości ${prevMath.join(' vs ')}: ${
    prevMath.length === 2 && prevMath[1] > prevMath[0] ? 'ok' : 'BRAK SKALOWANIA!'
  }`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
