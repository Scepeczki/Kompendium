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

### Kafelki i treść

- [x] Kafelki z typem, nazwą, tagami; lista z wyszukiwarką i filtrem typu.
- [x] Foldery (drzewo, przeciąganie, wspólna kolejność kafelków i ścieżek).
- [x] Wersje kafelka z etykietą, zmianą nazwy, kolejności i usuwaniem.
- [x] Strony kafelka (dowolna liczba, dowolne nazwy — najczęściej „Dowód");
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
- [x] Podpięcie źródła prostokątem (działa na skanach); skok z kafelka do miejsca w PDF.
- [x] **Źródłem może być inny kafelek** → genealogia wiedzy aż do strony w książce.
- [x] Lista źródeł pod treścią bloku z podglądem fragmentu po najechaniu.
- [x] Mapa wykorzystanych fragmentów na stronach PDF (klik otwiera kafelek).

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
- [x] Grupy: kilka kafelków jako jeden blok wybranego typu; scalanie na mapie
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

**Teraz (od 28.11.2026):** użytkownik testuje cały program. Jeśli nie znajdzie błędów,
na jego znak wydajemy wersję stabilną: pierwsze „1.0” na GitHubie, w której
Kompendium wreszcie działa w całości.

**Kierunki po wersji stabilnej** (słowa użytkownika, lista będzie rosła):

1. **Telefon z synchronizacją:** Kompendium także na telefonie, dane wspólne z komputerem.
2. **AI i automatyzacja:** połączenie z AI i zautomatyzowanie żmudnych czynności.
3. **Poprawki graficzne i funkcjonalne.**
4. **Doskonalenie systemu nauki.**
5. **Przegląd skryptu i mapy.**

Dalej dawny plan (nauka zrobiona etapami 1–4):


**Najpierw: system nauki** ([VISION.md](VISION.md) §5), etapami, każdy
od razu do użytku:

1. **Da się uczyć:** sektory w Linii i widok „Nauka" (spis po sektorach,
   kafelki poza sektorami, mapa sektora jako tekst i zdjęcie, pytania do
   wglądu), powtórka zero z przerwą, ekran sesji (pisanie odpowiedzi,
   odsłanianie z oceną, trudny tryb), terminy FSRS, strona „Powtórki"
   (dziś / jutro), pojedyncze fiszki, słabe i uparte kafelki, historia.
2. **Czat:** polecenie w Ustawieniach, schowek + nowa karta, luki
   i dogrywka; eksperyment „czat sprawdza moją odpowiedź".
3. **Zadania** (zrobione): kafelek-zadanie (Treść / Rozwiązanie),
   zwinięty pasek „Zadania" na końcu sektora, Przegląd sektorów, test
   końcowy z zadaniami, zadania w powtórkach rozszerzonych.
4. **Program na Windows** (zrobione 2026-11-19, Tauri): instalator na
   https://github.com/Scepeczki/Kompendium/releases/latest, aktualizacje same,
   ikona przy zegarku, start z Windows, powiadomienia (test po przerwie,
   codzienne o powtórkach), codzienne kopie do folderu. Wydanie: `npm run wydaj`.
5. **Następnie:** spis w Nauce — zwijane sektory i drugi tryb (liniowy:
   prosty / szczegółowy jak w Linii).
6. **Później:** połączenie z Focusem, mapa jako tablica, telefon w obie
   strony, statystyki.

Reszta kolejki, po nauce:

1. **Układ paska bocznego** — obecny jest doraźny; do przemyślenia (inspiracja
   Obsidianem: ustawienia na dole, przyciski tworzenia nad listą).
2. **Tworzenie powiązań** — osobna mapa pojęć zamiast wycofanych paneli.
3. **Szybkie wstawianie środowisk** (twierdzenie, dowód □) w edytorze.
4. **Pełny LaTeX / TikZ** — najbardziej ryzykowny element stacku, patrz niżej.
5. **Synchronizacja i telefon** — na telefonie priorytet to *czytanie* ścieżek,
   nie edycja mapy; tryb offline z późniejszą synchronizacją.

---

## Decyzje rozstrzygnięte

- **2026-11-09 — System nauki.** Jednostką nauki jest sektor, nie fiszka;
  powtórka zero z przerwą przed testem; zwykła powtórka bez czatu,
  rozszerzona co 3. (przy dalekich terminach co 2.); FSRS z celem 95%;
  słabe kafelki osobno, aż dogonią sektor; próg obciążenia tylko informuje.
  Szczegóły: [VISION.md](VISION.md) §5.
- **2026-08-03 — Grupowanie.** Scalanie to zabieg **estetyczny**: grupa czyta się
  jak jeden blok wybranego typu, a kafelki w środku tracą własne ramki i tytuły.
  W bazie pozostają osobnymi kafelkami.
- **2026-08-02/03 — Synteza wielu źródeł.** Trzy warstwy (źródło / wiedza /
  kompozycja), źródłem może być kafelek, jeden kafelek = jeden byt, powiązania na
  trzech osiach z zawężeniem do wersji, uogólnienie przykrywa przypadki szczególne.
  Szczegóły: [VISION.md](VISION.md) §2.
- **2026-07-31 — Dowody.** Nie osobny typ kafelka, tylko **strona kafelka** o dowolnej
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
| Program na Windows | Tauri 2 (WebView2, instalator NSIS, aktualizacje podpisane) | działa od 2026-11-19 |
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

- Automatyczne fiszki z kafelków (tryb „zakryj dowód"), powtórki rozłożone w czasie.
- Eksport ścieżki do pełnego LaTeX-a (gotowy skrypt akademicki).
- Współdzielenie ścieżek z innymi.
