---
name: project-system-nauki
description: "System nauki/powtórek (sektory, powtórka zero, FSRS, czat, zadania, douczanie, tryb mapowania) — stan na 2026-11-19"
metadata:
  node_type: memory
  type: project
  originSessionId: aa0469f7-ff5b-4897-a86d-3ce9f069d361
  modified: 2026-11-21T18:58:27.991Z
---

Kompendium ma tryb nauki typu Anki: NOTOWANIE → NAUKA → UTRWALENIE. Pełny opis: VISION.md §5, SLOWNIK.md §2a, kolejka w ROADMAP.md.

Stan (2026-11-19):
- Widok Nauka (runda 3, 2026-11-19): z lewej spis w sektorach, w środku oś „Sektory" (karta rozwija się z zakładkami stron), z prawej SAME sektory bez zakładek; mapa sektora tylko przez kartę → tryb mapowania. „Pełnej linii" w Nauce już nie ma (użytkownik: niepotrzebna). Zwykła Linia NIE pokazuje pasm sektorów (użytkownik: mylą).
- Powtórka zero: mapowanie → przerwa → test → czat → zadania → test końcowy; „Przerwij naukę" (mapy zostają).
- Tryb mapowania (2026-11-19, wg projektu „runda 2" z artefaktu https://claude.ai/artifact/6i7UkNUvxSyJdM4Apa4x6u): okno na cały ekran, strony Kafelki (źródło obok mapy kafelka, przełącznik „Zakryte" wspólny dla kafelków) / Całość sektora / Przegląd (mapy zwijane, wybór zapamiętany); szuflady podglądu Ścieżka (Linia/Nauka, dowolna ścieżka) i Biblioteka; pasek edytora mapy; luka „??"; ściąga pod żarówką. Mapy kafelków w `mapyKafelkow`. Tablica (mapa ze strzałkami) — jeszcze nie.
- Cel nauki i ściąga do mapowania słowami użytkownika (naukaUstawienia: PYTANIA_DOMYSLNE, SCIAGA_DOMYSLNA) — nie parafrazować ich.
- Zadania, „Doucz nowe", panel PDF pamięta miejsce.
- Ustawienia → Próba (2026-11-21): powiadomienia na pokaz, test zakryty i test czatem z dogrywką na kopii sektora; zapis przez `naProbe()` (transakcja wycofywana) — baza bez zmian.
- Test czatem wg specyfikacji użytkownika (2026-11-21, wersja 1.0.7): ocena łączna = gorsza z zakrytego i czatu (czat tylko obniża; karta FSRS liczona raz z `PamiecKafelka.przed`); NIESPRAWDZONY = brak oceny; luki „- Nazwa: brak" → `lukiKafelkow` → wymagania „z czatu:" (znikają po Tak w teście zakrytym albo po sprzeciwie); bramka: etap czat do ZALICZONE; dogrywki nie ruszają terminów; limit dogrywek (ustawienie `limitDogrywek`, dom. 2) → `przemapowanie` kafelków z NIE → przerwa → krótki test (bez zmiany terminów) → znowu dogrywka; „Nie zgadzam się" = wybór własnej oceny Tak/Częściowo/Nie, BEZ uzasadnienia (użytkownik 2026-11-22: nikt go nie czyta), twoja ocena zastępuje ocenę czatu; po zapisie z lukami: podsumowanie luk przy kafelkach → kroki Popraw mapy → Dogrywka → Wklej; „Pomiń czat" zostaje, ale z kosztem (`czatNastepnym` → najbliższa powtórka rozszerzona z czatem); w rozszerzonej bez bramki, dogrywka dobrowolna. Cel pamięci zostaje 95% (użytkownik odrzucił 90%). Test: `scripts/test-czat-bramka.mjs`. Próba ma gotowe podsumowania do kliknięcia i ma wyglądać jak prawdziwa nauka (cały ekran), nie jak okienko w Ustawieniach. Wersja 1.0.8.
- Testy chodzą na Edge (KOMP_PRZEGLADARKA może podmienić); Brave po resecie nie ma.

Ustalone z użytkownikiem (nie wracać do tego): zwykła powtórka bez czatu; rozszerzona (czat/zadania/trudny) co 3., przy dalekich co 2., nigdy w pierwszych 2–3; pole odpowiedzi przed odsłonięciem, podejrzenie = „Nie"; pytania to ściąga, nie szablon, i normalnie ich nie widać (rozwijane z ikony); cel 95% (do 97%); „ile dziś/jutro" zamiast limitu; czat egzaminator (głównie Gemini), polecenie pojawia się po mapowaniu i teście z pamięci; zadania = metoda, nie liczenie; odrzucone zadania mieszane z wielu sektorów; mało tekstu objaśniającego w interfejsie (użytkownik rozumie system).

**Why:** użytkownik chce uczyć się i utrwalać w Kompendium, nie tylko notować.
**How to apply:** historia powtórek dopisywana, nie zmieniana. W Linii nic nie może stać MIĘDZY segmentami (pomiar wysokości) — dodatki do środka segmentu. Menu wewnątrz segmentu przez portal. Pliki w repo mają CRLF — łatki robić na LF i zapisywać CRLF. Zob. [[project-sciezka-nie-rusza-klocka]], [[feedback-ustawienia]], [[feedback-no-delete-existing]].
