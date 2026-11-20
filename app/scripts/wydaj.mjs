// Wydaje nową wersję programu Kompendium na Windows.
//
//   node scripts/wydaj.mjs            → następna wersja (0.1.3 → 0.1.4)
//   node scripts/wydaj.mjs 0.2.0      → konkretna wersja
//   node scripts/wydaj.mjs --bez-wysylki  → tylko zbuduj instalator
//
// Co robi:
// 1. podbija numer wersji (src-tauri/tauri.conf.json i Cargo.toml),
// 2. buduje instalator i podpisuje go kluczem z C:\Users\<ty>\.tauri\kompendium.key
//    (klucz NIE leży w repozytorium; bez niego zainstalowane programy nie
//    przyjmą aktualizacji — trzymaj jego kopię w bezpiecznym miejscu),
// 3. kładzie instalator, latest.json i stronę pobierania do katalogu publicznej
//    strony (Kompendium-web/pobierz) i wysyła stronę skryptem publikuj.mjs.
//
// Na GitHub idzie tylko program. Notatki nigdy tą drogą nie chodzą.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tu = dirname(fileURLToPath(import.meta.url))
const APP = resolve(tu, '..')
const TAURI = resolve(APP, 'src-tauri')
const STRONA = resolve(APP, '../../Kompendium-web')
const POBIERZ = resolve(STRONA, 'pobierz')
const ADRES = 'https://scepeczki.github.io/Kompendium-web/pobierz'
const KLUCZ = resolve(homedir(), '.tauri', 'kompendium.key')

const krok = (s) => console.log(`\n=== ${s}`)
const args = process.argv.slice(2)
const bezWysylki = args.includes('--bez-wysylki')

if (!existsSync(KLUCZ)) {
  console.error(`Brak klucza do podpisu: ${KLUCZ}\nBez niego aktualizacje nie zadziałają — przerywam.`)
  process.exit(1)
}

// --- 1. wersja ---
const plikConf = resolve(TAURI, 'tauri.conf.json')
const conf = JSON.parse(readFileSync(plikConf, 'utf8'))
const [a, b, c] = conf.version.split('.').map(Number)
const wersja = args.find((x) => /^\d+\.\d+\.\d+$/.test(x)) ?? `${a}.${b}.${c + 1}`
krok(`Wersja ${conf.version} → ${wersja}`)
conf.version = wersja
writeFileSync(plikConf, JSON.stringify(conf, null, 2) + '\n')
const plikCargo = resolve(TAURI, 'Cargo.toml')
writeFileSync(plikCargo, readFileSync(plikCargo, 'utf8').replace(/^version = ".*"$/m, `version = "${wersja}"`))

// --- 2. budowanie ---
krok('Buduję instalator (pierwszy raz trwa kilka minut)')
execFileSync('npx', ['tauri', 'build'], {
  cwd: APP,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: KLUCZ, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' },
})
const NSIS = resolve(TAURI, 'target/release/bundle/nsis')
const exe = `Kompendium_${wersja}_x64-setup.exe`
if (!existsSync(resolve(NSIS, exe)) || !existsSync(resolve(NSIS, exe + '.sig'))) {
  console.error(`Nie ma ${exe} albo jego podpisu w ${NSIS} — przerywam.`)
  process.exit(1)
}
console.log(`instalator: ${resolve(NSIS, exe)}`)
if (bezWysylki) process.exit(0)

// --- 3. strona pobierania ---
krok('Kładę instalator na stronę')
if (!existsSync(resolve(STRONA, '.git'))) {
  console.error(`Brak katalogu strony ${STRONA} — najpierw raz: node scripts/publikuj.mjs`)
  process.exit(1)
}
mkdirSync(POBIERZ, { recursive: true })
// Na stronie zostaje tylko bieżący instalator (starsze są w historii GitHuba).
for (const f of readdirSync(POBIERZ)) {
  if (/^Kompendium_.*-setup\.exe$/.test(f) && f !== exe) rmSync(resolve(POBIERZ, f))
}
copyFileSync(resolve(NSIS, exe), resolve(POBIERZ, exe))
const podpis = readFileSync(resolve(NSIS, exe + '.sig'), 'utf8').trim()
const teraz = new Date().toISOString()
writeFileSync(
  resolve(POBIERZ, 'latest.json'),
  JSON.stringify(
    {
      version: wersja,
      notes: `Kompendium ${wersja}`,
      pub_date: teraz,
      platforms: { 'windows-x86_64': { signature: podpis, url: `${ADRES}/${exe}` } },
    },
    null,
    2,
  ),
)
writeFileSync(
  resolve(POBIERZ, 'index.html'),
  `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pobierz Kompendium</title>
<link rel="icon" href="../favicon.svg">
<style>
  :root { --tlo: #f6f3ec; --tekst: #2b2925; --szary: #6d675e; --akcent: #3d6b4f; }
  @media (prefers-color-scheme: dark) { :root { --tlo: #1d1c1a; --tekst: #ece8e0; --szary: #a39d93; --akcent: #7fb894; } }
  body { margin: 0; background: var(--tlo); color: var(--tekst); font: 16px/1.55 system-ui, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 56px 16px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .w { color: var(--szary); margin: 0 0 28px; }
  a.pobierz { display: inline-block; background: var(--akcent); color: #fff; text-decoration: none;
    padding: 12px 22px; border-radius: 8px; font-weight: 600; }
  ol { padding-left: 20px; color: var(--szary); }
  li { margin: 6px 0; }
</style>
</head>
<body>
<main>
  <h1>Kompendium na Windows</h1>
  <p class="w">Wersja ${wersja} · ${teraz.slice(0, 10)}</p>
  <p><a class="pobierz" href="${exe}">Pobierz instalator</a></p>
  <ol>
    <li>Uruchom pobrany plik. Jeśli Windows pokaże „System Windows ochronił ten komputer”, kliknij „Więcej informacji” → „Uruchom mimo to” (program nie ma płatnego certyfikatu).</li>
    <li>Notatki przenosisz kopią zapasową: Ustawienia → Dane → Wczytaj kopię.</li>
    <li>Kolejne wersje program pobierze sam.</li>
  </ol>
</main>
</body>
</html>
`,
)

// --- 4. wysyłka (razem ze stroną) ---
krok('Wysyłam stronę z instalatorem')
execFileSync('node', [resolve(tu, 'publikuj.mjs')], { cwd: APP, stdio: 'inherit' })
console.log(`\n✓ Wersja ${wersja} wydana: ${ADRES}/`)

// --- 5. wydanie w zakładce „Releases" na GitHubie (potrzebny zalogowany `gh`) ---
krok('Zakładam wydanie w zakładce Releases')
const GH = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh'
const opis = resolve(TAURI, 'target', 'opis-wydania.md')
writeFileSync(
  opis,
  `Kompendium na Windows. Pobierz plik **${exe}** poniżej i uruchom.\n\n` +
    'Gdy Windows pokaże „System Windows ochronił ten komputer”: Więcej informacji → Uruchom mimo to.\n\n' +
    'Kolejne wersje program pobiera sam. Notatek tu nie ma — tylko program.\n',
)
try {
  execFileSync(
    GH,
    ['release', 'create', `v${wersja}`, resolve(NSIS, exe), '-R', 'Scepeczki/Kompendium-web', '--title', `Kompendium ${wersja}`, '--notes-file', opis],
    { stdio: 'inherit' },
  )
} catch {
  console.error('Wydanie w Releases się nie udało (czy `gh auth login` zrobione?). Instalator i tak jest na stronie pobierania.')
}
console.log('Pamiętaj zapisać zmianę numeru wersji w repozytorium (git commit).')
