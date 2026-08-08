// Test pisania wprost w ścieżce (widok Linia): tytuły, treść klocka,
// notatka, komentarz, rozdział, nazwa i treść fuzji. Plus dwie barierki:
// Skrypt zostaje do czytania, a po starszej wersji klocka pisać nie wolno.
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Kres gorny', 'Notacja']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc ${n}.`)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

await nowaSciezka(page, 'Warsztat')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Kres gorny', 'Notacja']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}

/** Prawy przycisk na górnej połowie segmentu, z ominięciem paska narzędzi —
 *  przy przewiniętej liście pasek potrafi zasłonić górę pierwszego kafelka. */
const menuNad = async (nr) => {
  // kursor w polu tekstowym zabiera prawy przycisk sobie (menu przeglądarki)
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur())
  const seg = page.locator('.linear-seg').nth(nr)
  // pasek narzędzi jest przyklejony u góry, więc segment ustawiamy tak, żeby
  // jego górna krawędź na pewno spod niego wyszła
  await seg.evaluate((el) => {
    el.scrollIntoView({ block: 'start' })
    let p = el.parentElement
    while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement
    if (p) p.scrollTop -= 80
  })
  await page.waitForTimeout(400)
  const b = await seg.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + 6, { button: 'right' })
  await page.waitForSelector('.linear-menu')
}

const zBazy = async (co) =>
  page.evaluate(async (tabela) => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const r = req.result.transaction(tabela, 'readonly').objectStore(tabela).getAll()
    await new Promise((res) => (r.onsuccess = res))
    return r.result
  }, co)

// 1. tytuł klocka zmienia się wprost w ścieżce — i zmienia klocek w bazie
check('tytuł klocka jest polem, nie napisem',
  (await page.locator('.linear-seg .script-block-title .inline-title').count()) === 2)
await page.fill('.linear-seg:first-child .script-block-title .inline-title', 'Kres górny zbioru')
await page.waitForTimeout(700)
const klocki = await zBazy('concepts')
check('nowa nazwa trafia do klocka w bazie',
  klocki.some((c) => c.name === 'Kres górny zbioru'),
  klocki.map((c) => c.name).join(' | '))
check('lista po lewej też pokazuje nową nazwę',
  (await page.locator('.concept-item:has-text("Kres górny zbioru")').count()) === 1)

// 2. treść klocka: jeden klik i piszesz — bez żadnego trybu edycji
await page.click('.linear-seg:first-child .markdown-body')
await page.waitForSelector('.linear-seg:first-child .linear-pole .tiptap')
check('klik w treść daje pole do pisania',
  (await page.locator('.linear-seg:first-child .linear-pole .tiptap').count()) === 1)
await page.keyboard.press('End')
await page.keyboard.type(' DOPISANE-W-SCIEZCE')
await page.waitForTimeout(900)
const wersje = await zBazy('versions')
check('dopisany tekst trafia do wersji klocka',
  wersje.some((v) => v.content.includes('DOPISANE-W-SCIEZCE')),
  wersje.map((v) => v.content).join(' | '))
// pasek narzędzi jest jeden na całą ścieżkę i działa na polu z kursorem
check(
  'ścieżka ma wspólny pasek narzędzi',
  (await page.locator('.linear-toolbar .rich-btn').count()) >= 6,
  `przycisków: ${await page.locator('.linear-toolbar .rich-btn').count()}`,
)
await page.keyboard.down('Shift')
for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft')
await page.keyboard.up('Shift')
await page.click('.linear-toolbar .rich-btn:has-text("B")')
await page.waitForTimeout(900)
const pogrubione = await zBazy('versions')
check('pasek działa na kafelku, w którym stoi kursor',
  pogrubione.some((v) => v.content.includes('**')),
  pogrubione.map((v) => v.content).join(' | '))

// 3. rozdział — nazwa wpisywana wprost
await menuNad(0)
await page.click('.linear-menu .tree-menu-item:has-text("Rozdział"):not(:has-text("Pod"))')
await podaj(page, 'Rozdzial I')
await page.waitForTimeout(700)
await page.fill('.linear-seg:first-child .inline-title', 'Rozdzial I: Kresy')
await page.waitForTimeout(900)
const sciezki = await zBazy('paths')
check('nazwę rozdziału zmienia się wprost w ścieżce',
  sciezki.some((p) =>
    p.nodes.some((n) => n.kind === 'heading' && n.text === 'Rozdzial I: Kresy'),
  ),
  JSON.stringify(sciezki.flatMap((p) => p.nodes.filter((n) => n.kind === 'heading').map((n) => n.text))))

// 4. notatka — klik i pisanie, bez okienka
await menuNad(0)
await page.click('.linear-menu .tree-menu-item:has-text("Notatka")')
await page.waitForTimeout(700)
await page.click('.linear-note .markdown-body')
await page.waitForSelector('.linear-note .tiptap')
await page.click('.linear-note .tiptap')
await page.keyboard.type('Notatka pisana na miejscu.')
await page.waitForTimeout(900)
await page.waitForTimeout(500)
check('notatkę pisze się na miejscu, bez okienka',
  (await page.textContent('.linear-column')).includes('Notatka pisana na miejscu'))

// 5. w pasku segmentu nie ma już pióra
check('pióro zniknęło z paska segmentu',
  (await page.locator('.linear-side .folder-action[title="Edytuj"]').count()) === 0)

// 6. fuzja: nazwa wprost, rodzaj pod prawym przyciskiem
// pierwszy segment, który w ogóle ma co scalać z następnym
const doScalenia = page.locator('.folder-action[title*="Scal z następnym"]').first()
await doScalenia.scrollIntoViewIfNeeded()
await doScalenia.click({ force: true })
await podaj(page, 'Kres i notacja')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(700)
await page.fill('.script-group-block .inline-title', 'Kres górny i notacja')
await page.waitForTimeout(700)
check('nazwę scalonego bloku zmienia się wprost',
  (await page.inputValue('.script-group-block .inline-title')) === 'Kres górny i notacja')
const nrFuzji = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].findIndex((s) =>
    s.querySelector('.script-group-block'),
  ),
)
await menuNad(nrFuzji)
const pozycje = await page.locator('.linear-menu .tree-menu-item').allTextContents()
check('menu scalonego bloku ma rodzaj i rozdzielenie',
  pozycje.join('|').includes('Czym to jest') && pozycje.join('|').includes('Rozdziel'),
  pozycje.map((s) => s.trim()).join(' · '))
await page.keyboard.press('Escape')

// 7. Skrypt zostaje do czytania
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.waitForTimeout(500)
check('w Skrypcie tytuły nie są polami',
  (await page.locator('.script-body .inline-title').count()) === 0)
check('w Skrypcie treść nie zaprasza do pisania',
  (await page.locator('.script-body .do-pisania').count()) === 0)

// 8. po starszej wersji klocka pisać nie wolno
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.click('.concept-item:has-text("Kres górny zbioru")')
await page.waitForSelector('.editor-name')
await page.click('button:has-text("+ nowa wersja")')
await page.waitForSelector('.ask-dialog')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(700)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('.concept-item:has-text("Warsztat")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(600)
// przełącz segment na starszą wersję
const blok = page.locator('.linear-seg:has(.block-pick-select)').first()
await blok.locator('.block-pick-select').selectOption({ index: 0 })
await page.waitForTimeout(700)
check('starsza wersja nie zaprasza do pisania',
  (await blok.locator('.markdown-body.do-pisania').count()) === 0)
await blok.locator('.markdown-body').first().click()
await page.waitForTimeout(400)
await blok.locator('.markdown-body').first().click()
await page.waitForTimeout(500)
check('starsza wersja nie ma pola do pisania',
  (await blok.locator('.linear-pole').count()) === 0)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
