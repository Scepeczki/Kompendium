// Kursywa: oba kroje programu (Figtree — interfejs, Source Serif — treść) mają
// prawdziwą odmianę pochyłą. Bez niej, przy font-synthesis: none, tekst
// pochyły wyglądał dokładnie jak zwykły.
import { chromium } from 'playwright'

const problems = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}
const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage()
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const wynik = await page.evaluate(async () => {
  const out = {}
  for (const krój of ['Source Serif 4 Variable', 'Figtree Variable']) {
    await document.fonts.load(`italic 16px "${krój}"`, 'Zażółć')
    const sciany = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === krój && f.style === 'italic' && f.status === 'loaded')
    // ten sam tekst prosto i pochyło — prawdziwa kursywa ma inne szerokości liter
    const zmierz = (styl) => {
      const s = document.createElement('span')
      s.style.cssText = `font-family:"${krój}";font-size:40px;font-style:${styl};position:absolute;white-space:nowrap`
      s.textContent = 'Zażółć gęślą jaźń — kursywa'
      document.body.appendChild(s)
      const w = s.getBoundingClientRect().width
      s.remove()
      return w
    }
    out[krój] = { pochyle: sciany.length, prosto: zmierz('normal'), kursywa: zmierz('italic') }
  }
  return out
})
for (const [krój, w] of Object.entries(wynik)) {
  check(`${krój}: odmiana pochyła wczytana`, w.pochyle > 0, `${w.pochyle} plików`)
  check(`${krój}: kursywa wygląda inaczej niż zwykły tekst`, Math.abs(w.prosto - w.kursywa) > 2, `${Math.round(w.prosto)} px / ${Math.round(w.kursywa)} px`)
}
await browser.close()
if (problems.length) {
  console.log(`\n>>> BŁĘDY: ${problems.length}`)
  process.exit(1)
}
console.log('\n>>> Wszystko OK')
