---
name: feedback-no-delete-existing
description: Kategoryczny zakaz usuwania już istniejących danych/plików użytkownika bez pytania
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a419b176-5d2e-43ea-b17c-91f9c0797d08
  modified: 2026-07-31T11:24:05.557Z
---

Nigdy nie usuwaj już istniejących ścieżek, klocków, PDF-ów (danych w aplikacji
Kompendium) ani plików projektu bez wyraźnego zapytania użytkownika i uzyskania
zgody — nawet gdy masz pełne uprawnienia (`bypassPermissions`, patrz
[[feedback-bypass-permissions]]).

**Why:** Użytkownik nadał pełne uprawnienia (brak promptów o zgodę na żadne
narzędzie), żeby przyspieszyć pracę nad drobnymi poprawkami. W zamian postawił
jeden twardy warunek: usuwanie już stworzonych rzeczy jest kategorycznie
zakazane, bo bez promptów nie ma już naturalnej okazji, żeby złapać taki błąd
zanim się wydarzy.

**How to apply:**
- Dotyczy: ścieżek (paths), klocków (concepts/versions), PDF-ów w bibliotece,
  folderów z zawartością, plików w repozytorium (kod, dokumenty, itp.).
- Nie dotyczy: plików tymczasowych/testowych/scratch, które sam utworzyłem
  w tej samej sesji (np. `scripts/debug-*.mjs`, tymczasowe zrzuty ekranu) —
  te mogę czyścić swobodnie, bo są moje robocze artefakty, nie dane użytkownika.
- Jeśli zadanie wymagałoby usunięcia czegoś istniejącego (np. refaktor każący
  skasować stary plik, duplikat danych testowych w aplikacji) — zawsze najpierw
  zapytaj, nawet jeśli technicznie mam do tego uprawnienia.
- Destrukcyjne operacje gita (reset --hard, force push) też się w to wliczają —
  ogólna zasada bezpieczeństwa i tak by je pokrywała, ale ten zakaz to
  potwierdza jako priorytet nadrzędny.
