// Test Etapu 4: tryb wizualny (TipTap), przełączanie z kodem, wzory KaTeX
// w miejscu, skróty Ctrl+B/M w kodzie, motyw jasny/ciemny.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Hybryda')

// 1. domyślnie tryb wizualny
await page.waitForSelector('.rich-content .tiptap')
console.log('✓ tryb wizualny domyślny (TipTap)')

// 2. pisanie + pogrubienie przyciskiem + wzór z paska
await page.click('.rich-content .tiptap')
await page.keyboard.type('Zwykły ')
await page.click('.rich-btn:has-text("B")')
await page.keyboard.type('gruby')
await page.click('.rich-btn:has-text("B")')
await page.keyboard.type(' i wzór ')
await page.click('button[title*="Wzór w tekście"]')
await page.keyboard.type(' i dalej tekst') // odsuń kursor — wzór ma się wyrenderować
await page.waitForTimeout(800)
const mathRendered = await page.locator('.rich-content .katex').count()
console.log(`✓ wzór KaTeX renderuje się w miejscu w trybie wizualnym: ${mathRendered > 0}`)

// 3. przełącz na Kod → markdown zawiera **gruby** i $
await page.click('.view-switch button:has-text("Kod")')
await page.waitForSelector('.editor-code .cm-content')
const code = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ kod po przełączeniu: pogrubienie ${code.includes('**gruby**') ? 'ok' : 'BRAK!'}, wzór ${
    code.includes('$') ? 'ok' : 'BRAK!'
  }`,
)

// 4. skróty w kodzie: zaznacz słowo i Ctrl+B, potem Ctrl+M na innym
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+End')
await page.keyboard.type('\n\nkursywa tu')
await page.keyboard.press('Home')
await page.keyboard.press('Shift+Control+ArrowRight')
await page.keyboard.press('Control+i')
await page.waitForTimeout(400)
const code2 = await page.textContent('.editor-code .cm-content')
console.log(`✓ Ctrl+I w kodzie: ${code2.includes('*kursywa') ? 'ok' : 'BRAK: ' + code2.slice(-60)}`)

// 5. wróć do wizualnego → pogrubienie widoczne jako <strong>
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap strong')
console.log('✓ powrót do wizualnego: formatowanie zachowane')

// 6. ustawienia: motyw ciemny + szerokość strony
const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-page button:has-text("Ciemny")')
await page.fill('.settings-row:has-text("Szerokość strony tekstu") .settings-slider', '1200')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForTimeout(300)
const pageWidth = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
console.log(`✓ szerokość strony ustawiona: ${pageWidth}`)
const theme = await page.evaluate(() => document.documentElement.dataset.theme)
const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
console.log(
  `✓ motyw: ${theme}, tło zmienione: ${bgLight !== bgDark} (${bgLight} → ${bgDark})`,
)
await page.screenshot({ path: 'scripts/shot-16-dark.png' })

// 7. motyw zapamiętany po przeładowaniu
await page.reload()
await page.waitForSelector('text=Kompendium')
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme)
const widthAfter = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
console.log(`✓ po przeładowaniu: motyw=${themeAfter}, szerokość=${widthAfter}`)

// 8. LaTeX z ukośnikami przeżywa tryb wizualny: wpisz w Kodzie \left\{ ... \right\}
await page.click('.concept-item:has-text("Hybryda")')
await page.waitForSelector('.view-switch')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+a')
await page.keyboard.type('Zbiór $$\\left\\{ 0,1,2,\\ldots \\right\\}$$ koniec.')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .katex')
const katexErr = await page.locator('.rich-content .katex-error').count()
console.log(`✓ \\left\\{…\\right\\} renderuje się w wizualnym (błędy KaTeX: ${katexErr})`)
// wpisz coś w wizualnym (dopisz na końcu) i wróć do kodu — ukośniki nietknięte
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+End')
await page.keyboard.type(' dopisek')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Kod")')
const code3 = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ po powrocie z wizualnego LaTeX nienaruszony: ${
    code3.includes('\\left\\{') && code3.includes('\\right\\}') ? 'ok' : 'ZEPSUTY: ' + code3
  }`,
)

// 8a. znaki <, >, & we wzorze pisanym w wizualnym nie zamieniają się w encje
await page.click('.view-switch button:has-text("Wizualny")')
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+End')
await page.keyboard.type(' Nierówność $n > 1$ i $a < b$.')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Kod")')
const code4 = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ < i > we wzorach bez encji HTML: ${
    code4.includes('$n > 1$') && code4.includes('$a < b$') && !code4.includes('&gt;')
      ? 'ok'
      : 'ZEPSUTE: ' + code4.slice(-90)
  }`,
)

// 9. przełączanie między kafelkami w trybie wizualnym odświeża treść
await page.click('.view-switch button:has-text("Wizualny")')
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Drugi kafelek')
await page.click('.rich-content .tiptap')
await page.keyboard.type('TREŚĆ-DRUGIEGO')
await page.waitForTimeout(700)
// przełącz na pierwszy kafelek i z powrotem
await page.click('.concept-item:has-text("Hybryda")')
await page.waitForFunction(() =>
  document.querySelector('.rich-content .tiptap')?.textContent.includes('Zbiór'),
)
await page.click('.concept-item:has-text("Drugi kafelek")')
await page.waitForFunction(() =>
  document.querySelector('.rich-content .tiptap')?.textContent.includes('TREŚĆ-DRUGIEGO'),
)
console.log('✓ przełączanie kafelków odświeża tryb wizualny')

// 10. kolumna tekstu ograniczona (jak w Google Docs)
const widths = await page.evaluate(() => {
  const tt = document.querySelector('.rich-content .tiptap')
  const rc = document.querySelector('.rich-content')
  return { text: tt.getBoundingClientRect().width, panel: rc.getBoundingClientRect().width }
})
console.log(
  `✓ kolumna tekstu: ${Math.round(widths.text)}px w panelu ${Math.round(widths.panel)}px (ograniczona: ${
    widths.text <= 690
  })`,
)

// --- LaTeX pisany POZA wzorami zapisuje sie tak, jak go wpisano ---
//
// Serializator Markdowna zabezpiecza znak ucieczki, wiec \mathcal{A} pisane
// w tresci (a nie we wzorze) ladowalo w bazie jako \\mathcal{A}. Wzory byly
// cale, bo maja wlasne odescapowanie — cierpial zwykly tekst, na przyklad
// tresc zadania. Wpisujemy doslownie, bo klawiatura zjada backslashe.
const BS = String.fromCharCode(92)
const PROBKA =
  `rodzina ${BS}mathcal{A} ${BS}subseteq ${BS}mathcal{P}(X), R ${BS}bigcup {A ${BS}times A}`
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Backslashe')
await page.waitForTimeout(400)
await page.click('.editor-body .tiptap')
await page.evaluate((t) => document.execCommand('insertText', false, t), PROBKA)
await page.waitForTimeout(1200)
await page.click('.editor-name')
await page.waitForTimeout(900)
const zapisane = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('kompendium')
      r.onsuccess = () => {
        const d = r.result
        const st = d.transaction('versions', 'readonly').objectStore('versions')
        st.getAll().onsuccess = (e) => {
          d.close()
          res(e.target.result.map((v) => v.content).find((c) => c && c.includes('mathcal')) ?? '')
        }
      }
    }),
)
console.log(
  zapisane === PROBKA
    ? '✓ LaTeX poza wzorami zapisany bez podwajania backslashy'
    : `✗ BŁĄD: backslashe rozjechane — ${zapisane}`,
)
if (zapisane !== PROBKA) errors.push('podwojone backslashe w zapisie')

// --- wcięty tekst NIE staje się szarą ramką z kodem ---
//
// Markdown robi blok kodu z akapitu wciętego o cztery spacje. Przy pisaniu
// notatek wychodziło to samo z siebie: zdanie zmieniało się w tekst
// maszynowy w ramce, a LaTeX w środku przestawał być LaTeX-em.
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
const NL = String.fromCharCode(10)
const WCIETY = ['Akapit', '', '    wciety o cztery spacje', ''].join(NL)
await page.evaluate((t) => document.execCommand('insertText', false, t), WCIETY)
await page.waitForTimeout(1100)
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForTimeout(1100)
const ramek = await page.locator('.editor-body pre').count()
console.log(
  ramek === 0
    ? '✓ wcięty tekst zostaje tekstem, nie ramką z kodem'
    : `✗ BŁĄD: wcięcie zrobiło ${ramek} ramek z kodem`,
)
if (ramek !== 0) errors.push('wcięcie robi blok kodu')

// --- wklejona lista punktowa zapisuje sie BEZ ukosnikow ---
//
// Wklejka ladowala jako goly tekst, wiec serializator zabezpieczal myslnik
// na poczatku wiersza (zeby przypadkiem nie zrobil listy) i gwiazdki. Tresc
// zadania wklejona z PDF-u konczyla sie wiec lasem ukosnikow do recznego
// sprzatania. Wzory musza przy tym zostac nietkniete — w LaTeX-u backslash
// przed klamra to nawias zbioru, a nie ozdoba.
const WKLEJKA = [
  'Dla dowolnego zbioru $X$, czy prawda jest ze:',
  '',
  '- **(a)** rodzina $\\mathcal{A}$, ze $R = \\bigcup \\{A \\times A\\}$;',
].join(NL)
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Wklejka')
await page.waitForTimeout(400)
await page.click('.editor-body .tiptap')
await page.evaluate((tekst) => {
  const dt = new DataTransfer()
  dt.setData('text/plain', tekst)
  document.querySelector('.editor-body .tiptap').dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
  )
}, WKLEJKA)
await page.waitForTimeout(1300)
await page.click('.editor-name')
await page.waitForTimeout(900)
const poWklejce = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('kompendium')
      r.onsuccess = () => {
        const d = r.result
        const st = d.transaction('versions', 'readonly').objectStore('versions')
        st.getAll().onsuccess = (e) => {
          d.close()
          res(e.target.result.map((v) => v.content).find((c) => c && c.includes('Dla dowolnego')) ?? '')
        }
      }
    }),
)
console.log(
  poWklejce === WKLEJKA
    ? '✓ wklejona lista zapisana znak w znak, bez ukośników'
    : `✗ BŁĄD: wklejka rozjechana — ${poWklejce}`,
)
if (poWklejce !== WKLEJKA) errors.push('wklejanie dodaje ukośniki')

// --- wklejka Z WCIECIAMI (tak wychodzi kopiowanie z PDF-u) ---
//
// Tekst skopiowany ze skryptu przychodzi wciety o cztery, osiem, dwanascie
// spacji. Cztery spacje znacza dla Markdownu "to jest kod", wiec polecenie
// zadania zmienialo sie w szara ramke z surowym LaTeX-em. Scinamy wciecie,
// zanim Markdown zdazy je tak przeczytac.
const WCIETA = [
  'Dla dowolnego zbioru $X$, czy prawda jest ze:',
  '    ',
  '    - **(a)** rodzina $\\mathcal{A}$, ze $R = \\bigcup \\{A \\times A\\}$;',
  '        ',
  '    - **(b)** i drugi punkt.',
].join(NL)
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Wklejka z PDF')
await page.waitForTimeout(400)
await page.click('.editor-body .tiptap')
await page.evaluate((tekst) => {
  const dt = new DataTransfer()
  dt.setData('text/plain', tekst)
  document.querySelector('.editor-body .tiptap').dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
  )
}, WCIETA)
await page.waitForTimeout(1400)
await page.click('.editor-name')
await page.waitForTimeout(900)
const kodu = await page.locator('.editor-body pre, .editor-body code').count()
console.log(
  kodu === 0
    ? '✓ wklejka z wcięciami nie robi się ramką z kodem'
    : `✗ BŁĄD: wcięta wklejka dała ${kodu} kawałków kodu`,
)
if (kodu !== 0) errors.push('wcięta wklejka robi kod')

// --- lamanie wiersza we wzorze przezywa zapis ---
//
// W LaTeX-u podwojny backslash wewnatrz wzoru znaczy "nowa linia" — tak
// buduje sie egin{align}. Poprawka od podwajania backslashy w tresci
// zamieniala je na pojedyncze i rozsypywala kazdy wzor wielowierszowy.
// Poprawki tekstu musza omijac wzory: te maja wlasne odescapowanie.
const WZOR = [
  '$$\\begin{align}',
  '&T_0 = V \\cup C \\notag\\\\',
  '&T_{n+1} = T_n \\cup T \\notag\\\\',
  'T = \\bigcup_n T_n',
  '\\end{align}$$',
].join(NL)
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Wzor wielowierszowy')
await page.waitForTimeout(400)
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.evaluate((t) => document.execCommand('insertText', false, t), WZOR)
await page.waitForTimeout(1100)
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForTimeout(1000)
await page.click('.editor-body .tiptap')
await page.evaluate(() => document.execCommand('insertText', false, ' '))
await page.waitForTimeout(1300)
await page.click('.editor-name')
await page.waitForTimeout(900)
const poWzorze = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('kompendium')
      r.onsuccess = () => {
        const d = r.result
        const st = d.transaction('versions', 'readonly').objectStore('versions')
        st.getAll().onsuccess = (e) => {
          d.close()
          res(e.target.result.map((v) => v.content).find((c) => c && c.includes('align')) ?? '')
        }
      }
    }),
)
// dwa lamania wiersza musza w zapisie zostac podwojnymi backslashami
const lamania = (poWzorze.match(/\\\\/g) || []).length
const bledne = await page.locator('.editor-body .katex-error').count()
console.log(
  lamania === 2 && bledne === 0
    ? '✓ łamania wiersza we wzorze przeżywają zapis'
    : `✗ BŁĄD: łamań ${lamania} (ma być 2), błędnych wzorów ${bledne}`,
)
if (lamania !== 2 || bledne !== 0) errors.push('wzór wielowierszowy rozsypany')

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
