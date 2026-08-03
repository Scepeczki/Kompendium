// Test stron klocka (dowodów): dodawanie/nazywanie/edycja w edytorze,
// zakładki w kafelku ścieżki (wybór bazowej strony), przełączanie w Skrypcie.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

// odpowiedzi na kolejne window.prompt
const answers = ['Dowód', 'Szkic dowodu', 'Ścieżka stron']
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

const readDb = (store) =>
  page.evaluate(async (st) => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const tx = req.result.transaction(st, 'readonly')
    return await new Promise((res) => {
      const r = tx.objectStore(st).getAll()
      r.onsuccess = () => res(r.result)
    })
  }, store)

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// 1. nowy klocek z treścią główną
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.rich-content .tiptap')
await page.fill('.editor-name', 'Twierdzenie testowe')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Treść główna twierdzenia.')
await page.waitForTimeout(600)

// 2. panel stron widoczny, dodanie strony „Dowód"
await page.waitForSelector('.subpage-rail')
await page.click('.subpage-add')
await page.waitForSelector('.subpage-item.active:has-text("Dowód")')
console.log('✓ dodana strona „Dowód" (aktywna po utworzeniu)')

// 3. edycja treści strony
await page.click('.rich-content .tiptap')
await page.keyboard.type('Dowód przez indukcję.')
await page.waitForTimeout(700)
const subs1 = await readDb('subpages')
const dowod = subs1.find((s) => s.name === 'Dowód')
console.log(
  `✓ treść strony w bazie: ${dowod?.content.includes('indukcj') ? 'ok' : 'BRAK! ' + JSON.stringify(subs1)}`,
)

// 4. powrót na Treść — główna treść nietknięta
await page.click('.subpage-item:has-text("Treść")')
await page.waitForTimeout(300)
const mainTxt = await page.textContent('.rich-content .tiptap')
console.log(
  `✓ powrót na Treść: ${mainTxt.includes('Treść główna') && !mainTxt.includes('indukcj') ? 'ok' : 'BRAK! ' + mainTxt.slice(0, 60)}`,
)

// 5. druga strona o własnej nazwie
await page.click('.subpage-add')
await page.waitForSelector('.subpage-item.active:has-text("Szkic dowodu")')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Krótki szkic.')
await page.waitForTimeout(600)
console.log('✓ druga strona z dowolną nazwą („Szkic dowodu")')

// 6. nowa ścieżka z tym klockiem
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.dragAndDrop('.concept-item:has-text("Twierdzenie testowe")', '.path-flow', {
  targetPosition: { x: 420, y: 220 },
})
await page.waitForSelector('.path-node .path-node-name:has-text("Twierdzenie testowe")')
console.log('✓ kafelek na mapie ścieżki')

// 7. zakładki stron w kafelku; klik „Dowód" ustawia stronę bazową
await page.waitForSelector('.path-node .page-chips')
await page.click('.path-node .page-chip:has-text("Dowód")')
await page.waitForTimeout(700)
const nodeBody = await page.textContent('.path-node .path-node-body')
console.log(
  `✓ kafelek pokazuje wybraną stronę: ${nodeBody.includes('indukcj') ? 'ok' : 'BRAK! ' + nodeBody.slice(0, 60)}`,
)

// 8. zapis w ścieżce (subpageId trafia do bazy)
const paths1 = await readDb('paths')
const savedSub =
  paths1
    .find((x) => x.name === 'Ścieżka stron')
    ?.nodes.find((n) => n.kind === 'block')?.subpageId ?? null
console.log(`✓ bazowa strona zapisana w ścieżce: ${savedSub ? 'ok' : 'BRAK!'}`)

// 9. Skrypt: bazowo pokazuje „Dowód", przełączenie na Treść działa (bez zapisu)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body .script-block')
const scriptTxt = await page.textContent('.script-body .script-block')
console.log(
  `✓ Skrypt pokazuje bazową stronę: ${scriptTxt.includes('indukcj') ? 'ok' : 'BRAK! ' + scriptTxt.slice(0, 80)}`,
)
// w Skrypcie strony wybiera się etykietami w oprawie bloku (.block-page)
await page.click('.script-body .block-page:has-text("Treść")')
await page.waitForTimeout(300)
const scriptTxt2 = await page.textContent('.script-body .script-block')
console.log(
  `✓ przełączenie w Skrypcie na Treść: ${scriptTxt2.includes('Treść główna') ? 'ok' : 'BRAK!'}`,
)
const paths2 = await readDb('paths')
const stillSaved =
  paths2
    .find((x) => x.name === 'Ścieżka stron')
    ?.nodes.find((n) => n.kind === 'block')?.subpageId ?? null
console.log(`✓ przełączanie w Skrypcie nie zmienia ścieżki: ${stillSaved ? 'ok' : 'BRAK!'}`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
