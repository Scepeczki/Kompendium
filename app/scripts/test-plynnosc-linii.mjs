// Płynność Linii — test surowy (z uwag projektanta):
// - długa ścieżka (domyślnie 2000 kafelków; KOMP_N=20000 dla dłuższej) ze
//   wzorami i kafelkami z kilkoma stronami,
// - procesor spowolniony 6× (CDP), skalowanie ekranu 100% i 125%,
// - w KAŻDEJ klatce przez 3 s po wejściu: położenie punktu stałego względem
//   miejsca, gdzie ma być (warunek: najwyżej 1 px), zmiany bieżącego
//   rozdziału w spisie (warunek: zero), puste miejsca na ekranie (zero),
// - czas wejścia (od kliknięcia ścieżki do pierwszej klatki z kafelkiem na
//   swoim miejscu),
// - przełączenie wyższej strony w kafelku: kafelek stoi w miejscu, pod nim
//   ani jednej klatki z pustym miejscem.
import { chromium } from 'playwright'

const N = Number(process.env.KOMP_N ?? 2000)
const problems = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})

async function przebieg(skala) {
  console.log(`\n=== skalowanie ${Math.round(skala * 100)}%, ${N} kafelków ===`)
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: skala })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('http://localhost:5173')
  await page.waitForSelector('text=Kompendium')
  await page.evaluate(async (N) => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const T = db.transaction(['concepts', 'versions', 'paths', 'subpages'], 'readwrite')
    const now = new Date().toISOString()
    const nodes = []
    for (let k = 0; k < N; k++) {
      if (k % 6 === 0) nodes.push({ id: `h${k}`, kind: 'heading', text: `Rozdział ${k / 6}`, level: 1, x: 0, y: 0 })
      const id = `c${k}`
      const akapity = 1 + (k % 5)
      let tresc = Array.from({ length: akapity }, (_, j) => `Akapit ${j} kafelka ${k}: tekst do czytania, trochę dłuższy, żeby zawijał się w kolumnie.`).join('\n\n')
      if (k % 3 === 0) tresc += `\n\n$$\\int_0^1 x^{${k % 9}}\\,dx = \\frac{1}{${(k % 9) + 1}}$$`
      T.objectStore('concepts').put({ id, name: `Kafelek ${k}`, type: 'definicja', pathId: 'pp', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
      T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: tresc, sourceRefs: [], createdAt: now, updatedAt: now })
      if (k % 7 === 0) {
        const dluga = Array.from({ length: 14 }, (_, j) => `Linijka ${j} dłuższej strony kafelka ${k}.`).join('\n\n')
        T.objectStore('subpages').put({ id: 's' + id, conceptId: id, versionId: 'v' + id, name: 'Dowód', content: dluga, order: 1, createdAt: now, updatedAt: now })
      }
      nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: 0 })
    }
    const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: nodes[i].id, to: n.id }))
    T.objectStore('paths').put({ id: 'pp', name: 'Płynność', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
    T.objectStore('paths').put({ id: 'pq', name: 'Pusta obok', folderId: null, order: 1, nodes: [], edges: [], createdAt: now, updatedAt: now })
    await new Promise((r) => (T.oncomplete = r))
    localStorage.setItem('ui.outline', '1')
    localStorage.setItem('ui.outlineRodzaj', 'szczegolowy')
    localStorage.setItem('ui.pathMode', 'script')
  }, N)
  await page.reload()
  await page.waitForSelector('text=Kompendium')
  await page.click('.path-item:has-text("Płynność")')
  await page.click('.view-switch button:has-text("Linia")')
  await page.waitForSelector('[data-seg="nc0"]', { timeout: 60000 })
  await page.waitForTimeout(800)

  // przewijamy daleko — kółkiem, jak człowiek
  await page.mouse.move(800, 500)
  for (let i = 0; i < (process.env.KOMP_KONIEC ? 60 : Math.min(60, Math.floor(N / 10))); i++) await page.mouse.wheel(0, 900)
  await page.waitForTimeout(1500)

  // wyjście i powrót — pod lupą, w każdej klatce, z procesorem spowolnionym 6×
  await page.click('.path-item:has-text("Pusta obok")')
  await page.waitForTimeout(600)
  // punkt odniesienia: to, co zapisało się przy wyjściu ze ścieżki
  const zapis = await page.evaluate(() => JSON.parse(localStorage.getItem('ui.miejsceWSciezce.pp') ?? 'null'))
  check('miejsce zapisane (kafelek + linia czytania)', !!zapis?.seg && zapis.w === 2, JSON.stringify(zapis))
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.KOMP_CPU ?? 6) })
  await page.evaluate((zapis) => {
    const w = (window.__pomiar = { klatki: [], pusteKlatki: [], start: performance.now(), pierwsza: null, aktywne: [], puste: 0 })
    // puste miejsce (kafelek nienarysowany) na ekranie
    const pusta = (widok) => {
      const r = widok.getBoundingClientRect()
      for (const x of widok.querySelectorAll('.linear-seg[data-pelny="0"]')) {
        const q = x.getBoundingClientRect()
        if (q.bottom > r.top && q.top < r.bottom) return true
      }
      return false
    }
    let ostatniAktywny = null
    const krok = () => {
      const t = performance.now() - w.start
      const widok = document.querySelector('.linear-view')
      const seg = widok?.querySelector(`.linear-seg[data-seg="${zapis.seg}"]`)
      if (widok && seg) {
        const r = widok.getBoundingClientRect()
        const chce = r.top + Math.min(120, r.height / 3) - zapis.dy
        const odch = seg.getBoundingClientRect().top - chce
        if (w.pierwsza === null) {
          w.pierwsza = t
          // to, co naprawdę narysowane: odczyt po poprawce Linii w tej samej klatce
          const ro = new ResizeObserver(() => {
            const s2 = widok.querySelector(`.linear-seg[data-seg="${zapis.seg}"]`)
            if (!s2 || !w.klatki.length) return
            const r2 = widok.getBoundingClientRect()
            w.klatki[w.klatki.length - 1] = s2.getBoundingClientRect().top - (r2.top + Math.min(120, r2.height / 3) - zapis.dy)
            w.pusteKlatki[w.pusteKlatki.length - 1] = pusta(widok)
          })
          for (const x of widok.querySelectorAll('.linear-seg')) ro.observe(x)
          w.ro = ro
        }
        w.klatki.push(odch)
        w.pusteKlatki.push(pusta(widok))
        const a = document.querySelector('.outline-item.active')?.textContent ?? null
        if (a !== ostatniAktywny) {
          w.aktywne.push(a)
          ostatniAktywny = a
        }
      }
      if (t < 3000 + (w.pierwsza ?? 0)) requestAnimationFrame(krok)
      else {
        w.ro?.disconnect()
        w.puste = w.pusteKlatki.filter(Boolean).length
        w.koniec = true
      }
    }
    requestAnimationFrame(krok)
  }, zapis)
  await page.click('.path-item:has-text("Płynność")')
  await page.waitForFunction(() => window.__pomiar.koniec, null, { timeout: 120000 })
  const p = await page.evaluate(() => window.__pomiar)
  const maks = Math.max(...p.klatki.map(Math.abs))
  if (process.env.DBG) console.log('  klatki:', p.klatki.map((x) => Math.round(x)).join(' '))
  console.log(`  czas wejścia (spowolnienie ${process.env.KOMP_CPU ?? 6}×): ${Math.round(p.pierwsza)} ms, klatek pod lupą: ${p.klatki.length}`)
  check('powrót: punkt stały w każdej klatce najwyżej 1 px od miejsca', maks <= 1, `największe odchylenie ${maks.toFixed(2)} px`)
  check('powrót: spis nie przełącza rozdziału w czasie wejścia', p.aktywne.length <= 1, JSON.stringify(p.aktywne))
  {
    // rozdział, w którym jest linia czytania — z zapasem 40 px (histereza spisu)
    const { akt, mozliwe } = await page.evaluate(() => {
      const widok = document.querySelector('.linear-view')
      const r = widok.getBoundingClientRect()
      const linia = r.top + Math.min(120, r.height / 3)
      const naglowki = [...widok.querySelectorAll('.linear-seg[data-seg^="h"]')]
      // nazwa z identyfikatora (h{k} = Rozdział k/6) — tekst nagłówka siedzi w polu do wpisywania
      const ostatniNad = (y) => { const h = naglowki.filter((x) => x.getBoundingClientRect().top <= y).pop(); return h ? 'Rozdział ' + Number(h.dataset.seg.slice(1)) / 6 : '' }
      return { akt: document.querySelector('.outline-item.active')?.textContent?.trim() ?? '', mozliwe: [ostatniNad(linia - 40), ostatniNad(linia + 40)] }
    })
    check('spis podświetla rozdział, w którym jest linia czytania', !!akt && mozliwe.includes(akt), `${akt} (możliwe: ${mozliwe.join(' / ')})`)
  }
  check('powrót: na ekranie ani jednej klatki z pustym miejscem', p.puste === 0, `${p.puste} klatek`)

  // zmiana strony na wyższą: kafelek stoi, pod nim nic nie znika
  // najbliższy narysowany kafelek z kilkoma stronami — kółkiem w górną część ekranu
  const szukaj = () => page.evaluate(() => {
    const widok = document.querySelector('.linear-view')
    const r = widok.getBoundingClientRect()
    // zakładka musi być w widocznej części Linii (nie pod górnym paskiem)
    const segi = [...widok.querySelectorAll('.linear-seg[data-pelny="1"]')].filter((x) => x.querySelectorAll('.block-page').length > 1 && x.querySelector('.block-page').getBoundingClientRect().top > r.top + 10)
    segi.sort((a, b) => Math.abs(a.getBoundingClientRect().top - r.top) - Math.abs(b.getBoundingClientRect().top - r.top))
    const s = segi[0]
    return s ? { seg: s.dataset.seg, d: Math.round(s.getBoundingClientRect().top - (r.top + 120)) } : null
  })
  // strony kafelków wczytują się z bazy osobno — czekamy bez spowolnienia
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await page.waitForFunction(() => [...document.querySelectorAll('.linear-seg[data-pelny="1"]')].some((x) => x.querySelectorAll('.block-page').length > 1), null, { timeout: 30000 }).catch(() => {})
  let zn = await szukaj()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.KOMP_CPU ?? 6) })
  if (zn && Math.abs(zn.d) > 2) {
    const st0 = await page.evaluate(() => document.querySelector('.linear-view').scrollTop)
    await page.mouse.move(800, 500)
    await page.mouse.wheel(0, zn.d)
    // aż przewijanie stanie (na spowolnionym komputerze to trwa)
    for (let i = 0, ost = -1; i < 40; i++) {
      await page.waitForTimeout(300)
      const st = await page.evaluate(() => document.querySelector('.linear-view').scrollTop)
      if (st === ost) break
      ost = st
    }
      if (process.env.DBG) console.log('  kółko:', JSON.stringify(zn), st0, '->', await page.evaluate(() => document.querySelector('.linear-view').scrollTop), JSON.stringify(await page.evaluate(() => window.__punktStaly?.())))
    zn = await szukaj()
  }
  const zak = zn?.seg ?? null
  check('na ekranie jest kafelek z kilkoma stronami', !!zak)
  if (zak) {
    await page.evaluate((zak) => {
      const w = (window.__strona = { klatki: [], puste: 0, start: performance.now() })
      const widok = document.querySelector('.linear-view')
      const seg = () => widok.querySelector(`.linear-seg[data-seg="${zak}"]`)
      const przed = seg().getBoundingClientRect().top
      const ro = new ResizeObserver(() => {
        const s = seg()
        if (s && w.klatki.length) w.klatki[w.klatki.length - 1] = s.getBoundingClientRect().top - przed
      })
      for (const x of widok.querySelectorAll('.linear-seg')) ro.observe(x)
      const krok = () => {
        const r = widok.getBoundingClientRect()
        const s = seg()
        if (s) w.klatki.push(s.getBoundingClientRect().top - przed)
        for (const x of widok.querySelectorAll('.linear-seg[data-pelny="0"]')) {
          const q = x.getBoundingClientRect()
          if (q.bottom > r.top && q.top < r.bottom) {
            w.puste++
            break
          }
        }
        if (performance.now() - w.start < 1500) requestAnimationFrame(krok)
        else {
          ro.disconnect()
          w.koniec = true
        }
      }
      requestAnimationFrame(krok)
    }, zak)
    if (process.env.DBG) console.log('  przed klikiem:', JSON.stringify(await page.evaluate(() => window.__punktStaly?.())))
    const zakladki = page.locator(`[data-seg="${zak}"] .block-page`)
    await zakladki.nth((await zakladki.count()) - 1).click()
    await page.waitForFunction(() => window.__strona.koniec, null, { timeout: 60000 })
    const st = await page.evaluate(() => window.__strona)
    if (process.env.DBG) console.log('  po kliku:', JSON.stringify(await page.evaluate(() => window.__punktStaly?.())), await page.evaluate(() => document.querySelector('.linear-view').scrollTop))
    const m = Math.max(...st.klatki.map(Math.abs))
    if (process.env.DBG) console.log('  strona klatki:', st.klatki.map((x) => Math.round(x)).join(' '), 'kafelek', zak)
    check('wyższa strona: kafelek stoi w miejscu (najwyżej 1 px)', m <= 1, `odchylenie ${m.toFixed(2)} px`)
    check('wyższa strona: pod kafelkiem ani jednej klatki z pustym miejscem', st.puste === 0, `${st.puste} klatek`)
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  check('bez błędów konsoli', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

for (const skala of (process.env.KOMP_SKALE ?? '1,1.25').split(',').map(Number)) await przebieg(skala)
await browser.close()
if (problems.length) {
  console.log(`\n>>> BŁĘDY: ${problems.length}`)
  process.exit(1)
}
console.log('\n>>> Wszystko OK')
