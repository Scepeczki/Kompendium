// Test odporności: klocek/PDF z folderId wskazującym na nieistniejący folder
// (dokładnie taki problem, jaki wystąpił w praniu) musi być widoczny na
// poziomie głównym zamiast znikać.
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

// wstrzyknij bezpośrednio do IndexedDB klocek i PDF z folderId-widmem
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res, rej) => {
    req.onsuccess = res
    req.onerror = rej
  })
  const db = req.result
  const now = new Date().toISOString()
  const tx = db.transaction(['concepts', 'versions', 'pdfs'], 'readwrite')
  tx.objectStore('concepts').add({
    id: 'orphan-concept',
    name: 'Osierocony klocek',
    type: 'definicja',
    tags: [],
    folderId: 'folder-ktorego-nie-ma',
    order: 999,
    createdAt: now,
    updatedAt: now,
    currentVersionId: 'orphan-version',
  })
  tx.objectStore('versions').add({
    id: 'orphan-version',
    conceptId: 'orphan-concept',
    version: 1,
    content: 'test',
    sourceRefs: [],
    createdAt: now,
    updatedAt: now,
  })
  tx.objectStore('pdfs').add({
    id: 'orphan-pdf',
    title: 'Osierocony PDF',
    fileName: 'x.pdf',
    folderId: 'inny-widmowy-folder',
    addedAt: now,
    data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
  })
  await new Promise((res, rej) => {
    tx.oncomplete = res
    tx.onerror = rej
  })
})

await page.reload()
await page.waitForSelector('text=Kompendium')

await page.waitForSelector('.concept-item:has-text("Osierocony klocek")')
console.log('✓ klocek z widmowym folderId widoczny na poziomie głównym')

await page.click('.concept-item:has-text("Osierocony klocek")')
await page.click('.pdf-lib-toggle')
await page.waitForSelector('.pdflib-item:has-text("Osierocony PDF")')
console.log('✓ PDF z widmowym folderId widoczny w bibliotece (poziom główny)')

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
