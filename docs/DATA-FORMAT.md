# Kompendium — Format danych

> Najtrwalsza decyzja projektu: treść musi przeżyć każdą wersję aplikacji.
> Kod typów: [app/src/types.ts](../app/src/types.ts) · Słownictwo: [SLOWNIK.md](../SLOWNIK.md)

## Warstwa wiedzy: Klocek → Wersje → Źródła

```
Concept (klocek)                  BlockVersion (wersja treści)
├─ id                             ├─ id
├─ name          „Kres górny"     ├─ conceptId ──► Concept
├─ type ─────► BlockTypeDef       ├─ version     1, 2, 3…
│                                 ├─ label       „wg Rudina"
│                                 ├─ content     Markdown + LaTeX
│                                 ├─ sourceRefs  SourceRef[]      ← źródła należą
│                                 ├─ sourceGroups?  string[]        do WERSJI
├─ tags          [„analiza"]      ├─ createdAt
├─ mainPageName? „Sformułowanie"  └─ updatedAt
├─ icon?         „sigma"          ← własny znaczek zamiast plakietki typu
├─ folderId      | null
├─ order         (ułamkowa)       Subpage (strona klocka)
├─ createdAt     ← oś wiedzy      ├─ id
├─ updatedAt                      ├─ conceptId ──► Concept
└─ currentVersionId ──►           ├─ name        „Dowód"
                    BlockVersion  ├─ content     Markdown + LaTeX
                                  └─ order
```

### Typ klocka — też dane, nie kod

```
BlockTypeDef
├─ id        „definicja" / uuid   ← to trafia do Concept.type
├─ label     „Definicja"
├─ short     „DEF"                ← plakietka w listach i na kafelkach
├─ color     „#31619e"
├─ order
├─ builtin?  true = fabryczny: można przemianować i przemalować,
│                   ale nie usunąć (żeby nie zostać bez ani jednego)
└─ hidden?   true = nie proponuj przy nowym klocku; istniejące działają
```

Fabryczne id (`definicja`, `twierdzenie`, `lemat`, `przyklad`, `uwaga`,
`dowod`, `intuicja`) zostały te same, co przed edytorem typów — stare klocki
działają bez migracji. `dowod` i `intuicja` startują jako `hidden`.

### Źródło — dwa rodzaje (unia)

```
PdfSourceRef                      BlockSourceRef
├─ id                             ├─ id
├─ kind?  'pdf' (brak = pdf)      ├─ kind    'block'
├─ pdfId ──► PdfDoc               ├─ conceptId ──► Concept
├─ page   (od 1)                  ├─ versionId | null  (null = zawsze bieżąca)
├─ rect   {x,y,w,h}               ├─ group?
├─ group?                         └─ note?
└─ note?
```

Rozpoznawanie: `isPdfSource(r)` / `isBlockSource(r)`. **Starsze rekordy nie mają
pola `kind`** — obecność `pdfId` oznacza źródło z PDF, dlatego zmiana była
bezmigracyjna.

### Powiązanie między klockami

```
Relation
├─ id
├─ fromId ──► Concept      ├─ kind   'zawieranie' | 'skala' | 'perspektywa'
├─ fromVersionId? | null   ├─ note?   np. „n = 1"
├─ toId ──► Concept        └─ createdAt
└─ toVersionId?   | null
```

Końce można zawęzić do konkretnej wersji, bo jedna perspektywa klocka bywa
uogólnieniem, a inna nie. `perspektywa` jest symetryczna (bez kierunku).

## Warstwa kompozycji: Ścieżka

```
LearningPath                      PathNode — pięć rodzajów (pole `kind`)
├─ id                             ├─ block    conceptId, versionId, subpageId?
├─ name                           ├─ fusion   name, type?, parts[]   ← GRUPA
├─ icon?                          ├─ heading  text, level 1|2|3
├─ folderId | null
├─ order                          ├─ text     text                   ← notatka
├─ nodes    PathNode[]            └─ comment  text, side?            ← poza skryptem
├─ edges    PathEdge[]                (wszystkie mają id, x, y)
├─ createdAt
└─ updatedAt                      PathEdge: id, from, to, priority?
```

**Uwaga historyczna:** grupa ma w danych `kind: 'fusion'` — nazwa z czasów, gdy
scalanie miało zlewać klocki. Zostaje, bo siedzi w zapisanych ścieżkach.

## Kluczowe zasady

1. **Klocek nie ma treści** — treść żyje wyłącznie w wersjach. „Zapisz jako v2"
   kopiuje bieżącą wersję jako nową; stare wersje są niezmienne.
2. **Treść to czysty tekst** (Markdown + LaTeX) — niezależny od aplikacji, grosze
   pamięciowo, łatwy backup i eksport.
3. **Formatowanie, którego Markdown nie zna, zapisujemy znacznikami w tekście:**
   `⟦wL,F,R⟧` na początku akapitu = wcięcia (px), `⟦sNN⟧…⟦/s⟧` = rozmiar fragmentu.
   W trybie wizualnym są niewidoczne, w trybie kodu widoczne jawnie.
4. **Źródła należą do wersji**, nie do strony — są wspólne dla wszystkich stron
   danej wersji.
5. **Odnośnik do PDF to współrzędne, nie obraz** — `rect` jest prostokątem na
   stronie przy skali 1 (punkty PDF, początek w lewym górnym rogu). Wycinek
   renderuje się na żądanie; działa też na skanach bez warstwy tekstu.
6. **Ścieżka nigdy nie zmienia klocka** — jest widokiem, nie edytorem.
7. **Chronologia** — `createdAt` klocka to punkt na osi zdobywania wiedzy.
8. **Znaczek to nazwa, nie obrazek** — `icon` (klocka, folderu, ścieżki) trzyma
   nazwę z zestawu Lucide, np. `"sigma"`, a `iconColor` barwę `#rrggbb`. Nieznana
   nazwa jest po cichu ignorowana i wraca domyślny wygląd, więc kopia zapasowa
   z przyszłej wersji nic nie psuje.

## Baza (IndexedDB przez Dexie, baza `kompendium`, schemat v7)

| Tabela | Indeksy | Zawiera |
|---|---|---|
| `concepts` | `id, name, type, createdAt, updatedAt, folderId, *tags` | klocki |
| `versions` | `id, conceptId, [conceptId+version], createdAt` | wersje treści |
| `subpages` | `id, conceptId` | strony klocka |
| `relations` | `id, fromId, toId, kind` | powiązania |
| `paths` | `id, name, folderId, createdAt, updatedAt` | ścieżki |
| `folders` | `id, kind, parentId, name` | foldery (`concepts` / `pdfs`) |
| `pdfs` | `id, title, addedAt, folderId` | pliki PDF jako `Blob` |
| `blockTypes` | `id, order` | typy klocków |

Historia schematu: v1 podstawy → v2 foldery i kolejność → v3 wspólna kolejność
folderów z klockami → v4 ścieżki → v5 strony klocka → v6 powiązania →
v7 typy klocków jako dane (migracja przenosi barwy z localStorage).

## Kopia zapasowa

Jeden plik `.zip`: `dane.json` (wszystkie tabele poza plikami) + katalog `pdfy/`
z prawdziwymi plikami `.pdf`. Import dopisuje zawartość do bieżącej bazy —
rekordy o tym samym `id` nadpisują istniejące, reszta zostaje nietknięta.

`dane.json` niesie też pole `ustawienia`: wszystkie klucze `ui.*`
z localStorage (motyw, szerokość strony, deseń tła, krój treści…). Nie są
danymi, ale kopia ma odtworzyć program takim, jakim się go zostawiło.
