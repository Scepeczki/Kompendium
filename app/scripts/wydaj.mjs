// Wydaje nową wersję programu Kompendium na Windows.
//
//   node scripts/wydaj.mjs            → następna wersja (1.0.3 → 1.0.4)
//   node scripts/wydaj.mjs 1.2.0      → konkretna wersja
//   node scripts/wydaj.mjs --bez-wysylki  → tylko zbuduj instalator
//
// Co robi:
// 1. podbija numer wersji (src-tauri/tauri.conf.json i Cargo.toml),
// 2. buduje instalator i podpisuje go kluczem z C:\Users\<ty>\.tauri\kompendium.key
//    (klucz NIE leży w repozytorium; bez niego zainstalowane programy nie
//    przyjmą aktualizacji — trzymaj jego kopię w bezpiecznym miejscu),
// 3. zakłada wydanie w zakładce Releases repozytorium Scepeczki/Kompendium:
//    instalator + latest.json, z którego zainstalowane programy biorą
//    informację o nowej wersji (potrzebny zalogowany `gh`).
//
// Na GitHub idzie tylko program. Notatki nigdy tą drogą nie chodzą.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tu = dirname(fileURLToPath(import.meta.url))
const APP = resolve(tu, '..')
const TAURI = resolve(APP, 'src-tauri')
const REPO = 'Scepeczki/Kompendium'
const KLUCZ = resolve(homedir(), '.tauri', 'kompendium.key')
const GH = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh'

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

// --- 3. wydanie w Releases ---
krok('Zakładam wydanie w zakładce Releases')
const latest = resolve(NSIS, 'latest.json')
writeFileSync(
  latest,
  JSON.stringify(
    {
      version: wersja,
      notes: `Kompendium ${wersja}`,
      pub_date: new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature: readFileSync(resolve(NSIS, exe + '.sig'), 'utf8').trim(),
          url: `https://github.com/${REPO}/releases/download/v${wersja}/${exe}`,
        },
      },
    },
    null,
    2,
  ),
)
const opis = resolve(NSIS, 'opis-wydania.md')
writeFileSync(
  opis,
  `Kompendium na Windows. Pobierz plik **${exe}** poniżej i uruchom.\n\n` +
    'Gdy Windows pokaże „System Windows ochronił ten komputer”: Więcej informacji → Uruchom mimo to.\n\n' +
    'Kolejne wersje program pobiera sam. Notatek tu nie ma — tylko program.\n',
)
execFileSync(
  GH,
  ['release', 'create', `v${wersja}`, resolve(NSIS, exe), latest, '-R', REPO, '--title', `Kompendium ${wersja}`, '--notes-file', opis, '--latest'],
  { stdio: 'inherit' },
)
console.log(`\n✓ Wersja ${wersja} wydana: https://github.com/${REPO}/releases/latest`)
console.log('Pamiętaj zapisać zmianę numeru wersji w repozytorium (git commit).')
