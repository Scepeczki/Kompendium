---
name: project-sciezka-nie-rusza-klocka
description: "Decyzje użytkownika — poza folderem ścieżki tekst pisany w ścieżce zostaje w ścieżce; kafelek w folderze ścieżki ma jeden tekst z biblioteką (2026-11-04)"
metadata:
  node_type: memory
  type: project
  originSessionId: a419b176-5d2e-43ea-b17c-91f9c0797d08
  modified: 2026-11-04T11:29:26.329Z
---

Kompendium, 2026-08-09: użytkownik rozstrzygnął, że **pisanie w kafelku wewnątrz
ścieżki nie może zmieniać klocka w bibliotece** (treść, tytuł, składniki fuzji,
każda wersja i strona). Skutek: kafelek z własnym tekstem przestaje widzieć
poprawki z biblioteki (plakietka „tekst tej ścieżki", „wróć do klocka").

2026-11-04 doprecyzował: **kafelek w folderze ścieżki** (`Concept.pathId` tej
ścieżki) ma JEDEN tekst — pisanie w ścieżce zmienia bibliotekę i odwrotnie.
Zasada z sierpnia zostaje dla kafelków spoza folderu. Gdy kafelek z własnym
tekstem ścieżki wchodzi do folderu, program pyta, który tekst zachować; drugi
zapisuje jako osobną wersję (src/folderSciezki.ts).

**Dlaczego:** ścieżka ma być miejscem pracy nad tekstem, a folder ścieżki to
miejsce szybkiej wspólnej edycji; poza folderem edycja ma być niewzajemna.

**Jak stosować:** zanim podłączę cokolwiek ze ścieżki do zapisu w
`concepts`/`versions`/`subpages`, sprawdzić, czy kafelek jest w folderze tej
ścieżki.

Zobacz też [[feedback-no-delete-existing]].
