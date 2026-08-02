import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { db } from './db'
import type { Rect } from './types'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Dane pomocnicze pdf.js (kopiowane do public/pdfjs przez vite.config.ts).
 *  Bez czcionek standardowych dokumenty z niewbudowanymi krojami tracą tekst,
 *  bez map znaków — dokumenty z nietypowym kodowaniem. */
export const PDF_ASSETS = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
  iccUrl: `${import.meta.env.BASE_URL}pdfjs/iccs/`,
}

/** Otwarte dokumenty — wspólne dla panelu PDF i podglądów źródeł. */
const docs = new Map<string, Promise<PDFDocumentProxy | null>>()

export function loadPdf(pdfId: string): Promise<PDFDocumentProxy | null> {
  const cached = docs.get(pdfId)
  if (cached) return cached
  const p = (async () => {
    const rec = await db.pdfs.get(pdfId)
    if (!rec) return null
    const data = await rec.data.arrayBuffer()
    return await pdfjsLib.getDocument({ data, ...PDF_ASSETS }).promise
  })().catch(() => null)
  docs.set(pdfId, p)
  return p
}

/** Zapomina dokument (np. po usunięciu PDF-a z biblioteki). */
export function forgetPdf(pdfId: string): void {
  docs.delete(pdfId)
  for (const key of [...regions.keys()]) {
    if (key.startsWith(`${pdfId}:`)) regions.delete(key)
  }
}

const regions = new Map<string, Promise<string | null>>()

/** Renderuje wycinek strony (prostokąt w punktach PDF) do obrazka data:URL.
 *  Wynik jest zapamiętywany — podgląd źródła otwiera się natychmiast. */
export function renderRegion(
  pdfId: string,
  page: number,
  rect: Rect,
  maxWidth = 380,
): Promise<string | null> {
  const key = `${pdfId}:${page}:${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(
    rect.w,
  )},${Math.round(rect.h)}:${maxWidth}`
  const cached = regions.get(key)
  if (cached) return cached
  const p = (async () => {
    const doc = await loadPdf(pdfId)
    if (!doc || page < 1 || page > doc.numPages) return null
    const pg = await doc.getPage(page)
    // margines dookoła wycinka — łatwiej rozpoznać kontekst
    const pad = 6
    const w = Math.max(1, rect.w + 2 * pad)
    const h = Math.max(1, rect.h + 2 * pad)
    const scale = Math.min(3, Math.max(0.5, maxWidth / w))
    const viewport = pg.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(w * scale)
    canvas.height = Math.ceil(h * scale)
    // przesuwamy stronę tak, żeby wycinek trafił w lewy górny róg płótna
    await pg.render({
      canvas,
      viewport,
      transform: [1, 0, 0, 1, -(rect.x - pad) * scale, -(rect.y - pad) * scale],
    }).promise
    return canvas.toDataURL('image/png')
  })().catch(() => null)
  regions.set(key, p)
  return p
}
