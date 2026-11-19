---
name: project-system-nauki
description: "System nauki/powtórek (sektory, powtórka zero, FSRS, czat, zadania, douczanie, tryb mapowania) — stan na 2026-11-19"
metadata:
  node_type: memory
  type: project
  originSessionId: aa0469f7-ff5b-4897-a86d-3ce9f069d361
---

Kompendium ma tryb nauki typu Anki: NOTOWANIE → NAUKA → UTRWALENIE. Pełny opis: VISION.md §5, SLOWNIK.md §2a, kolejka w ROADMAP.md.

Stan (2026-11-19):
- Sektory, widok Nauka (środek „Sektory", przełącznik „Pełna linia"), Linia w Nauce tylko do czytania; zwykła Linia NIE pokazuje pasm sektorów (użytkownik: mylą).
- Powtórka zero: mapowanie → przerwa → test → czat → zadania → test końcowy; „Przerwij naukę" (mapy zostają).
- Tryb mapowania (2026-11-19, wg projektu „runda 2" z artefaktu https://claude.ai/artifact/6i7UkNUvxSyJdM4Apa4x6u): okno na cały ekran, strony Kafelki (źródło obok mapy kafelka, zakrywanie) / Całość sektora / Przegląd; szuflady podglądu Ścieżka (Linia/Nauka, dowolna ścieżka) i Biblioteka; pasek edytora mapy; luka „??"; ściąga pod żarówką. Mapy kafelków w `mapyKafelkow`. Tablica (mapa ze strzałkami) — jeszcze nie.
- Cel nauki i ściąga do mapowania słowami użytkownika (naukaUstawienia: PYTANIA_DOMYSLNE, SCIAGA_DOMYSLNA) — nie parafrazować ich.
- Zadania, „Doucz nowe", panel PDF pamięta miejsce.
- Testy chodzą na Edge (KOMP_PRZEGLADARKA może podmienić); Brave po resecie nie ma.

Ustalone z użytkownikiem (nie wracać do tego): zwykła powtórka bez czatu; rozszerzona (czat/zadania/trudny) co 3., przy dalekich co 2., nigdy w pierwszych 2–3; pole odpowiedzi przed odsłonięciem, podejrzenie = „Nie"; pytania to ściąga, nie szablon, i normalnie ich nie widać (rozwijane z ikony); cel 95% (do 97%); „ile dziś/jutro" zamiast limitu; czat egzaminator (głównie Gemini), polecenie pojawia się po mapowaniu i teście z pamięci; zadania = metoda, nie liczenie; odrzucone zadania mieszane z wielu sektorów; mało tekstu objaśniającego w interfejsie (użytkownik rozumie system).

**Why:** użytkownik chce uczyć się i utrwalać w Kompendium, nie tylko notować.
**How to apply:** historia powtórek dopisywana, nie zmieniana. W Linii nic nie może stać MIĘDZY segmentami (pomiar wysokości) — dodatki do środka segmentu. Menu wewnątrz segmentu przez portal. Pliki w repo mają CRLF — łatki robić na LF i zapisywać CRLF. Zob. [[project-sciezka-nie-rusza-klocka]], [[feedback-ustawienia]], [[feedback-no-delete-existing]].
