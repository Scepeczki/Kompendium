// Pomiar płynności widoku Linia przy długim skrypcie (domyślnie 25 kafelków,
// można podać więcej argumentem). Pisanie, przewijanie i przeciąganie nie mogą
// kleić ścieżki — a zapis treści nie może przerysowywać wszystkich kafelków.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const ILE = Number(process.argv[2] ?? 25)
for (let i = 1; i <= ILE; i++) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', `Klocek ${i}`)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  // treść jak w prawdziwym skrypcie: kilka zdań i wzory, nie jedna linijka
  await page.keyboard.type(
    `Tresc klocka ${i}. Niech $(a_n)$ bedzie ciagiem o wyrazach $a_n = ${i}/n$. ` +
      `Wowczas $\\lim_{n \\to \\infty} a_n = 0$, co wynika z definicji granicy: ` +
      `dla kazdego $\\varepsilon > 0$ istnieje $N$ takie, ze $|a_n| < \\varepsilon$ dla $n > N$.`,
  )
  await page.waitForTimeout(80)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await nowaSciezka(page, 'Duza')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (let i = 1; i <= ILE; i++) {
  await page.dragAndDrop(`.concept-item:has-text("Klocek ${i}")`, '.linear-append')
  await page.waitForTimeout(120)
}
await page.waitForTimeout(1200)

/** Ile pól żyje naraz — sedno sprawy przy długiej ścieżce. Pola są od razu,
 *  bez klikania, ale tylko tam, gdzie widać: ich liczba nie może rosnąć razem
 *  z długością ścieżki. */
const edytory = await page.locator('.linear-pole .tiptap').count()
check('pola są od razu, bez klikania', edytory > 0,
  `żywych pól: ${edytory} przy ${ILE} kafelkach`)
check('pól tyle, co widać, a nie tyle, co kafelków', edytory <= 30,
  `żywych pól: ${edytory} przy ${ILE} kafelkach`)

/** Mierzy czas klatek w trakcie działania. */
const mierz = async (nazwa, akcja) => {
  await page.evaluate(() => {
    window.__klatki = []
    let ost = performance.now()
    const tik = (t) => {
      window.__klatki.push(t - ost)
      ost = t
      window.__raf = requestAnimationFrame(tik)
    }
    window.__raf = requestAnimationFrame(tik)
  })
  await akcja()
  const czasy = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    return window.__klatki.slice(1)
  })
  const posort = [...czasy].sort((a, b) => a - b)
  const mediana = posort[Math.floor(posort.length / 2)] ?? 0
  const zle = czasy.filter((t) => t > 50).length
  console.log(
    `   ${nazwa}: mediana ${mediana.toFixed(1)} ms/klatkę, ` +
      `najgorsza ${Math.max(...czasy, 0).toFixed(1)} ms, klatek > 50 ms: ${zle} (z ${czasy.length})`,
  )
  return { mediana, zle }
}

// 1. pisanie w kafelku
await page.click('.linear-seg .markdown-body')
await page.waitForSelector('.linear-pole .tiptap')
const pisanie = await mierz('pisanie w kafelku', async () => {
  await page.keyboard.press('End')
  await page.keyboard.type(' Dopisuje dluzsze zdanie, zeby zmierzyc plynnosc pisania.', {
    delay: 25,
  })
})
check('pisanie płynne (mediana poniżej 25 ms/klatkę)', pisanie.mediana < 25,
  `${pisanie.mediana.toFixed(1)} ms`)
check('bez zacięć powyżej 50 ms przy pisaniu', pisanie.zle <= 2, `zacięć: ${pisanie.zle}`)

// 1b. przewijanie długiej ścieżki — tu edytory wchodzą i schodzą z ekranu
const przewijanie = await mierz('przewijanie ścieżki', async () => {
  await page.mouse.move(800, 500)
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(400)
})
check('przewijanie płynne (mediana poniżej 25 ms/klatkę)', przewijanie.mediana < 25,
  `${przewijanie.mediana.toFixed(1)} ms`)
check('bez zacięć powyżej 50 ms przy przewijaniu', przewijanie.zle <= 4,
  `zacięć: ${przewijanie.zle}`)

// 1c. porównanie: ten sam skrypt w Skrypcie (bez edytorów w ogóle)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body .script-block')
await page.waitForTimeout(1200)
await mierz('przewijanie Skryptu (bez edytorów)', async () => {
  await page.mouse.move(800, 500)
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(400)
})
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(1200)

// 2. przeciąganie segmentu
const uchwyt = await page.locator('.linear-seg .linear-grip').nth(3).boundingBox()
const cel = await page.locator('.linear-seg').first().boundingBox()
const ciagniecie = await mierz('przeciąganie segmentu', async () => {
  await page.mouse.move(uchwyt.x + 5, uchwyt.y + 5)
  await page.mouse.down()
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(
      uchwyt.x + 5,
      uchwyt.y + 5 - ((uchwyt.y - cel.y) * i) / 20,
      { steps: 2 },
    )
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
})
check('przeciąganie płynne (mediana poniżej 25 ms/klatkę)', ciagniecie.mediana < 25,
  `${ciagniecie.mediana.toFixed(1)} ms`)
check('bez zacięć powyżej 50 ms przy przeciąganiu', ciagniecie.zle <= 1,
  `zacięć: ${ciagniecie.zle}`)

console.log('')
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
