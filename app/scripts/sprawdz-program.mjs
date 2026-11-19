// Sprawdzenie zbudowanego programu na Windows (po `npx tauri build`).
//
// Uruchamia src-tauri/target/release/Kompendium.exe na OSOBNYCH, próbnych
// danych (folder tymczasowy), łączy się z jego oknem jak z przeglądarką
// i sprawdza to, czego strona nie ma: most do programu, wersję, kopię do
// folderu, linki na zewnątrz, krzyżyk chowający okno do zasobnika.
// Prawdziwych danych programu ani przeglądarki nie dotyka.
//
//   node scripts/sprawdz-program.mjs
import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXE = resolve(APP, 'src-tauri/target/release/Kompendium.exe')
if (!existsSync(EXE)) {
  console.error(`Brak ${EXE} — najpierw: npx tauri build`)
  process.exit(1)
}

const problemy = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problemy.push(nazwa)
}

const robocze = mkdtempSync(join(tmpdir(), 'komp-program-'))
const dane = join(robocze, 'webview')
const kopie = join(robocze, 'kopie ąę')
const PORT = 9333
const proc = spawn(EXE, [], {
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: dane,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: 'ignore',
})
let zyje = true
proc.on('exit', () => (zyje = false))

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))
let przegladarka
for (let i = 0; i < 40 && !przegladarka; i++) {
  await czekaj(500)
  przegladarka = await chromium.connectOverCDP(`http://localhost:${PORT}`).catch(() => null)
}
if (!przegladarka) {
  console.error('Nie udało się połączyć z oknem programu.')
  proc.kill()
  process.exit(1)
}

try {
  let page
  for (let i = 0; i < 20 && !page; i++) {
    page = przegladarka.contexts().flatMap((c) => c.pages())[0]
    if (!page) await czekaj(300)
  }
  await page.waitForSelector('.sidebar, .app', { timeout: 20000 })
  check('dane próbne w osobnym folderze', existsSync(dane) && readdirSync(dane).length > 0)
  check('program widzi most do Windows', await page.evaluate(() => '__TAURI_INTERNALS__' in window))
  check('bez pracownika serwisowego', await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0) === 0)

  const wersja = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version'))
  check('wersja programu', /^\d+\.\d+\.\d+$/.test(wersja), wersja)

  const domyslny = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('domyslny_folder_kopii'))
  check('domyślny folder kopii w Dokumentach', /Kompendium[\\/]Kopie$/.test(domyslny), domyslny)

  // kopia do folderu (próbnego, z polskimi literami w nazwie)
  await page.evaluate((f) => localStorage.setItem('pulpit.folderKopii', f), kopie)
  await page.click('button[title="Ustawienia"], .sidebar-settings, button:has-text("Ustawienia")').catch(() => {})
  await page.waitForSelector('.settings-page', { timeout: 5000 }).catch(() => {})
  if (await page.locator('.settings-page').count()) {
    await page.click('.settings-nav-item:has-text("Program")')
    check('Ustawienia → Program: wersja', (await page.locator('.settings-page').innerText()).includes(wersja))
    await page.click('button:has-text("Zrób kopię teraz")')
    await page.waitForSelector('.settings-status', { timeout: 20000 })
    const status = await page.locator('.settings-status').innerText()
    const pliki = existsSync(kopie) ? readdirSync(kopie) : []
    check('kopia zapisana w folderze', status.startsWith('Zapisano') && pliki.some((f) => /^kompendium-.*\.zip$/.test(f)), `${status} | ${pliki.join()}`)
    await page.click('button:has-text("Zrób kopię teraz")')
    await page.waitForTimeout(3000)
    check('druga kopia tego dnia nie nadpisuje pierwszej', readdirSync(kopie).length === 2, readdirSync(kopie).join())
    check('start z Windows: przełącznik działa', (await page.locator('[data-program="autostart"] input').isEnabled()))
  } else {
    check('otwarcie Ustawień', false)
  }

  // link na zewnątrz nie podmienia okna programu
  const adresPrzed = page.url()
  await page.evaluate(() => window.open('https://example.com/'))
  await czekaj(800)
  check('window.open nie podmienia okna', page.url() === adresPrzed)

  // krzyżyk chowa do zasobnika, program działa dalej
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }))
  await czekaj(1500)
  check('krzyżyk nie zamyka programu', zyje)
  const widoczne = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })).catch((e) => String(e))
  check('okno schowane', widoczne === false, String(widoczne))
} catch (e) {
  check('przebieg sprawdzenia', false, e.message)
} finally {
  await przegladarka.close().catch(() => {})
  proc.kill()
  await czekaj(800)
  // Program przy pierwszym starcie dopisuje się do autostartu — tu to był
  // egzemplarz próbny, więc wpis zdejmujemy (prawdziwy zrobi to sam po instalacji).
  try {
    execFileSync('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'Kompendium', '/f'], { stdio: 'ignore' })
  } catch {
    // nie było wpisu
  }
  rmSync(robocze, { recursive: true, force: true })
}

console.log(problemy.length ? `\n>>> PROBLEMY: ${problemy.length}` : '\n>>> WSZYSTKO POPRAWNE')
process.exit(problemy.length ? 1 : 0)
