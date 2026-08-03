# Kompendium — Roadmapa

> Zasada nadrzędna: **jak najszybciej dojść do wersji, w której da się realnie uczyć**.
> Każdy etap kończy się czymś używalnym. Unikamy pułapki budowania systemu do nauki
> zamiast nauki (patrz [VISION.md](VISION.md) §1).
>
> Słownictwo: [SLOWNIK.md](SLOWNIK.md). Format danych: [docs/DATA-FORMAT.md](docs/DATA-FORMAT.md).

---

## Stan na 3 sierpnia 2026

Aplikacja jest **w codziennym użyciu** — trwa przenoszenie własnych notatek.
Poniżej to, co działa, pogrupowane tak, jak się z tego korzysta.

### Klocki i treść

- [x] Klocki z typem, nazwą, tagami; lista z wyszukiwarką i filtrem typu.
- [x] Foldery (drzewo, przeciąganie, wspólna kolejność klocków i ścieżek).
- [x] Wersje klocka z etykietą, zmianą nazwy, kolejności i usuwaniem.
- [x] Strony klocka (dowolna liczba, dowolne nazwy — najczęściej „Dowód");
      nazwę strony głównej też można zmienić.
- [x] Hybrydowy edytor: **Wizualny** (TipTap) ↔ **Kod** (CodeMirror) ↔ **Podział**;
      źródłem prawdy zawsze Markdown + LaTeX.
- [x] Wzory KaTeX renderowane w miejscu podczas pisania; klik we wzór pokazuje kod.
- [x] Skróty Ctrl+B/I/M, pasek formatowania, zawijanie wierszy w trybie kodu.
- [x] Linijka strony: szerokość tekstu, wcięcia akapitów (lokalne), rozmiar
      zaznaczonego fragmentu, interlinia, odstęp akapitów, wielkość i odstęp wzorów.
- [x] Wiki-linki `[[Nazwa]]`, panel odwołań, widok grafu powiązań.

### Źródła

- [x] Import PDF do bazy lokalnej; biblioteka z folderami, zmianą nazwy i usuwaniem.
- [x] Czytnik PDF: wszystkie strony w pionie, zoom, skok do strony, leniwe rysowanie.
- [x] Podpięcie źródła prostokątem (działa na skanach); skok z klocka do miejsca w PDF.
- [x] **Źródłem może być inny klocek** → genealogia wiedzy aż do strony w książce.
- [x] Lista źródeł pod treścią bloku z podglądem fragmentu po najechaniu.
- [x] Mapa wykorzystanych fragmentów na stronach PDF (klik otwiera klocek).

### Powiązania

- [x] Trzy osie: zawieranie, skala, perspektywa; z dopiskiem i zawężeniem do wersji.
- [x] Widoczne na mapie ścieżki jako przerywane strzałki (można wyłączyć).
- [ ] **Sposób tworzenia powiązań — do przeprojektowania.** Panel w edytorze
      i pigułki pod treścią zostały wycofane (odrzucona forma graficzna).
      Kierunek: osobna mapa pojęć. Dane i pokazywanie na mapie zostają.

### Ścieżki

- [x] Trzy widoki: **Mapa**, **Linia**, **Skrypt**.
- [x] Kafelki z wyborem wersji i strony; strzałki kolejności z priorytetem gałęzi.
- [x] Rozdziały, podrozdziały i sekcje + klikalny spis treści (można schować).
- [x] Notatki i komentarze (komentarz nie trafia do skryptu).
- [x] Grupy: kilka klocków jako jeden blok wybranego typu; scalanie na mapie
      i w linii, edycja nazwy i typu, rozgrupowanie.
- [x] Generowanie skryptu (porządek topologiczny) → druk / zapis PDF.
- [x] Układanie kafelków: unikanie nakładania przy dodawaniu + przycisk „Ułóż".

### Całość

- [x] Motyw jasny/ciemny, ustawienia wyglądu (szerokość strony, kolory typów,
      nasycenie tła bloków), zapamiętywane między sesjami.
- [x] Kopia zapasowa: eksport i import całej bazy do jednego pliku `.zip`.
- [x] Skrót na pulpicie uruchamiający aplikację w Firefoksie.
- [x] Bateria testów Playwright (24 pliki) + pomiar płynności mapy w Firefoksie.

---

## Kolejka — co dalej

1. **Układ paska bocznego** — obecny jest doraźny; do przemyślenia (inspiracja
   Obsidianem: ustawienia na dole, przyciski tworzenia nad listą).
2. **Tworzenie powiązań** — osobna mapa pojęć zamiast wycofanych paneli.
3. **Szybkie wstawianie środowisk** (twierdzenie, dowód □) w edytorze.
4. **Pełny LaTeX / TikZ** — najbardziej ryzykowny element stacku, patrz niżej.
5. **Synchronizacja i telefon** — na telefonie priorytet to *czytanie* ścieżek,
   nie edycja mapy; tryb offline z późniejszą synchronizacją.

---

## Decyzje rozstrzygnięte

- **2026-08-03 — Grupowanie.** Scalanie to zabieg **estetyczny**: grupa czyta się
  jak jeden blok wybranego typu, a klocki w środku tracą własne ramki i tytuły.
  W bazie pozostają osobnymi klockami.
- **2026-08-02/03 — Synteza wielu źródeł.** Trzy warstwy (źródło / wiedza /
  kompozycja), źródłem może być klocek, jeden klocek = jeden byt, powiązania na
  trzech osiach z zawężeniem do wersji, uogólnienie przykrywa przypadki szczególne.
  Szczegóły: [VISION.md](VISION.md) §2.
- **2026-07-31 — Dowody.** Nie osobny typ klocka, tylko **strona klocka** o dowolnej
  nazwie. W ścieżce wybiera się stronę pokazywaną bazowo; w skrypcie można je
  przełączać podczas czytania.
- **2026-07-30 — Kopia zapasowa zamiast plików na dysku.** Interfejs dostępu do
  plików (File System Access API) działa tylko w przeglądarkach Chromium, a używamy
  Firefoksa — dlatego eksport/import `.zip` zamiast katalogu z notatkami.
- **Etap 0 — Build vs adapt** → budujemy od zera. **Stack** → tabela niżej.
  **Format danych** → [docs/DATA-FORMAT.md](docs/DATA-FORMAT.md).
- **Canvas** → **React Flow** (prototyp tldraw okazał się zbędny).

### Otwarte drobiazgi

- **Przecinanie się zakresów** przy osi zawierania — dziś tylko pochłanianie
  („zawiera" / „jest częścią") plus dopisek; częściowe przecięcie nie ma etykiety.
- **Oś dydaktyczna „wymaga"** („żeby to zrozumieć, znaj najpierw tamto") — świadomie
  poza trzema osiami ontologicznymi; wróci, jeśli ścieżki mają podpowiadać kolejność.

---

## Stack

| Warstwa | Wybór | Stan |
|---|---|---|
| Aplikacja | React + TypeScript + Vite (PWA) | działa |
| Edytor wizualny | TipTap (ProseMirror) | działa |
| Edytor kodu | CodeMirror 6 | działa |
| Wzory | KaTeX | działa |
| Mapa ścieżek | React Flow | działa |
| PDF | PDF.js | działa (komplet danych pomocniczych: czcionki, mapy znaków, WASM, ICC) |
| Baza lokalna | IndexedDB przez Dexie | działa (wersja schematu 6) |
| Kopia zapasowa | JSZip → jeden plik `.zip` | działa |
| Testy | Playwright (Brave + Firefox do pomiarów) | działa |
| Pełny LaTeX / TikZ | kompilator w przeglądarce (WASM) | **niezrobione** |
| Synchronizacja | darmowy tier (kierunek: Supabase) | **niezrobione** |

**Uczciwa notka o TikZ:** pełny LaTeX w przeglądarce to najbardziej ryzykowny element
stacku — pierwsza kompilacja bywa wolna (sekundy). Plan: wzory renderuje KaTeX
natychmiast, a bloki `tikz` kompilują się w tle i są cache'owane. Jeśli WASM okaże
się zbyt toporny, alternatywą jest własny mini-serwer kompilacji.

---

## Pomysły na później (świadomie odłożone)

- Automatyczne fiszki z klocków (tryb „zakryj dowód"), powtórki rozłożone w czasie.
- Eksport ścieżki do pełnego LaTeX-a (gotowy skrypt akademicki).
- Współdzielenie ścieżek z innymi.
