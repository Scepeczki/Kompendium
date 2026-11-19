// Pole w Linii, w które już raz kliknięto, dalej przyjmuje poprawki kafelka
// z zewnątrz (tu: z drugiej karty) — tekst i układ zdjęcia.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'
const errors = []
const b = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const ctx = await b.newContext({ viewport: { width: 1400, height: 850 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => errors.push(String(e)))
await p.goto('http://localhost:5173/'); await p.waitForTimeout(1000)
const png = await p.evaluate(() => { const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#3a7ca5';x.fillRect(0,0,600,400);return c.toDataURL('image/png').split(',')[1] })
await nowaSciezka(p, 'Z')
await p.click('.view-switch button:has-text("Linia")'); await p.waitForSelector('.linear-append')
await p.click('.dodaj-kafelek-pasek:has-text("Kafelek") > .btn-dolacz'); await p.waitForTimeout(800)
await p.locator('.linear-seg .markdown-body').first().click(); await p.waitForTimeout(400)
await p.keyboard.type('Tekst ')
await p.setInputFiles('.linear-toolbar .rich-plik', { name: 'z.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
await p.waitForSelector('.linear-seg img[data-obraz]'); await p.waitForTimeout(1500)
await p.mouse.click(700, 800) // kursor wychodzi z pola
const wLinii = () => p.evaluate(() => { const i = document.querySelector('.linear-seg img[data-obraz], .linear-seg .markdown-body img'); return (i ? i.className + ' ' + i.style.width : 'brak') + ' | ' + document.querySelector('.linear-seg').innerText.replace(/\s+/g, ' ').slice(0, 60) })
const przed = await wLinii()
const q = await ctx.newPage()
await q.goto('http://localhost:5173/'); await q.waitForTimeout(1200)
await q.click('.path-item:has-text("Z") .sciezka-rozwin'); await q.click('.sciezka-dzieci .concept-item'); await q.waitForSelector('.editor-name')
await q.click('.rich-content .tiptap img[data-obraz]'); await q.click('.zdjecie-pasek button:text-is("25")'); await q.click('.zdjecie-pasek button[title^="Po prawej, a tekst"]')
await q.click('.rich-content .tiptap'); await q.keyboard.press('Control+Home'); await q.keyboard.type('Z drugiej karty. ')
await q.waitForTimeout(2000)
await p.bringToFront(); await p.waitForTimeout(1500)
const po = await wLinii()
const ok = !przed.includes('oplyw') && po.includes('zdj-oplyw-prawo 25%') && po.includes('Z drugiej karty')
console.log(`${ok ? '✓' : '✗ BŁĄD:'} kliknięte pole w Linii przyjmuje poprawki z zewnątrz — ${przed} → ${po}`)
console.log(ok ? '>>> WSZYSTKO POPRAWNE' : '>>> NIEPOPRAWNE (1)')
await b.close()
if (!ok) process.exit(1)
