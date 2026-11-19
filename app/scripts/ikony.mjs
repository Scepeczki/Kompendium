// Rysuje ikony PNG dla telefonu z tego samego pliku favicon.svg, żeby nie
// trzymać dwóch osobnych rysunków, które kiedyś się rozjadą. Uruchamiać po
// każdej zmianie favicon.svg:  node scripts/ikony.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const tu = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(resolve(tu, '../public/favicon.svg'), 'utf8')

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage()

for (const rozmiar of [192, 512]) {
  // Tło pod ikoną „maskable": telefon może ją przyciąć do koła, więc rysunek
  // dostaje margines, a puste miejsce wypełniamy barwą programu.
  const margines = Math.round(rozmiar * 0.1)
  await page.setContent(
    `<body style="margin:0;background:#3d6b54;width:${rozmiar}px;height:${rozmiar}px;
        display:flex;align-items:center;justify-content:center">
       <div style="width:${rozmiar - 2 * margines}px;height:${rozmiar - 2 * margines}px">${svg}</div>
     </body>`,
  )
  await page.setViewportSize({ width: rozmiar, height: rozmiar })
  const png = await page.screenshot({ omitBackground: false })
  writeFileSync(resolve(tu, `../public/ikona-${rozmiar}.png`), png)
  console.log(`✓ ikona-${rozmiar}.png`)
}

await browser.close()
