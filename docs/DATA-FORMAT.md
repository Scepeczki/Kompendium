# Kompendium — Format danych

> Najtrwalsza decyzja projektu: treść musi przeżyć każdą wersję aplikacji.
> Kod typów: [app/src/types.ts](../app/src/types.ts)

## Model: Pojęcie → Wersje → Odnośniki źródłowe

```
Concept (pojęcie/klocek)          BlockVersion (wersja treści)         SourceRef (Context-Lock)
├─ id                             ├─ id                                ├─ id
├─ name        „Przestrzeń        ├─ conceptId ──► Concept             ├─ pdfId ──► PdfDoc
│               metryczna"        ├─ version    1, 2, 3…               ├─ page   (od 1)
├─ type        definicja /        ├─ label      „wg Rudina"            ├─ rect   {x,y,w,h}
│              twierdzenie /      ├─ content    Markdown + LaTeX       └─ note?
│              lemat / dowód /    ├─ sourceRefs SourceRef[]
│              przykład / uwaga / ├─ createdAt
│              intuicja           └─ updatedAt
├─ tags        [„matematyka"]
├─ createdAt   ← oś zdobywania wiedzy
├─ updatedAt
└─ currentVersionId ──► BlockVersion
```

## Kluczowe zasady

1. **Pojęcie nie ma treści** — treść żyje wyłącznie w wersjach. „Zapisz jako v2"
   kopiuje bieżącą wersję jako nową; stare wersje są niezmienne (tylko do odczytu).
2. **Treść to czysty tekst** (Markdown + LaTeX) — niezależny od jakiejkolwiek aplikacji,
   grosze pamięciowo, łatwy backup i eksport.
3. **Context-Lock to współrzędne, nie obrazy** — `rect` jest prostokątem na stronie PDF
   we współrzędnych strony **przy skali 1** (punkty PDF, początek w lewym górnym rogu).
   Wycinek renderuje się z PDF na żądanie. Prostokąt działa też na skanach bez warstwy tekstu.
4. **PDF-y przechowywane lokalnie** w IndexedDB jako `Blob` (tabela `pdfs`);
   w przyszłości (Etap 5) będą pobierane na żądanie z chmury.
5. **Chronologia** — `createdAt` pojęcia to punkt na osi zdobywania wiedzy;
   domyślne sortowanie listy klocków.

## Baza (IndexedDB przez Dexie, baza `kompendium`)

| Tabela | Indeksy |
|---|---|
| `concepts` | `id, name, type, createdAt, updatedAt, *tags` |
| `versions` | `id, conceptId, [conceptId+version], createdAt` |
| `pdfs` | `id, title, addedAt` |
