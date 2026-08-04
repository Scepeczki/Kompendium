// Test spisu treści ścieżki: lista rozdziałów, skok po kliknięciu,
// podświetlenie bieżącego rozdziału i chowanie panelu.
import { chromium } from 'playwright'
import { nazwij, podaj } from './lib.mjs'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = [
  'Rozdział I: Liczby',
  'Podrozdział 1.1: Kresy',
  'Rozdział II: Ciągi',
]
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// kilka klocków, żeby skrypt był dłuższy niż ekran
for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Treść klocka ${n}.\n\n`.repeat(6))
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Skrypt z rozdziałami")
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')

// rozdział → klocek → podrozdział → klocek → rozdział → klocek
await page.click('.linear-append button:has-text("+ § Rozdział")')
await podaj(page, 'Rozdział I: Liczby')
await page.dragAndDrop('.concept-item:has-text("Alfa")', '.linear-append')
await page.waitForTimeout(400)
await page.click('.linear-append button:has-text("+ §§ Podrozdział")')
await podaj(page, 'Podrozdział 1.1: Kresy')
await page.dragAndDrop('.concept-item:has-text("Beta")', '.linear-append')
await page.waitForTimeout(400)
await page.click('.linear-append button:has-text("+ § Rozdział")')
await podaj(page, 'Rozdział II: Ciągi')
await page.dragAndDrop('.concept-item:has-text("Gamma")', '.linear-append')
await page.waitForTimeout(600)

// 1. spis treści w widoku Linia
await page.waitForSelector('.outline')
const itemsLinear = await page.evaluate(() =>
  [...document.querySelectorAll('.outline-item')].map(
    (b) => `${b.className.match(/level-\d/)[0]}: ${b.textContent}`,
  ),
)
console.log(`✓ spis treści w Linii:\n   ${itemsLinear.join('\n   ')}`)

// 2. to samo w Skrypcie
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body')
await page.waitForSelector('.outline-item')
const itemsScript = await page.locator('.outline-item').count()
console.log(`✓ spis treści w Skrypcie: ${itemsScript} pozycje`)

// 3. klik przenosi do rozdziału — nagłówek ma trafić pod górną krawędź
// (albo dokument jest już przewinięty do końca, jeśli brakuje treści pod nim)
const measure = (name) =>
  page.evaluate((n) => {
    const scroller = document.querySelector('.script-embed')
    const target = [...document.querySelectorAll('.script-heading-node')].find((h) =>
      h.textContent.includes(n),
    )
    return {
      scrollTop: Math.round(scroller.scrollTop),
      maxScroll: Math.round(scroller.scrollHeight - scroller.clientHeight),
      odGory: Math.round(
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      ),
    }
  }, name)

const before = await measure('Rozdział II')
await page.click('.outline-item:has-text("Rozdział II")')
await page.waitForTimeout(1800)
const after = await measure('Rozdział II')
const naGorze = Math.abs(after.odGory - 12) < 20
const doKonca = after.scrollTop >= after.maxScroll - 2
console.log(
  `✓ klik przenosi do rozdziału: ${before.scrollTop} → ${after.scrollTop} (max ${after.maxScroll}), nagłówek ${after.odGory}px od góry — ${
    naGorze ? 'pod górną krawędzią' : doKonca ? 'koniec dokumentu, ok' : 'ZA NISKO!'
  }`,
)

// 3a. skok do pierwszego rozdziału musi trafić dokładnie pod krawędź
await page.click('.outline-item:has-text("Rozdział I:")')
await page.waitForTimeout(1800)
const first = await measure('Rozdział I:')
console.log(
  `✓ skok do pierwszego rozdziału: nagłówek ${first.odGory}px od góry (${
    Math.abs(first.odGory - 12) < 20 ? 'ok' : 'ZA NISKO!'
  })`,
)

// 4. bieżący rozdział podświetlony (po skoku na początek — Rozdział I)
await page.waitForTimeout(600)
const activeText = await page.evaluate(
  () => document.querySelector('.outline-item.active')?.textContent ?? '(brak)',
)
console.log(
  `✓ podświetlony bieżący rozdział: „${activeText}" (${
    activeText.includes('Rozdział I:') ? 'ok' : 'NIEZGODNY!'
  })`,
)

// 5. chowanie i przywracanie panelu
await page.click('.outline-head button[title*="Schowaj"]')
await page.waitForTimeout(300)
const hidden = {
  panel: await page.locator('.outline').count(),
  przycisk: await page.locator('.outline-reopen').count(),
}
console.log(
  `✓ chowanie spisu: panel ${hidden.panel} (oczekiwane 0), przycisk przywracania ${hidden.przycisk} (oczekiwane 1)`,
)

// 6. wybór pamiętany po przeładowaniu (ścieżkę trzeba otworzyć na nowo —
// aplikacja startuje na ekranie powitalnym)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.concept-item:has-text("Skrypt z rozdziałami")')
await page.waitForSelector('.script-body')
await page.waitForTimeout(800)
const afterReload = await page.locator('.outline-reopen').count()
console.log(`✓ schowany spis pamiętany po przeładowaniu: ${afterReload === 1 ? 'ok' : 'BŁĄD'}`)
await page.click('.outline-reopen')
await page.waitForSelector('.outline')
console.log('✓ przywracanie spisu działa')

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
