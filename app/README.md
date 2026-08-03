# Kompendium — aplikacja

Kod aplikacji. Opis projektu: [../VISION.md](../VISION.md) ·
plan: [../ROADMAP.md](../ROADMAP.md) · słownictwo: [../SLOWNIK.md](../SLOWNIK.md) ·
format danych: [../docs/DATA-FORMAT.md](../docs/DATA-FORMAT.md).

## Uruchamianie

Na co dzień: **skrót „Kompendium" na pulpicie** — uruchamia serwer w tle
i otwiera aplikację w Firefoksie (`start-kompendium.vbs`).

Ręcznie:

```bash
npm install      # tylko za pierwszym razem
npm run dev      # http://localhost:5173
```

Przy starcie Vite kopiuje dane pomocnicze PDF.js (czcionki standardowe, mapy
znaków, moduły WASM, profile ICC) z `node_modules` do `public/pdfjs` — bez nich
dokumenty z niewbudowanymi czcionkami tracą tekst. Katalog jest w `.gitignore`.

## Gdzie są dane

Wszystko siedzi lokalnie w **IndexedDB przeglądarki** (baza `kompendium`):
klocki, wersje, strony, powiązania, ścieżki, foldery i pliki PDF.

**Dane są związane z przeglądarką i profilem.** Otwarcie aplikacji w innej
przeglądarce pokaże pustą bazę — to nie jest utrata danych. Przenoszenie
i zabezpieczenie: Ustawienia → *Kopia zapasowa* (eksport/import `.zip`).

## Testy

Testy end-to-end (Playwright, uruchamiane przy działającym `npm run dev`):

```bash
node scripts/test-paths-deep.mjs     # najszerszy test poprawności ścieżek
node scripts/test-map-perf.mjs       # płynność mapy i układanie kafelków
node scripts/smoke.mjs               # test dymny
```

Pozostałe pliki `scripts/test-*.mjs` pokrywają kolejne obszary (edytor, PDF,
źródła, grupy, spis treści, kopia zapasowa…). Każdy wypisuje `BŁĘDY KONSOLI`
na końcu — pusto znaczy dobrze.

Pomiar płynności w Firefoksie (przeglądarka docelowa) wymaga jednorazowo
`npx playwright install firefox`:

```bash
node scripts/perf-firefox.mjs
```

## Budowanie

```bash
npm run build    # sprawdzenie typów + build produkcyjny do dist/
npm run lint
```
