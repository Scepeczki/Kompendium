// Test „przykrywania": klocek ogólny w ścieżce wypisuje swoje przypadki
// szczególne (i inne powiązania), a ich treść można rozwinąć w miejscu.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['n = 1', 'Sciezka ogolna']
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mk = async (name, content) => {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await mk('Jezyk 1 rzedu', 'Kwantyfikacja po elementach uniwersum.')
await mk('Jezyk 2 rzedu', 'Kwantyfikacja takze po relacjach.')
await mk('Jezyk wg Ksiazki B', 'Ujecie przez teorie typow.')

// klocek ogólny + powiązania
await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Jezyk n-tego rzedu')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Kwantyfikacja siega obiektow rzedu co najwyzej $n$.')
await page.waitForTimeout(500)
await page.waitForSelector('.relations')

const addRel = async (button, target) => {
  await page.click(`.relations-add-btn:has-text("${button}")`)
  await page.waitForSelector('.picker-modal')
  await page.fill('.picker-search', target)
  await page.waitForTimeout(300)
  await page.click(`.picker-item:has-text("${target}")`)
  await page.waitForTimeout(500)
}
await addRel('mocniejsze', 'Jezyk 1 rzedu')
await addRel('mocniejsze', 'Jezyk 2 rzedu')
await addRel('inna perspektywa', 'Jezyk wg Ksiazki B')

// dopisek do pierwszego powiązania (parametr)
await page.hover('.minimap-group.rel-skala .minimap-item')
await page.click('.minimap-group.rel-skala .folder-action[title*="Dopisek"]')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')

// ścieżka tylko z klockiem ogólnym
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.dragAndDrop('.concept-item:has-text("Jezyk n-tego rzedu")', '.path-flow', {
  targetPosition: { x: 400, y: 200 },
})
await page.waitForSelector('.path-node')
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.waitForTimeout(600)

// 1. przypadki szczególne wypisane pod treścią, mimo że nie ma ich w ścieżce
const groups = await page.evaluate(() =>
  [...document.querySelectorAll('.related-group')].map((g) => ({
    etykieta: g.querySelector('.related-label').textContent,
    elementy: [...g.querySelectorAll('.related-chip')].map((b) => b.textContent.trim()),
  })),
)
console.log('✓ powiązania pod treścią bloku ogólnego:')
for (const g of groups) console.log(`   ${g.etykieta} ${g.elementy.join(', ')}`)

// 2. dopisek (parametr) widoczny przy przypadku szczególnym
const note = await page.evaluate(
  () => document.querySelector('.related-note')?.textContent ?? '(brak)',
)
console.log(`✓ dopisek przy przypadku szczególnym: „${note}"`)

// 3. rozwinięcie treści w miejscu (bez opuszczania skryptu)
await page.click('.related-chip:has-text("Jezyk 1 rzedu")')
await page.waitForSelector('.related-expanded')
const expanded = await page.evaluate(() => ({
  nazwa: document.querySelector('.related-expanded-name')?.textContent,
  tresc: document.querySelector('.related-expanded .markdown-body')?.textContent?.trim(),
}))
console.log(`✓ rozwinięcie w miejscu: „${expanded.nazwa}" → „${expanded.tresc}"`)

// 4. drugie kliknięcie zwija
await page.click('.related-chip:has-text("Jezyk 1 rzedu")')
await page.waitForTimeout(300)
const collapsed = await page.locator('.related-expanded').count()
console.log(`✓ ponowne kliknięcie zwija: ${collapsed} (oczekiwane 0)`)

// 5. ścieżka nadal ma tylko jeden kafelek — przykrywanie niczego nie dodaje
const saved = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('paths', 'readonly')
  const all = await new Promise((res) => {
    const r = tx.objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  return all[0].nodes.length
})
console.log(`✓ ścieżka niezmieniona: kafelków ${saved} (oczekiwane 1)`)

// 6. otwarcie klocka z rozwinięcia
await page.click('.related-chip:has-text("Jezyk 2 rzedu")')
await page.waitForSelector('.related-expanded')
await page.click('.related-expanded .script-block-open[title*="Otwórz"]')
await page.waitForTimeout(700)
console.log(`✓ otwarcie z rozwinięcia: „${await page.inputValue('.editor-name')}"`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
