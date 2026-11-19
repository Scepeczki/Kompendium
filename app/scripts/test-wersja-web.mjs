// Wersja pod adres w internecie (npm run build:web) — sprawdzenie, że wstaje.
//
// Adres na GitHub Pages ma podkatalog: /Kompendium-web/. Jeśli ścieżka bazowa
// się nie zgadza, telefon dostaje BIAŁY EKRAN i nic więcej — żadnego błędu do
// zobaczenia, żadnej podpowiedzi. Dlatego ten test stawia własny serwer pod
// tym właśnie podkatalogiem i patrzy, czy program się pokazuje, czy manifest
// i ikony się znajdują i czy nic nie wraca błędem 404.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const problems = []
const errors = []
const braki = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4174
const ADRES = `http://localhost:${PORT}/Kompendium-web/`

if (!existsSync(resolve(APP, 'dist-web/index.html'))) {
  console.log('Brak dist-web — buduję.')
  spawn('npm', ['run', 'build:web'], { cwd: APP, shell: true, stdio: 'inherit' })
  await new Promise((r) => setTimeout(r, 15000))
}

const serwer = spawn(
  'npx',
  ['vite', 'preview', '--base=/Kompendium-web/', '--outDir', 'dist-web',
   '--port', String(PORT), '--strictPort'],
  { cwd: APP, shell: true, stdio: 'ignore' },
)
const stopSerwer = () => {
  try {
    serwer.kill()
  } catch {
    /* i tak kończymy */
  }
}
process.on('exit', stopSerwer)

// czekamy, aż serwer odpowie
let zyje = false
for (let i = 0; i < 40 && !zyje; i++) {
  await new Promise((r) => setTimeout(r, 500))
  try {
    const r = await fetch(ADRES)
    zyje = r.ok
  } catch {
    /* jeszcze nie wstał */
  }
}
check('serwer podglądu wstał', zyje)

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('response', (r) => {
  if (r.status() >= 400) braki.push(`${r.status()} ${r.url()}`)
})

await page.goto(ADRES)
await page.waitForSelector('text=Kompendium', { timeout: 20000 })
await page.waitForTimeout(1500)

check('program się pokazuje, a nie biały ekran',
  (await page.locator('.sidebar').count()) === 1)
check('nic nie wraca błędem', braki.length === 0, braki.slice(0, 3).join(' | '))

const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel=manifest]')
  if (!link) return null
  const r = await fetch(link.href)
  if (!r.ok) return { blad: r.status }
  const m = await r.json()
  // ikony też muszą się znaleźć — inaczej telefon nie da dodać do ekranu
  const ikony = []
  for (const i of m.icons ?? []) {
    const u = new URL(i.src, link.href)
    ikony.push({ src: i.src, ok: (await fetch(u)).ok })
  }
  return { name: m.name, ikony }
})
check('manifest się znajduje', manifest?.name === 'Kompendium', JSON.stringify(manifest))
check('ikony się znajdują',
  (manifest?.ikony ?? []).length > 0 && manifest.ikony.every((i) => i.ok),
  (manifest?.ikony ?? []).map((i) => `${i.src}:${i.ok ? 'ok' : 'BRAK'}`).join(' '))

const sw = await page.evaluate(() =>
  navigator.serviceWorker.getRegistration().then((r) => r?.active?.scriptURL ?? null),
)
check('tryb offline wpięty pod właściwą ścieżką',
  typeof sw === 'string' && sw.includes('/Kompendium-web/sw.js'), String(sw))

// program musi działać, nie tylko się pokazać
// (ekran telefonu: lista jest schowana, więc najpierw ją przywołujemy)
await page.click('.szuflada-przycisk')
await page.waitForTimeout(400)
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Próba z internetu')
await page.waitForTimeout(600)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(1200)
check('dane zapisują się i przeżywają przeładowanie',
  (await page.locator('.concept-item:has-text("Próba z internetu")').count()) === 1)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
stopSerwer()
process.exit(problems.length === 0 ? 0 : 1)
