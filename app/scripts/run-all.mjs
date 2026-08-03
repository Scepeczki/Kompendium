/** Uruchamia wszystkie testy po kolei i podsumowuje.
 *
 *  Liczy się kod wyjścia, nie sama treść wypisana na ekran: test, który
 *  wywalił się na timeoucie, nie zdąży napisać „NIEPOPRAWNE", a i tak jest
 *  porażką. Wcześniejsza pętla w PowerShellu patrzyła tylko na tekst
 *  i przez to milczała o zepsutych testach. */

import { spawnSync } from 'node:child_process'
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'

const dir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const logi = `${dir}../.test-logs`
mkdirSync(logi, { recursive: true })

const pliki = readdirSync(dir)
  .filter((f) => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort()

const tylko = process.argv.slice(2)
const doUruchomienia = tylko.length
  ? pliki.filter((f) => tylko.some((t) => f.includes(t)))
  : pliki

const zle = []
for (const f of doUruchomienia) {
  const r = spawnSync(process.execPath, [`${dir}${f}`], {
    encoding: 'utf8',
    cwd: `${dir}..`,
  })
  const wyjscie = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const zawiodl = r.status !== 0 || /NIEPOPRAWNE|✗ BŁĄD|BRAK!|BEZ ZMIANY|ZEPSUT/.test(wyjscie)
  console.log(`${zawiodl ? '✗' : '✓'} ${f}${r.status !== 0 ? ` (kod ${r.status})` : ''}`)
  if (zawiodl) {
    zle.push(f)
    writeFileSync(`${logi}/${f}.log`, wyjscie)
  }
}

console.log('')
console.log(
  zle.length === 0
    ? `>>> WSZYSTKIE ${doUruchomienia.length} TESTY PRZECHODZĄ`
    : `>>> ZEPSUTE (${zle.length}/${doUruchomienia.length}): ${zle.join(', ')}\n    logi w app/.test-logs/`,
)
process.exit(zle.length === 0 ? 0 : 1)
