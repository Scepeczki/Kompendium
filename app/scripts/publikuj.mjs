// Wysyła Kompendium na stronę, z której bierze je telefon.
//
// Kod projektu siedzi w repozytorium PRYWATNYM, a GitHub Pages na darmowym
// planie potrafi podawać strony tylko z publicznych. Dlatego zbudowana
// aplikacja jedzie do osobnego, publicznego repozytorium — jest w nim sam
// program, bez ani jednej notatki. Notatki nigdy tą drogą nie chodzą.
//
//   node scripts/publikuj.mjs
//
// Za pierwszym razem trzeba raz zalogować gita do GitHuba — skrypt powie, co
// zrobić, jeśli logowania brakuje.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tu = dirname(fileURLToPath(import.meta.url))
const APP = resolve(tu, '..')
const ZBUDOWANE = resolve(APP, 'dist-web')
/** Katalog roboczy publicznego repozytorium — obok projektu, nie w środku. */
const STRONA = resolve(APP, '../../Kompendium-web')
const REPO = 'https://github.com/Scepeczki/Kompendium-web.git'

const git = (args, cwd = STRONA) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const krok = (s) => console.log(`\n=== ${s}`)

krok('Buduję wersję na internet')
execFileSync('npm', ['run', 'build:web'], { cwd: APP, stdio: 'inherit', shell: true })
if (!existsSync(resolve(ZBUDOWANE, 'index.html'))) {
  console.error('Budowanie nie dało index.html — przerywam, żeby nie wysłać śmieci.')
  process.exit(1)
}

krok('Przygotowuję katalog strony')
if (!existsSync(resolve(STRONA, '.git'))) {
  mkdirSync(STRONA, { recursive: true })
  git(['init', '-b', 'main'])
  git(['remote', 'add', 'origin', REPO])
  console.log(`nowy katalog: ${STRONA}`)
}

// Czyścimy stare pliki strony (ale nie .git!) — inaczej zostawałyby po sobie
// nieużywane paczki z poprzednich wersji i strona rosłaby bez końca.
for (const wpis of readdirSync(STRONA)) {
  if (wpis === '.git') continue
  rmSync(resolve(STRONA, wpis), { recursive: true, force: true })
}
cpSync(ZBUDOWANE, STRONA, { recursive: true })
// GitHub Pages inaczej pomija katalogi zaczynające się od podkreślenia
writeFileSync(resolve(STRONA, '.nojekyll'), '')

krok('Zapisuję i wysyłam')
// Po resecie komputera katalog strony powstaje od nowa, bez historii
// z GitHuba — wtedy GitHub odrzuca wysyłkę. Dociągamy jego historię i nowa
// wersja staje na jej końcu (pliki strony i tak są w całości podmieniane).
try {
  git(['fetch', '-q', 'origin', 'main'])
  git(['reset', '-q', '--soft', 'origin/main'])
} catch {
  // pierwsza wysyłka w ogóle — na GitHubie jeszcze nic nie ma
}
git(['add', '-A'])
try {
  git(['commit', '-q', '-m', `Kompendium ${new Date().toISOString().slice(0, 16)}`])
} catch {
  console.log('nic się nie zmieniło od ostatniego razu')
}
try {
  git(['push', '-u', 'origin', 'main'])
  console.log('\n✓ Wysłane. Strona odświeży się w ciągu minuty:')
  console.log('  https://scepeczki.github.io/Kompendium-web/')
} catch (e) {
  const tekst = String(e.stderr ?? e.message)
  console.error('\n✗ Wysyłka się nie udała:\n' + tekst.trim())
  if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(tekst)) {
    console.error(
      '\nWygląda na brak logowania do GitHuba na tym komputerze.\n' +
        'Otwórz zwykły wiersz poleceń (nie przez Claude) i wykonaj:\n' +
        `  cd "${STRONA}"\n` +
        '  git push -u origin main\n' +
        'Wyskoczy okno logowania GitHuba — po nim ten skrypt zadziała już sam.',
    )
  }
  process.exit(1)
}
