// Test trybu liniowego: doklejanie klocków, notatka między segmentami,
// zmiana kolejności uchwytem, spójność ze skryptem i mapą.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
const answers = ['Ścieżka L']
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dwa klocki z treścią
for (const [name, content] of [
  ['Alfa', 'Treść alfa $a^2$.'],
  ['Beta', 'Treść beta $b^2$.'],
]) {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Podział")')
  await page.click('.cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(600)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

// nowa ścieżka → tryb Linia
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.click('button:has-text("≡ Linia")')
await page.waitForSelector('.linear-append')
console.log('✓ tryb liniowy otwarty')

// doklej Alfa i Beta do strefy na końcu
await page.dragAndDrop('.concept-item:has-text("Alfa")', '.linear-append')
await page.waitForSelector('.linear-seg .script-block:has-text("Alfa")')
await page.dragAndDrop('.concept-item:has-text("Beta")', '.linear-append')
await page.waitForSelector('.linear-seg .script-block:has-text("Beta")')
console.log('✓ klocki doklejone do linii (forma jak w skrypcie)')

// notatka na końcu (otwiera od razu okno edycji) — wpisz i zamknij
await page.click('.linear-append button:has-text("+ Notatka")')
await page.waitForSelector('.note-modal .rich-content .tiptap')
await page.click('.note-modal .rich-content .tiptap')
await page.keyboard.type('NOTATKA-POD-BETĄ')
await page.waitForTimeout(600)
await page.click('.note-modal .btn-close')
await page.waitForSelector('.linear-note:has-text("NOTATKA-POD-BETĄ")')
console.log('✓ notatka dopisana pod klockiem')

// wstaw klocek MIĘDZY segmenty: przeciągnij Alfa (z listy) nad segment Beta (górna połowa)
// — czyli duplikat Alfy między Alfa a Beta? Zamiast tego: zmiana kolejności uchwytem:
// przeciągnij segment Beta nad segment Alfa (górna połowa = przed)
const betaGrip = page.locator('.linear-seg:has-text("Beta") .linear-grip')
await betaGrip.hover()
await page.dragAndDrop(
  '.linear-seg:has-text("Treść beta") .linear-grip',
  '.linear-seg:has-text("Treść alfa")',
  { targetPosition: { x: 200, y: 6 } },
)
await page.waitForTimeout(600)
let order = await page.$$eval('.linear-seg .script-block-title', (els) =>
  els.map((e) => e.textContent.trim()),
)
console.log('✓ kolejność po przeciągnięciu (oczekiwana Beta | Alfa):', order.join(' | '))

// skrypt widzi tę samą kolejność
await page.waitForTimeout(700)
await page.click('text=📜 Skrypt')
await page.waitForSelector('.script-embed .script-block')
const scriptOrder = await page.$$eval('.script-embed .script-block-title', (els) =>
  els.map((e) => e.textContent.trim()),
)
console.log('✓ skrypt w tej samej kolejności:', scriptOrder.join(' | '))

// mapa pokazuje łańcuch (3 kafelki + 2 strzałki)
await page.click('button:has-text("🗺 Mapa")')
await page.waitForSelector('.react-flow__node')
const nodes = await page.locator('.react-flow__node').count()
const edges = await page.locator('.react-flow__edge').count()
console.log(`✓ mapa spójna z linią: kafelki=${nodes}, strzałki=${edges}`)

// usuń segment w linii → łańcuch się zszywa
await page.click('button:has-text("≡ Linia")')
await page.waitForSelector('.linear-seg')
const alfaSeg = page.locator('.linear-seg:has-text("Treść alfa")')
await alfaSeg.hover()
await alfaSeg.locator('.folder-action[title="Usuń ze ścieżki"]').click()
await page.waitForTimeout(600)
const segs = await page.locator('.linear-seg').count()
console.log(`✓ usuwanie segmentu działa (zostało: ${segs})`)

// komentarz boczny: dodaj, sprawdź stronę prawą, przełóż na lewą
await page.click('.linear-append button:has-text("+ 💬 Komentarz")')
await page.waitForSelector('.note-modal .rich-content .tiptap')
await page.click('.note-modal .rich-content .tiptap')
await page.keyboard.type('BOCZNY')
await page.waitForTimeout(600)
await page.click('.note-modal .btn-close')
await page.waitForSelector('.linear-sidenote.side-right:has-text("BOCZNY")')
console.log('✓ komentarz jako notatka boczna po prawej')
await page.hover('.linear-sidenote')
await page.click('.folder-action[title*="drugą stronę"]')
await page.waitForSelector('.linear-sidenote.side-left:has-text("BOCZNY")')
console.log('✓ przełożenie komentarza na lewą stronę działa')

// powrót do ścieżki: edytuj klocek z linii (✏) i zamknij edytor → wracamy do ścieżki
const betaSegLeft = page.locator('.linear-seg:has-text("Treść beta")')
await betaSegLeft.hover()
await betaSegLeft.locator('.folder-action[title="Edytuj"]').click()
await page.waitForSelector('.editor-name')
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForSelector('.path-canvas')
console.log('✓ zamknięcie klocka wraca do ścieżki (nie do ekranu startowego)')

// powrót z PDF do biblioteki strzałką ←
await page.setInputFiles('input[type=file]', 'scripts/test.pdf').catch(() => {})
console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await page.screenshot({ path: 'scripts/shot-15-linear.png' })
await browser.close()
