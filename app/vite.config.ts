import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** pdf.js potrzebuje danych pomocniczych: czcionek standardowych (bez nich
 *  dokumenty z niewbudowanymi czcionkami tracą tekst), map znaków, modułów
 *  WASM i profili ICC. Kopiujemy je z pakietu do public/pdfjs (katalog jest
 *  w .gitignore — to kopia zależności, nie kod projektu). */
function copyPdfAssets() {
  const from = resolve(here, 'node_modules/pdfjs-dist')
  const to = resolve(here, 'public/pdfjs')
  for (const d of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    const src = resolve(from, d)
    if (existsSync(src)) cpSync(src, resolve(to, d), { recursive: true })
  }
}
copyPdfAssets()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
