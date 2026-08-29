// „Wstaw zaznaczone" ma dawać DOKŁADNIE to, co zaznaczone — ze wzorami
// zapisanymi jak w źródle, a nie tak, jak wyglądają na ekranie.
//
// KaTeX trzyma jeden wzór w DOM-ie trzy razy naraz (glify do patrzenia,
// MathML dla czytników i sam TeX w środku), więc zwykłe czytanie zaznaczenia
// sklejało wszystkie trzy w jeden bełkot.
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
const kontekst = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await kontekst.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await kontekst.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

/** Pisanie backslashy klawiaturą Playwrighta gubi znaki — wkładamy wprost. */
const wpisz = async (tekst) => {
  await page.click('.editor-code .cm-content')
  await page.evaluate((t) => document.execCommand('insertText', false, t), tekst)
  await page.waitForTimeout(500)
}

const zrob = async (nazwa, tekst) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', nazwa)
  await page.click('.view-switch button:has-text("Kod")')
  await wpisz(tekst)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

const ZRODLO = [
  'Pierwszy akapit **z pogrubieniem** przed wzorem.',
  '',
  'Wzór w linii $z \\in y_1$ oraz drugi $z \\in y_2$ w tym samym zdaniu.',
  '',
  '$$\\forall x \\exists y (z \\in y \\leftrightarrow \\exists t (t \\in x))$$',
  '',
  'Ostatni akapit po wzorze.',
].join('\n')

await zrob('Aksjomat sumy', ZRODLO)
await zrob('Notatka', 'Cos zupelnie innego.')

await nowaSciezka(page, 'Kopiowanie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Aksjomat sumy', 'Notatka']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await page.waitForSelector('.komp-okno')
await page.waitForTimeout(700)

// otwieramy podgląd strony z wzorami
await page.locator('.komp-strona-nazwa').first().click()
await page.waitForSelector('.komp-podglad')
await page.waitForTimeout(600)

check('podgląd renderuje wzory', (await page.locator('.komp-podglad .katex').count()) > 0,
  `wzorów: ${await page.locator('.komp-podglad .katex').count()}`)
check('a każdy blok niesie swoje źródło',
  (await page.locator('.komp-podglad [data-md]').count()) === 4,
  `bloków: ${await page.locator('.komp-podglad [data-md]').count()}`)

/** Zaznacza w podglądzie od jednego tekstu do drugiego i wstawia. */
const zaznaczIWstaw = async (odTekstu, doTekstu) => {
  await page.evaluate(
    ({ a, b }) => {
      const pod = document.querySelector('.komp-podglad')
      const znajdz = (szukany) => {
        const chodzik = document.createTreeWalker(pod, NodeFilter.SHOW_TEXT)
        let n
        while ((n = chodzik.nextNode())) {
          const i = n.textContent.indexOf(szukany)
          if (i >= 0) return { node: n, i }
        }
        return null
      }
      const start = znajdz(a)
      const koniec = znajdz(b)
      const r = document.createRange()
      r.setStart(start.node, start.i)
      r.setEnd(koniec.node, koniec.i + b.length)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    },
    { a: odTekstu, b: doTekstu },
  )
  await page.waitForTimeout(300)
  await page.click('.komp-podglad button:has-text("Wstaw zaznaczone")')
  await page.waitForTimeout(900)
}

// 1. zaznaczenie obejmujące całe bloki: wzory i pogrubienie jak w źródle
await zaznaczIWstaw('Pierwszy akapit', 'Ostatni akapit po wzorze.')
// źródło sprawdzamy w danych — tam widać dokładnie, co wpadło
const wDanych = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  const db = await new Promise((res) => {
    req.onsuccess = () => res(req.result)
  })
  const paths = await new Promise((res) => {
    const r = db.transaction('paths').objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  const f = paths[0].nodes.find((n) => n.kind === 'fusion')
  return f?.content ?? ''
})
check('wzór w linii zapisany jako $…$',
  wDanych.includes('$z \\in y_1$') && wDanych.includes('$z \\in y_2$'),
  wDanych.slice(0, 220))
check('wzór blokowy zapisany jako $$…$$',
  wDanych.includes('$$\\forall x \\exists y'),
  wDanych.slice(0, 220))
check('pogrubienie przeżywa kopiowanie',
  wDanych.includes('**z pogrubieniem**'),
  wDanych.slice(0, 120))
check('nowe scalenie startuje od pustego kafelka — jest tylko to, co wzięte',
  !wDanych.includes('Cos zupelnie innego'),
  wDanych.slice(0, 120))

// 2. zaznaczenie NAPOCZĘTE: od środka zdania, przez wzór, do środka innego
await page.locator('.komp-strony .block-page').first().click()
await page.waitForTimeout(400)
await zaznaczIWstaw('akapit', 'Ostatni')
const poCzesciowym = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  const db = await new Promise((res) => { req.onsuccess = () => res(req.result) })
  const paths = await new Promise((res) => {
    const r = db.transaction('paths').objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  return paths[0].nodes.find((n) => n.kind === 'fusion')?.content ?? ''
})
const ogon = poCzesciowym.slice(poCzesciowym.indexOf('akapit', 40))
check('zaznaczenie od środka zdania nie bierze tego, co przed nim',
  !ogon.startsWith('Pierwszy'), ogon.slice(0, 60))
check('a wzory w środku i tak wracają jako źródło',
  ogon.includes('$z \\in y_1$') && ogon.includes('$$\\forall x'),
  ogon.slice(0, 200))

// 3. zwykłe Ctrl+C też ma dawać źródło, nie sklejkę trzech kopii wzoru
await page.locator('.komp-strony .block-page').first().click()
await page.waitForTimeout(400)
await page.evaluate(() => {
  const pod = document.querySelector('.komp-podglad')
  const r = document.createRange()
  r.selectNodeContents(pod.querySelector('[data-md]:nth-of-type(2)') ?? pod)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(r)
})
await page.waitForTimeout(300)
await page.keyboard.press('Control+c')
await page.waitForTimeout(500)
const schowek = await page.evaluate(() => navigator.clipboard.readText())
check('Ctrl+C daje wzory jako źródło, a nie potrojony bełkot',
  schowek.includes('$z \\in y_1$') && !/z∈y1.*z∈y1/s.test(schowek),
  schowek.slice(0, 160))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
