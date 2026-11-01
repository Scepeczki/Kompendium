# Kompendium — Format danych

> Najtrwalsza decyzja projektu: treść musi przeżyć każdą wersję aplikacji.
> Kod typów: [app/src/types.ts](../app/src/types.ts) · Słownictwo: [SLOWNIK.md](../SLOWNIK.md)

## Warstwa wiedzy: Kafelek → Wersje → Źródła

```
Concept (kafelek)                  BlockVersion (wersja treści)
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
├─ order         (ułamkowa)       Subpage (strona kafelka)
├─ createdAt     ← oś wiedzy      ├─ id
├─ updatedAt                      ├─ conceptId ──► Concept
└─ currentVersionId ──►           ├─ name        „Dowód"
                    BlockVersion  ├─ content     Markdown + LaTeX
                                  └─ order
```

### Typ kafelka — też dane, nie kod

```
BlockTypeDef
├─ id        „definicja" / uuid   ← to trafia do Concept.type
├─ label     „Definicja"
├─ short     „DEF"                ← plakietka w listach i na kafelkach
├─ color     „#31619e"
├─ order
├─ builtin?  true = fabryczny, czyli taki, który program potrafi
│                   odtworzyć po skasowaniu („Przywróć fabryczne")
└─ hidden?   true = nie proponuj przy nowym kafelku; istniejące działają
```

Fabryczne id (`definicja`, `twierdzenie`, `lemat`, `przyklad`, `uwaga`,
`dowod`, `intuicja`) zostały te same, co przed edytorem typów — stare kafelki
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

### Powiązanie między kafelkami

```
Relation
├─ id
├─ fromId ──► Concept      ├─ kind   'zawieranie' | 'skala' | 'perspektywa'
├─ fromVersionId? | null   ├─ note?   np. „n = 1"
├─ toId ──► Concept        └─ createdAt
└─ toVersionId?   | null
```

Końce można zawęzić do konkretnej wersji, bo jedna perspektywa kafelka bywa
uogólnieniem, a inna nie. `perspektywa` jest symetryczna (bez kierunku).

## Warstwa kompozycji: Ścieżka

```
LearningPath                      PathNode — pięć rodzajów (pole `kind`)
├─ id                             ├─ block    conceptId, versionId, subpageId?
├─ name                           ├─ fusion   name, type?, parts[], content?  ← GRUPA
├─ icon?                          ├─ heading  text, level 1–6, rozmiar?
├─ folderId | null
├─ order                          ├─ text     text                   ← notatka
├─ nodes    PathNode[]            └─ comment  text, side?            ← poza skryptem
├─ edges    PathEdge[]                (wszystkie mają id, x, y; poza heading też rozmiarTekstu?)
├─ createdAt
└─ updatedAt                      PathEdge: id, from, to, priority?
```

**Uwaga historyczna:** grupa ma w danych `kind: 'fusion'` — nazwa z czasów, gdy
scalanie miało zlewać kafelki. Zostaje, bo siedzi w zapisanych ścieżkach.

**SCALANIE TO KOMPONOWANIE.** Scalony blok (`kind: 'fusion'`) nie jest
składanką kafelków pokazywanych obok siebie, tylko osobnym kafelkiem z własnym
tekstem. Klika się „Scal" i otwiera ekran komponowania: po lewej materiał
(kafelki i ich strony), na środku powstający kafelek. Wstawianie KOPIUJE tekst,
więc nie ma granic między cudzymi fragmentami ani ukrytych właścicieli zdań.

```
PathNodeFusion: name, type?, parts[], content?, strony?, zrodla?
                 │      │      │        │         │        └─ źródła przeniesione
                 │      │      │        │         │           z materiałów
                 │      │      │        │         └─ własne strony bloku
                 │      │      │        └─ ZŁOŻONY TEKST (to jest treść bloku)
                 │      │      └─ MATERIAŁY: z czego złożono; zostają na zawsze,
                 │      │         żeby dało się wrócić i dobrać coś jeszcze
                 │      └─ czym jest całość (definicja, twierdzenie…)
                 └─ może być puste; nazwę klika się i nadaje na miejscu
```

**Migracja jest leniwa.** `content` bez wartości znaczy „jeszcze nie
komponowane": blok pokazuje wtedy sklejkę treści materiałów (`sklejMaterialy`
w `GroupShell.tsx`, uwzględnia `parts[].wlasneTresci`). Dopóki nikt nic nie
napisze ani nie wstawi, w danych nie zmienia się nic — ścieżki sprzed
przebudowy wyglądają tak samo i nic z nich nie ginie. Stare pola
(`parts[].wlasneTresci`, `paskiStron`) zostają w plikach; nowy model ich nie
używa, ale ich nie kasuje.

**Zapisujemy tylko to, czego człowiek dotknął.** Samo wczytanie tekstu do
edytora liczy się technicznie jako zmiana (Markdown nie wraca znak w znak), więc
blok tylko obejrzany dostawałby własną treść i tracił związek z materiałem.
Pilnują tego zapory `dotknieteRef` w `Komponowanie.tsx` i `PoleTresci`.

**Rozdzielenie nie kasuje pracy.** Materiały wracają do ścieżki jako osobne
kafelki, a złożony tekst zostaje jako notatka wpięta w ciąg. Kafelki
w bibliotece są przez cały czas nietknięte.

Pilnuje tego `test-scalanie.mjs` (materiał → jeden kafelek, biblioteka
nietknięta, powrót do komponowania) i `test-fuzja.mjs` (źródła, pisanie
w bloku, rozdzielenie).

## Kluczowe zasady

1. **Kafelek nie ma treści** — treść żyje wyłącznie w wersjach. „Zapisz jako v2"
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
6. **Ścieżka nigdy nie zmienia kafelka.** W widoku **Linia** pisze się wprost
   w kafelkach — wszystko jest do pisania, także starsza wersja kafelka, każdy
   składnik scalonego bloku i tytuł kafelka. Ale to, co tam napiszesz, zostaje
   **w ścieżce**: kafelek w bibliotece zachowuje swoją treść i swoją nazwę, a
   inne ścieżki nic nie zauważają. Ścieżka jest miejscem pracy nad tekstem, a
   nie zdalnym pilotem do biblioteki.

   Węzeł typu `block` trzyma to w dwóch polach: `nazwa` (własny tytuł kafelka)
   i `wlasneTresci` — mapie `{ "<versionId>:<subpageId>": markdown }`. Klucz
   robi `kluczWlasnej(versionId, subpageId)`; para (wersja, strona) jest w nim
   dlatego, że przełączenie wersji ma pokazać tekst napisany do TEJ wersji, a
   nie do innej. Składniki fuzji mają w `FusionPart` dokładnie to samo pole.

   **Brak wpisu znaczy „pokazuj kafelek żywcem"** — i tak jest domyślnie. Dopóki
   kafelka nie tknąłeś, widzi każdą późniejszą poprawkę zrobioną w bibliotece.
   Od pierwszej zmiany przestaje: kafelek pokazuje wtedy plakietkę „tekst tej
   ścieżki", a przyciskiem „wróć do kafelka" można własny tekst porzucić i
   wrócić do żywego podglądu.

   Skrypt czyta dokładnie to samo, co Linia — i **zostaje tylko do czytania**.

   **Wyjątek: kafelki tutejsze.** Przykład albo zadanie zrobione w ścieżce ma
   `Concept.pathId` i nie istnieje poza nią, więc pisanie w nim idzie **prosto
   do kafelka** — inaczej tekst zostałby „obok", a sam kafelek byłby pusty.
   Zasada z punktu 6 chroni bibliotekę; tutaj biblioteki nie ma czego chronić.
7. **Kafelek może mieszkać w ścieżce zamiast w bibliotece.** `Concept.pathId`
   znaczy „ten kafelek należy do tego wykładu" — **znika wtedy z listy po
   lewej**. Tak trzyma się przykłady i rozwiązane zadania: biblioteka ma być
   listą pojęć, a nie wysypiskiem przykładów do nich.

   **Decyduje się o tym ręcznie, kafelek po kafelku**, w ścieżce pod prawym
   przyciskiem: „⌂ Trzymaj tylko tutaj" / „↗ Odeślij do biblioteki". Działa dla
   każdego kafelka, także zwyczajnej definicji, i nie pyta o nic. **Nic innego
   `pathId` nie ustawia** (poza kafelkiem od razu napisanym w ścieżce, punkt
   niżej) — wciągnięcie kafelka do ścieżki to tylko układanie wykładu i nie
   rusza tego, gdzie on mieszka.

   **Nic nie ginie.** Wyjęcie ze ścieżki, skasowanie ścieżki albo „↗ Odeślij do
   biblioteki" kasują `pathId` i kafelek wraca do listy. Kafelek już obecny
   w ścieżce nigdy się przy wkładaniu nie dubluje.
8. **`BlockTypeDef.wSciezce` to co innego** — „ten rodzaj da się napisać wprost
   w ścieżce". Takie rodzaje dostają w Linii i w menu mapy przycisk „nowy
   ‹rodzaj›", a kafelek tak zrobiony rodzi się od razu z `pathId` swojej
   ścieżki. Fabrycznie mają to Przykład i Zadanie; przełącznik „nowy w ścieżce"
   w edytorze rodzajów pozwala dołożyć własne. O tym, gdzie kafelek mieszka,
   rodzaj nie mówi nic.
9. **Chronologia** — `createdAt` kafelka to punkt na osi zdobywania wiedzy.
10. **Znaczek to nazwa, nie obrazek** — `icon` (kafelka, folderu, ścieżki) trzyma
   nazwę z zestawu Lucide, np. `"sigma"`, a `iconColor` barwę `#rrggbb`. Nieznana
   nazwa jest po cichu ignorowana i wraca domyślny wygląd, więc kopia zapasowa
   z przyszłej wersji nic nie psuje.

## Baza (IndexedDB przez Dexie, baza `kompendium`, schemat v7)

| Tabela | Indeksy | Zawiera |
|---|---|---|
| `concepts` | `id, name, type, createdAt, updatedAt, folderId, *tags` | kafelki |
| `versions` | `id, conceptId, [conceptId+version], createdAt` | wersje treści |
| `subpages` | `id, conceptId` | strony kafelka |
| `relations` | `id, fromId, toId, kind` | powiązania |
| `paths` | `id, name, folderId, createdAt, updatedAt` | ścieżki |
| `folders` | `id, kind, parentId, name` | foldery (`concepts` / `pdfs`) |
| `pdfs` | `id, title, addedAt, folderId` | pliki PDF jako `Blob` |
| `blockTypes` | `id, order` | typy kafelków |

Historia schematu: v1 podstawy → v2 foldery i kolejność → v3 wspólna kolejność
folderów z kafelkami → v4 ścieżki → v5 strony kafelka → v6 powiązania →
v7 typy kafelków jako dane (migracja przenosi barwy z localStorage).

## Kopia zapasowa

Jeden plik `.zip`: `dane.json` (wszystkie tabele poza plikami) + katalog `pdfy/`
z prawdziwymi plikami `.pdf`. Import dopisuje zawartość do bieżącej bazy —
rekordy o tym samym `id` nadpisują istniejące, reszta zostaje nietknięta.

`dane.json` niesie też pole `ustawienia`: wszystkie klucze `ui.*`
z localStorage (motyw, szerokość strony, deseń tła, krój treści…). Nie są
danymi, ale kopia ma odtworzyć program takim, jakim się go zostawiło.
