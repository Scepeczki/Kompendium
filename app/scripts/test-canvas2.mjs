// Test ulepszeń canvasu: przesuwalny tekst, siatka + Shift-snap,
// menu prawego przycisku, kolejność gałęzi (numerki na strzałkach).
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Ścieżka testowa'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')

// 1. MENU PRAWEGO PRZYCISKU: nowy klocek i nowy tekst w miejscu kliknięcia
const flow = await page.locator('.path-flow').boundingBox()
const at = (fx, fy) => ({ x: flow.x + flow.width * fx, y: flow.y + flow.height * fy })

const p1 = at(0.45, 0.15)
await page.mouse.click(p1.x, p1.y, { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=🧱 Nowy klocek tutaj')
await page.waitForSelector('.path-node:has-text("Nowe pojęcie")')
console.log('✓ prawy przycisk → nowy klocek na mapie (i w bazie)')

const p2 = at(0.15, 0.75)
await page.mouse.click(p2.x, p2.y, { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=📝 Nowa notatka tutaj')
await page.waitForSelector('.path-node-text')
console.log('✓ prawy przycisk → nowa notatka na mapie')

// 2. PRZESUWALNY TEKST: przeciągnij za uchwyt „✥ notatka"
const grip = await page.locator('.path-node-grip').boundingBox()
const gx = grip.x + grip.width / 2
const gy = grip.y + grip.height / 2
await page.mouse.move(gx, gy)
await page.mouse.down()
await page.mouse.move(gx + 5, gy + 5)
await page.mouse.move(gx + 140, gy - 90, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
const gripAfter = await page.locator('.path-node-grip').boundingBox()
const moved = Math.abs(gripAfter.x - grip.x) > 50
console.log(`✓ pole tekstowe przesuwalne za uchwyt: ${moved ? 'tak' : 'NIE!'}`)

// 3. SIATKA: włącz przełącznikiem, sprawdź linie; Shift-snap przy przesuwaniu
await page.click('button:has-text("⊞ Siatka")')
await page.waitForSelector('.react-flow__background')
console.log('✓ siatka włączona przełącznikiem')

// przesuń klocek z Shiftem — pozycja powinna trafić na wielokrotność 20
const node = await page.locator('.path-node:has-text("Nowe pojęcie")').boundingBox()
await page.keyboard.down('Shift')
await page.mouse.move(node.x + 60, node.y + 15) // za nagłówek
await page.mouse.down()
await page.mouse.move(node.x + 65, node.y + 20)
await page.mouse.move(node.x + 60 + 87, node.y + 15 + 53, { steps: 6 })
await page.mouse.up()
await page.keyboard.up('Shift')
await page.waitForTimeout(600)
const snapped = await page.$eval(
  '.react-flow__node:has(.path-node:not(.path-node-text))',
  (el) => {
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)
    if (!m) return 'brak transform'
    const x = parseFloat(m[1])
    const y = parseFloat(m[2])
    return { x, y, snapX: x % 20 === 0, snapY: y % 20 === 0 }
  },
)
console.log('✓ Shift-snap do siatki:', JSON.stringify(snapped))

// 4. KOLEJNOŚĆ GAŁĘZI: klocek → dwa teksty; numerki; klik zmienia kolejność
// dodaj drugi tekst
const p3 = at(0.85, 0.92)
await page.mouse.click(p3.x, p3.y, { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=📝 Nowa notatka tutaj')
await page.waitForTimeout(300)
// wpisz rozróżnialne treści przez okno edycji
const noteNodes = page.locator('.react-flow__node:has(.path-node-text)')
for (const [i, txt] of [[0, 'TEKST-PIERWSZY'], [1, 'TEKST-DRUGI']]) {
  await noteNodes.nth(i).dblclick()
  await page.waitForSelector('.note-modal .rich-content .tiptap')
  await page.click('.note-modal .rich-content .tiptap')
  await page.keyboard.type(txt)
  await page.waitForTimeout(600)
  await page.click('.note-modal .btn-close')
}

// połącz klocek z oboma tekstami
async function connect(fromSel, toSel) {
  // ponawianie — pomiary układu bywają chwilowo nieaktualne
  for (let attempt = 1; attempt <= 4; attempt++) {
    const before = await page.locator('.react-flow__edge').count()
    const s = await page.locator(fromSel).boundingBox()
    const t = await page.locator(toSel).boundingBox()
    const sx = s.x + s.width / 2
    const sy = s.y + s.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + 4, sy + 4)
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    if ((await page.locator('.react-flow__edge').count()) > before) return
  }
  throw new Error(`nie udało się połączyć: ${fromSel} → ${toSel}`)
}
const blockSel = '.react-flow__node:has(.path-node-head)'
await connect(
  `${blockSel} .react-flow__handle-bottom`,
  '.react-flow__node:has-text("TEKST-PIERWSZY") .react-flow__handle-top',
)
await connect(
  `${blockSel} .react-flow__handle-bottom`,
  '.react-flow__node:has-text("TEKST-DRUGI") .react-flow__handle-top',
)
await page.waitForSelector('.edge-order')
const labels = await page.locator('.edge-order').count()
console.log(`✓ numerki kolejności na strzałkach: ${labels}`)

// sprawdź porządek w skrypcie (bazowo wg pozycji: PIERWSZY jest wyżej? oba y=500;
// x: 700 vs 1000 → PIERWSZY przed DRUGIM)
await page.waitForTimeout(800) // autozapis
await page.click('text=📜 Skrypt')
await page.waitForSelector('.script-embed')
let texts = await page.$$eval('.script-text', (els) => els.map((e) => e.textContent.trim()))
const baseFirst = texts[0]
console.log('kolejność bazowa w skrypcie:', texts.join(' | '))
await page.click('button:has-text("🗺 Mapa")')

// kliknij numerek „2" → ta gałąź przechodzi na pozycję 1 (zawinięcie)
await page.locator('.edge-order:has-text("2")').click()
await page.waitForTimeout(800) // autozapis
await page.click('text=📜 Skrypt')
await page.waitForSelector('.script-embed')
texts = await page.$$eval('.script-text', (els) => els.map((e) => e.textContent.trim()))
console.log('kolejność po przestawieniu:', texts.join(' | '))
const swapped = texts[0] !== baseFirst
console.log(`✓ klik w numerek zmienia kolejność gałęzi w skrypcie: ${swapped ? 'tak' : 'NIE!'}`)
await page.screenshot({ path: 'scripts/shot-13-canvas2.png' })

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
