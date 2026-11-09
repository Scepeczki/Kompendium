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

Fabryczne id (`ogolny`, `definicja`, `twierdzenie`, `lemat`, `przyklad`, `uwaga`,
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

   **Wyjątek: kafelki w folderze ścieżki.** Kafelek z `Concept.pathId` tej
   ścieżki ma jeden tekst: pisanie w ścieżce idzie **prosto do kafelka**,
   a poprawka w bibliotece od razu widać w ścieżce. Gdy kafelek z własnym
   tekstem ścieżki (`wlasneTresci`) wchodzi do folderu, program pyta, który
   tekst zachować; drugi trafia do nowej, niebieżącej wersji kafelka,
   a `wlasneTresci` węzła znikają. Tak samo raz po otwarciu ścieżki dla
   kafelków, które trafiły do folderu wcześniej.
7. **Kafelek może mieszkać w ścieżce zamiast w bibliotece.** `Concept.pathId`
   znaczy „ten kafelek należy do tego wykładu" — **znika wtedy z listy po
   lewej**. Tak trzyma się przykłady i rozwiązane zadania: biblioteka ma być
   listą pojęć, a nie wysypiskiem przykładów do nich.

   **Ścieżka jest folderem.** `pathId` ustawiają: kafelek zrobiony w ścieżce
   („Kafelek" w Linii i w menu mapy), upuszczenie kafelka na wiersz ścieżki
   w liście po lewej, wklejenie (Ctrl+V) w otwartą ścieżkę i ręczne
   „⌂ Trzymaj tylko tutaj". Wciągnięcie kafelka do Linii to tylko układanie
   wykładu i nie rusza tego, gdzie on mieszka. Rozwinięta ścieżka w liście
   pokazuje swoje kafelki; wyciągnięty z niej do folderu kafelek traci
   `pathId`, a w samej ścieżce zostaje na miejscu.

   **Usunięcie ze ścieżki.** Kafelek tutejszy, który stoi jeszcze w innej
   ścieżce, przeprowadza się tam. Niestojący nigdzie indziej — program pyta:
   „Usuń na dobre" kasuje go z wersjami i stronami, „Zachowaj w liście" kasuje
   `pathId`. Skasowanie ścieżki i „↗ Odeślij do biblioteki" kasują `pathId`
   bez pytania. Kafelek już obecny w ścieżce nigdy się przy wkładaniu nie dubluje.
   Usunięty kafelek wychodzi ze wszystkich ścieżek (łańcuch się zszywa), więc
   nie zostaje po nim pusty węzeł; scalony blok traci go dopiero wtedy, gdy
   nie ma w nim innych kafelków.
8. **`BlockTypeDef.wSciezce` zostaje w danych, ale przycisków już nie
   wybiera** — „Kafelek" w ścieżce proponuje każdy widoczny rodzaj, a sam klik
   daje rodzaj `ogolny`. O tym, gdzie kafelek mieszka, rodzaj nie mówi nic.
9. **Chronologia** — `createdAt` kafelka to punkt na osi zdobywania wiedzy.
10. **Znaczek to nazwa, nie obrazek** — `icon` (kafelka, folderu, ścieżki) trzyma
   nazwę z zestawu Lucide, np. `"sigma"`, a `iconColor` barwę `#rrggbb`. Nieznana
   nazwa jest po cichu ignorowana i wraca domyślny wygląd, więc kopia zapasowa
   z przyszłej wersji nic nie psuje.

## Baza (IndexedDB przez Dexie, baza `kompendium`, schemat v10)

| Tabela | Indeksy | Zawiera |
|---|---|---|
| `concepts` | `id, name, type, createdAt, updatedAt, folderId, *tags` | kafelki |
| `versions` | `id, conceptId, [conceptId+version], createdAt` | wersje treści |
| `subpages` | `id, conceptId` | strony kafelka |
| `obrazy` | `id, dodano` | zdjęcia z treści: `dane` to adres data:, a w tekście stoi `![opis](obraz:id)`, z układem w tytule, np. `![opis](obraz:id "zdjecie 40% oplyw-prawo")` (szerokość w % kolumny; położenie `srodek`, `prawo`, `oplyw-lewo`, `oplyw-prawo`, `wiersz`, bez niego po lewej) |
| `relations` | `id, fromId, toId, kind` | powiązania |
| `paths` | `id, name, folderId, createdAt, updatedAt` | ścieżki |
| `folders` | `id, kind, parentId, name` | foldery (`concepts` / `pdfs`) |
| `pdfs` | `id, title, addedAt, folderId` | pliki PDF jako `Blob` |
| `blockTypes` | `id, order` | typy kafelków |
| `nauka` | `id, rodzaj, pathId, etap, termin` | jednostki nauki: `sektor` (węzły ścieżki w `wezly`, mapa w `mapa` jako Markdown) albo `fiszka` (`conceptId`, opcjonalnie zakryta strona `zakryjStrone`); `etap`: `nowy` → `mapowanie` → `przerwa` → `czat` → `zadania` → `powtorki`; `karta` to stan FSRS, `termin` jego kopia do szukania; `zadania` — id kafelków-zadań sektora (typ `zadanie`, z `pathId` ścieżki, strony „Rozwiązanie" i „Metoda"), w kolejności; nie są węzłami ścieżki |
| `pamiec` | `klucz, termin, slaby` | pamięć kafelka, wspólna dla wszystkich ścieżek: kluczem jest id kafelka (dla grupy `grupa:<ścieżka>:<węzeł>`); `slaby` = ma własne terminy, aż dogoni sektor; `wpadki` liczą upartość |
| `historia` | `id, kiedy, jednostkaId` | wpisy powtórek — **tylko dopisywane, nigdy zmieniane**: `typ` (`test`, `powtorka`, `kafelek`, `czat`, `koncowy`, `od-nowa`), ocena (1–4), zaznaczenia kafelków (zadania z kluczem `zadanie:<id>`), odpowiedzi pisane przed odsłonięciem, czas, cel zapamiętania |

Historia schematu: v1 podstawy → v2 foldery i kolejność → v3 wspólna kolejność
folderów z kafelkami → v4 ścieżki → v5 strony kafelka → v6 powiązania →
v7 typy kafelków jako dane (migracja przenosi barwy z localStorage) → v8 strony
osobno dla każdej wersji → v9 zdjęcia → v10 nauka (`nauka`, `pamiec`,
`historia` — tylko nowe tabele).

Ustawienia nauki (cel zapamiętania, przerwa, progi, pytania) leżą w localStorage
pod kluczami `ui.nauka.*`, więc jadą z kopią zapasową jak reszta ustawień.

## Kopia zapasowa

Jeden plik `.zip`: `dane.json` (wszystkie tabele poza plikami) + katalog `pdfy/`
z prawdziwymi plikami `.pdf`. Import dopisuje zawartość do bieżącej bazy —
rekordy o tym samym `id` nadpisują istniejące, reszta zostaje nietknięta.

`dane.json` niesie też pole `ustawienia`: wszystkie klucze `ui.*`
z localStorage (motyw, szerokość strony, deseń tła, krój treści…). Nie są
danymi, ale kopia ma odtworzyć program takim, jakim się go zostawiło.
