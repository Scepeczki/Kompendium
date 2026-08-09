// Które segmenty w Linii mają pole do pisania, a które nie.
import { chromium } from 'playwright'
import { nowaSciezka, podaj } from './lib.mjs'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const bledy = []
page.on('pageerror', (e) => bledy.push(String(e)))
page.on('console', (m) => m.type() === 'error' && bledy.push(m.text()))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc ${n}.`)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
// Beta dostaje drugą stronę
await page.click('.concept-item:has-text("Beta")')
await page.waitForSelector('.editor-name')
const dodajStrone = page.locator('button[title*="Nowa strona"], button:has-text("+ strona")')
if (await dodajStrone.count()) {
  await dodajStrone.first().click()
  await podaj(page, 'Dowod').catch(() => {})
  await page.waitForTimeout(500)
}
await page.click('.btn-close[title*="Zamknij klocek"]')

await nowaSciezka(page, 'Proba')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}
// rozdział + notatka na końcu
await page.click('.linear-append .btn:has-text("Rozdział")')
await podaj(page, 'Rozdzial').catch(() => {})
await page.waitForTimeout(500)
await page.click('.linear-append .btn:has-text("Notatka")').catch(() => {})
await page.waitForTimeout(700)
// fuzja pierwszych dwóch
await page.locator('.folder-action[title*="Scal z następnym"]').first().click({ force: true })
await podaj(page, 'Scalone').catch(() => {})
await page.waitForTimeout(1500)

const opis = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].map((s) => ({
    rodzaj: s.querySelector('.script-group-block')
      ? 'fuzja'
      : s.querySelector('.script-block')
        ? 'klocek'
        : s.querySelector('.script-heading-node')
          ? 'rozdzial'
          : s.querySelector('.linear-sidenote')
            ? 'komentarz'
            : s.querySelector('.linear-note')
              ? 'notatka'
              : '?',
    pelny: s.dataset.pelny,
    pola: s.querySelectorAll('.linear-pole').length,
    tekstDoPisania: s.querySelectorAll('.markdown-body.do-pisania').length,
    tylkoCzytanie: [...s.querySelectorAll('.markdown-body')].filter(
      (m) => !m.classList.contains('do-pisania') && !m.closest('.linear-pole'),
    ).length,
  })),
)
console.log(JSON.stringify(opis, null, 1))
console.log('błędy:', bledy.slice(0, 5))
await browser.close()
