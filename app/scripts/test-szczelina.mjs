// Kreska „tu wyląduje kafelek" ma pokazywać JEDNO miejsce.
// Ta sama szczelina między dwoma kafelkami, najechana od dołu i od góry,
// musi rysować kreskę dokładnie w tym samym punkcie — wcześniej różniły się
// o kilka pikseli i wyglądało to na dwa różne miejsca wstawienia.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc ${n}, kilka slow zeby kafelek mial wysokosc.`)
  await page.waitForTimeout(300)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

await nowaSciezka(page, 'Szczeliny')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(400)
}
await page.waitForTimeout(600)

/** Udaje przeciąganie nad zadanym punktem segmentu i zwraca położenie
 *  narysowanej kreski (albo null, gdy żadnej nie ma). `gdzie` to ułamek
 *  wysokości segmentu: 0,25 = górna połowa, 0,75 = dolna. */
const kreskaNad = async (nr, gdzie) =>
  page.evaluate(
    ({ nr, gdzie }) => {
      const segs = [...document.querySelectorAll('.linear-seg')]
      const el = segs[nr]
      const r = el.getBoundingClientRect()
      const dt = new DataTransfer()
      dt.setData('text/x-komp-seg', 'udawany')
      el.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height * gdzie,
          dataTransfer: dt,
        }),
      )
      return new Promise((res) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const wszystkie = [...document.querySelectorAll('.linear-seg')]
            const przed = document.querySelector('.linear-seg.drop-before')
            const po = document.querySelector('.linear-seg.drop-after')
            // Sama krawędź nie wystarczy: dół kafelka i góra następnego leżą
            // w tym samym punkcie, a kreska i tak rysowała się raz nad nim,
            // raz pod nim. Bierzemy więc opis szczeliny: przy którym kafelku
            // i z której strony.
            if (przed) {
              res({ przy: wszystkie.indexOf(przed), strona: 'nad', y: Math.round(przed.getBoundingClientRect().top) })
            } else if (po) {
              res({ przy: wszystkie.indexOf(po), strona: 'pod', y: Math.round(po.getBoundingClientRect().bottom) })
            } else res(null)
          }),
        ),
      )
    },
    { nr, gdzie },
  )

// szczelina między kafelkiem 0 a 1: raz od dołu pierwszego, raz od góry drugiego
const odDolu = await kreskaNad(0, 0.75)
const odGory = await kreskaNad(1, 0.25)
check('kreska pojawia się przy przeciąganiu', odDolu !== null && odGory !== null,
  `${JSON.stringify(odDolu)} / ${JSON.stringify(odGory)}`)
check(
  'ta sama szczelina to jedno miejsce, nie dwa',
  odDolu &&
    odGory &&
    odDolu.przy === odGory.przy &&
    odDolu.strona === odGory.strona &&
    odDolu.y === odGory.y,
  `od dołu: ${JSON.stringify(odDolu)}, od góry: ${JSON.stringify(odGory)}`,
)

// dwie różne szczeliny nadal muszą być różnymi miejscami
const nizej = await kreskaNad(1, 0.75)
check('sąsiednia szczelina jest jednak gdzie indziej', nizej && nizej.y !== odGory.y,
  `y=${nizej?.y} wobec ${odGory?.y}`)

// nigdy dwie kreski naraz
const ileNaraz = await page.evaluate(
  () => document.querySelectorAll('.linear-seg.drop-before, .linear-seg.drop-after').length,
)
check('nigdy dwie kreski naraz', ileNaraz === 1, `kresek: ${ileNaraz}`)

// szczelina na samym końcu — pod ostatnim kafelkiem
const naKoncu = await kreskaNad(2, 0.75)
const ostatni = await page.evaluate(() => {
  const segs = [...document.querySelectorAll('.linear-seg')]
  return Math.round(segs[segs.length - 1].getBoundingClientRect().bottom)
})
check('ostatnia szczelina siada pod ostatnim kafelkiem', naKoncu && naKoncu.y === ostatni,
  `y=${naKoncu?.y}, dół ostatniego=${ostatni}`)

// przeciągnięcie naprawdę wstawia tam, gdzie kreska.
// Celujemy wyraźnie w górną część kafelka — środek to granica między
// szczeliną nad nim a pod nim, a na granicy wynik zależy od zaokrąglenia.
await page.dragAndDrop('.linear-seg:nth-child(3) .linear-grip', '.linear-seg:nth-child(1)', {
  targetPosition: { x: 200, y: 4 },
})
await page.waitForTimeout(700)
const kolejnosc = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg .script-block-title .inline-title')].map(
    (i) => i.value,
  ),
)
check('przeciągnięcie na górę stawia kafelek na górze', kolejnosc[0] === 'Gamma',
  kolejnosc.join(' | '))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
