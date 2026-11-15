---
name: project-system-nauki
description: "System nauki/powtórek (sektory, powtórka zero, FSRS, czat, zadania, douczanie) — stan na 2026-11-15; czeka na projekty grafika od mapowania"
metadata:
  node_type: memory
  type: project
  originSessionId: aa0469f7-ff5b-4897-a86d-3ce9f069d361
  modified: 2026-11-15T12:43:23.639Z
---

Kompendium ma tryb nauki typu Anki: NOTOWANIE → NAUKA → UTRWALENIE. Pełny opis: VISION.md §5, SLOWNIK.md §2a, kolejka w ROADMAP.md.

Stan (2026-11-15), wszystko opublikowane i wypchnięte na GitHub:
- Sektory, widok Nauka (środek domyślnie „Sektory" — oś z kartami; przełącznik „Pełna linia"), Linia w Nauce tylko do czytania z menu sektorów, Przegląd, pusty sektor + wybieranie klikaniem.
- Powtórka zero: mapowanie → przerwa → test → czat → zadania → test końcowy; „Przerwij naukę" (mapa zostaje); pytania nauki w zakładce Mapa.
- Zadania: kafelek rodzaju Zadanie (Treść/Rozwiązanie, bez Metody, bez generowania czatem), pasek na końcu sektora, do Linii i z powrotem, własna pamięć `zadanie:<id>`.
- „Doucz nowe": nowe kafelki/zadania w nauczonym sektorze → mini powtórka zero; termin sektora zostaje.
- Panel PDF pamięta otwarty plik i miejsce.
- Opis dla grafika (mapowanie jako tryb skupienia, mapa kafelka + mapa sektora, lepszy edytor, chowana biblioteka): https://claude.ai/artifact/GP8yxrLiz8Gp8UXoCTUK1e — następny duży krok to przebudowa mapowania wg projektów grafika.

Ustalone z użytkownikiem (nie wracać do tego): zwykła powtórka bez czatu; rozszerzona (czat/zadania/trudny) co 3., przy dalekich co 2., nigdy w pierwszych 2–3; pole odpowiedzi przed odsłonięciem, podejrzenie = „Nie"; pytania to ściąga, nie szablon; cel 95% (do 97%); „ile dziś/jutro" zamiast limitu; czat egzaminator (głównie Gemini); zadania = metoda, nie liczenie; odrzucone zadania mieszane z wielu sektorów.

**Why:** użytkownik chce uczyć się i utrwalać w Kompendium, nie tylko notować.
**How to apply:** historia powtórek dopisywana, nie zmieniana. W Linii nic nie może stać MIĘDZY segmentami (pomiar wysokości) — dodatki do środka segmentu. Menu wewnątrz segmentu przez portal (content-visibility obcina). Zob. [[project-sciezka-nie-rusza-klocka]], [[feedback-ustawienia]], [[feedback-no-delete-existing]].
