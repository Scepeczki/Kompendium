# Kompendium — Roadmapa

> Zasada nadrzędna: **jak najszybciej dojść do wersji, w której da się realnie uczyć**.
> Każdy etap kończy się czymś używalnym. Unikamy pułapki budowania systemu do nauki
> zamiast nauki (patrz [VISION.md](VISION.md) §1).

---

## Etap 0 — Decyzje fundamentalne ✅ *(rozstrzygnięte)*

- [x] **Build vs. adapt** → BUILD, od zera (VISION.md §4).
- [x] **Stack** → wybrany (tabela niżej). Twarde ograniczenie: **zero kosztów**.
- [ ] Zdefiniować format danych klocka (schemat JSON/frontmatter) — to najtrwalsza
  decyzja w całym projekcie; treść musi przeżyć każdą wersję aplikacji.
  → *pierwsze zadanie Etapu 1*.

**Stack (zdecydowany):**

| Warstwa | Wybór | Dlaczego |
|---|---|---|
| Aplikacja | **React + TypeScript + Vite**, jako PWA | Jeden kod na komputer i telefon; największy ekosystem bibliotek; wszystko darmowe i open-source |
| Edytor — widok wizualny | **TipTap** (nakładka na ProseMirror) | To silnik edytorów „jak Google Docs"; darmowy rdzeń wystarcza |
| Edytor — widok kodu | **CodeMirror 6** | To silnik trybu kodu „jak w Overleafie" (Overleaf faktycznie używa CodeMirror); podświetlanie LaTeX/Markdown |
| Wzory (szybkie) | **KaTeX** | Natychmiastowy rendering `$...$` podczas pisania |
| Pełny LaTeX / TikZ | **Kompilator LaTeX w przeglądarce (WASM: SwiftLaTeX / TeXLive-wasm)** | Prawdziwy silnik TeX działający lokalnie w przeglądarce — TikZ, pgfplots, dociąganie pakietów CTAN na żądanie jak w Overleafie; zero serwera = zero kosztów; wynik cache'owany jako SVG |
| Canvas (Etap 3) | do ustalenia: **React Flow** vs **tldraw** | Zrobimy prototyp obu i wybierzesz wyglądem |
| PDF | **PDF.js** (silnik Firefoksa) | Podgląd PDF + nakładka do zaznaczania prostokątów (Context-Lock); działa też ze skanami bez warstwy tekstu |
| Baza lokalna | **IndexedDB (przez Dexie)** — notatki + metadane + PDF-y | Wbudowana w każdą przeglądarkę, zero instalacji, zero kosztów; działa offline |
| Sync (Etap 5) | kierunek: darmowy tier (np. Supabase 500 MB) na notatki; PDF-y pobierane na żądanie | Notatki to kilobajty — darmowy tier starczy na lata; ciężkie PDF-y nie zapychają telefonu |

**Uczciwa notka o TikZ:** pełny LaTeX w przeglądarce (WASM) to najbardziej ryzykowny
element stacku — działa, ale pierwsza kompilacja bywa wolna (sekundy). Plan: wzory
renderuje KaTeX natychmiast, a bloki `tikz` kompilują się w tle i są cache'owane,
więc wolno jest tylko za pierwszym razem. Jeśli WASM okaże się zbyt toporny,
alternatywą jest darmowy własny mini-serwer kompilacji — decyzja po testach w Etapie 1.

---

## Etap 1 — MVP: Baza Atomowa *(pierwsza używalna wersja)*

Cel: mogę czytać książkę (PDF) i budować z niej klocki wiedzy ze źródłami.

- [ ] Model danych klocka: typ (Definicja/Twierdzenie/Dowód/Przykład), nazwa, tagi, treść.
- [ ] Edytor treści klocka z pełnym wsparciem LaTeX (na start może być sam Markdown+LaTeX,
  hybrydowy WYSIWYG dojdzie w Etapie 3).
- [ ] Import PDF: wrzucenie pliku do aplikacji (przechowywany lokalnie w IndexedDB).
- [ ] Podgląd PDF obok edytora.
- [ ] **Context-Lock v1**: zaznacz **prostokątem** region strony PDF (działa też na skanach
  bez warstwy tekstu) → do klocka podpina się odnośnik (plik, strona, współrzędne prostokąta);
  wycinek renderuje się z PDF na żądanie (nie zapisujemy obrazów — oszczędność pamięci).
  Klik w wycinek → **skok do PDF-a**: właściwa strona + podświetlony prostokąt.
- [ ] Lista/przegląd klocków: filtrowanie po typie i tagach, wyszukiwarka pełnotekstowa.
- [ ] Chronologia: klocki zachowują kolejność powstawania („oś zdobywania wiedzy").

**Kryterium ukończenia:** przerobienie jednego rozdziału prawdziwej książki
wyłącznie w systemie.

---

## Etap 2 — Wersjonowanie i powiązania ✅

- [x] Wersje klocka: „zapisz jako v2" z etykietą (np. „wg Rudina"); stare wersje
  widoczne i tylko do odczytu. *(zrobione już w Etapie 1)*
- [x] Linki między klockami: wiki-linki `[[Nazwa]]` w treści (z aliasem `[[Nazwa|tekst]]`);
  klik nawiguje, brakujące pojęcie można utworzyć klikiem.
- [x] Panel „Odwołania" — co linkuje do tego klocka; klik nawiguje.
- [x] Widok grafu powiązań (🕸): węzły = pojęcia (kolor typu, rozmiar wg liczby powiązań),
  krawędzie = wiki-linki; przeciąganie węzłów, zoom/pan, klik otwiera klocek.

---

## Etap 3 — Poziom Przestrzenny: Ścieżki ✅

- [x] Canvas (React Flow): klocki przeciągane z paska bocznego jako kafelki
  (z podglądem treści i KaTeX), łączone strzałkami logicznej kolejności.
- [x] Tkanka łączna: żółte węzły tekstowe na mapie, należące do ścieżki.
- [x] Wybór wersji klocka per kafelek („zawsze bieżąca" albo konkretna vN).
- [x] Fuzja bloków: Ctrl+klik zaznacza kilka kafelków → „Scal" tworzy wspólny
  bloczek (podwójna ramka); można rozdzielić z powrotem.
- [x] **Generowanie skryptu**: porządek topologiczny wg strzałek (remisy wg
  pozycji na mapie) → jeden ciągły dokument → druk / zapis PDF z przeglądarki.
- [x] Ścieżki żyją w tym samym drzewie folderów co klocki (wspólna kolejność).

---

## Etap 4 — Hybrydowy edytor i dopieszczenie ✅ (rdzeń)

- [x] Tryb WYSIWYG „Wizualny" (TipTap) ↔ „Kod" (CodeMirror) ↔ „Podział",
  przełączane w locie; źródłem prawdy zawsze Markdown+LaTeX. Wzory `$…$`
  renderują się w miejscu w trybie wizualnym; klik we wzór pokazuje kod.
- [x] Motyw jasny/ciemny: przełącznik ☾ w pasku bocznym, start wg preferencji
  systemowej, wybór zapamiętywany.
- [x] Skróty: Ctrl+B/I (pogrubienie/kursywa), Ctrl+M wzór `$…$`,
  Ctrl+Shift+M wzór `$$…$$` (w trybie kodu i oknie notatki); pasek
  formatowania w trybie wizualnym (B, I, nagłówek, listy, cytat, wzory).
- [ ] Szybkie wstawianie środowisk (twierdzenie, dowód □) — wróci razem
  z decyzją o reprezentacji dowodów (sekcja „Do przemyślenia").

---

## Etap 5 — Synchronizacja i telefon

- [ ] Sync w czasie rzeczywistym między urządzeniami.
- [ ] Interfejs mobilny: na telefonie priorytet to **czytanie i powtórka ścieżek**,
  nie pełna edycja canvasu.
- [ ] Tryb offline z późniejszą synchronizacją.

---

## Do przemyślenia

- **Dowody** — ROZSTRZYGNIĘTE (2026-07-31): każdy klocek może mieć dowolnie
  wiele „stron" o dowolnych nazwach (najczęściej „Dowód") — dodatkowe treści
  obok głównej, przełączane listwą z lewej strony edytora. W kafelku ścieżki
  wybiera się stronę pokazywaną bazowo, a w Skrypcie można je przełączać
  zakładkami podczas czytania (bez zmiany ścieżki). Strony są wspólne dla
  wszystkich wersji pojęcia i wchodzą do kopii zapasowej.

## Pomysły na później (świadomie odłożone)

- Active Recall na sterydach: automatyczne generowanie fiszek z klocków (tryb „zakryj dowód").
- Spaced repetition na ścieżkach.
- Eksport ścieżki do pełnego LaTeX-a (gotowy skrypt akademicki).
- Współdzielenie ścieżek z innymi.
