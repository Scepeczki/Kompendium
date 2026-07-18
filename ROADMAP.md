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

## Etap 2 — Wersjonowanie i powiązania

- [ ] Wersje klocka: „utwórz nową wersję na podstawie źródła X"; stare wersje widoczne
  w historii pojęcia.
- [ ] Linki między klockami (Twierdzenie → używa → Definicja); panel „co się do tego odnosi".
- [ ] Widok grafu powiązań (mapa łączeń: co, jak i gdzie).

---

## Etap 3 — Poziom Przestrzenny: Ścieżki

- [ ] Canvas: przeciąganie klocków jako kafelków, łączenie strzałkami.
- [ ] Tkanka łączna: luźny tekst-intuicja na mapie, należący do ścieżki.
- [ ] Wybór wersji klocka per ścieżka.
- [ ] Fuzja bloków w obrębie ścieżki.
- [ ] **Generowanie skryptu**: ścieżka → jeden ciągły dokument → eksport PDF.

---

## Etap 4 — Hybrydowy edytor i dopieszczenie

- [ ] Tryb WYSIWYG (à la Google Docs) ↔ tryb kodu (à la Overleaf), przełączany w locie.
- [ ] Dopracowana typografia i estetyka (motyw jasny/ciemny, spokojna paleta).
- [ ] Skróty klawiszowe, szybkie wstawianie środowisk (twierdzenie, dowód □).

---

## Etap 5 — Synchronizacja i telefon

- [ ] Sync w czasie rzeczywistym między urządzeniami.
- [ ] Interfejs mobilny: na telefonie priorytet to **czytanie i powtórka ścieżek**,
  nie pełna edycja canvasu.
- [ ] Tryb offline z późniejszą synchronizacją.

---

## Pomysły na później (świadomie odłożone)

- Active Recall na sterydach: automatyczne generowanie fiszek z klocków (tryb „zakryj dowód").
- Spaced repetition na ścieżkach.
- Eksport ścieżki do pełnego LaTeX-a (gotowy skrypt akademicki).
- Współdzielenie ścieżek z innymi.
