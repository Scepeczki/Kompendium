# Kompendium — Wizja projektu

> Cyfrowe laboratorium myśli: system do budowania osobistego kompendium wiedzy od zera,
> z bezkompromisowym oparciem każdego twierdzenia na materiale źródłowym.

---

## 1. Główna motywacja i filozofia

Tradycyjne książki i notatniki są **liniowe i statyczne** — narzucają jedną kolejność
i zamykają wiedzę w sztywnych rozdziałach. Mózg tak nie działa; myśli tworzą sieć połączeń.

Cel projektu:

- **Nieliniowe powiązania** — wiedza jako graf, nie jako lista rozdziałów.
- **Bezkompromisowe źródłowanie** — każde zdanie ma odpowiedź na pytanie *„skąd ja to wiem?"*.
- Nauka rzeczy **trudnych, logicznych i strukturalnych** — nacisk na nauki ścisłe:
  matematykę, fizykę, inżynierię.

### Czym to jest lepsze od zwykłej książki? (uczciwa odpowiedź)

To pytanie padło i zasługuje na poważną odpowiedź. Książka jest lepsza w jednym:
autor przemyślał kolejność za Ciebie. Kompendium wygrywa tam, gdzie książka nie sięga:

1. **Synteza wielu źródeł** — jedna definicja może mieć wersję z książki A i B;
   książka daje Ci tylko swoją.
2. **Twoja kolejność** — możesz zbudować własną ścieżkę przez materiał
   (np. „szybka powtórka do egzaminu" vs „pełny wykład od podstaw").
3. **Historia zrozumienia** — system rejestruje, jak ewoluowało Twoje rozumienie pojęcia.
   Książka nie wie, że czegoś kiedyś nie rozumiałeś.
4. **Sam akt budowania** — przepisanie, rozbicie na atomy i połączenie wiedzy
   to jest nauka. Produkt (kompendium) jest w połowie pretekstem do procesu.
5. **Wyszukiwalność i powiązania** — „gdzie jeszcze używam metryki?" — jedna sekunda,
   nie kartkowanie trzech książek.

**Ryzyko do zapamiętania:** łatwo wpaść w pułapkę *budowania systemu do nauki zamiast nauki*.
Dlatego MVP ma być mały i używalny szybko (patrz [ROADMAP.md](ROADMAP.md)).

---

## 2. Architektura systemu — rozdzielenie treści od formy

System ma **dwa poziomy**: Magazyn Atomowy (czysta wiedza) i Poziom Przestrzenny
(komponowanie jej w całość).

### Poziom 1: Baza Atomowa („Magazyn Kafelków")

Wiedza rozbita na najmniejsze niezależne jednostki — **Kafelki Wiedzy**.
Każdy kafelek to osobny obiekt w bazie:

| Element | Opis |
|---|---|
| **Typ kafelka** | Ścisła kategoryzacja: `Definicja`, `Twierdzenie`, `Dowód`, `Przykład` (+ ew. `Lemat`, `Uwaga`, `Intuicja`) |
| **Metadane** | Unikalna nazwa, tagi (np. `#matematyka`, `#topologia`), data utworzenia |
| **Wersjonowanie** | Wiele wersji tego samego pojęcia — np. v1 na bazie Książki A, v2 uzupełniona po Książce B. System rejestruje **ewolucję zrozumienia**, stare wersje nie znikają |
| **Context-Lock (osadzenie w źródle)** | Każde zdanie/dowód można podpiąć bezpośrednio pod materiał źródłowy — precyzyjny wycinek strony PDF (screenshot regionu + odnośnik: plik, strona, współrzędne). Kontekst nigdy nie ginie |

### Poziom 2: Poziom Przestrzenny (Ścieżki i Kompozycja)

Kafelki są surowcem; z nich buduje się **Ścieżki** (skrypty nauki).

- **Nieskończona tablica (Canvas)** — ścieżki projektuje się przestrzennie:
  kafelki jako kafelki, połączone strzałkami ustalającymi logiczną kolejność.
  Z gotowej ścieżki system generuje **jeden ciągły tekst** (eksport do PDF / skrypt wykładu).
- **Tkanka łączna (Intuicja)** — między sztywnymi kafelkami użytkownik dopisuje na mapie
  luźny tekst budujący intuicję i spajający całość. Ten tekst należy do ścieżki,
  **nie modyfikuje** oryginalnych kafelków w bazie.
- **Fuzja bloków** — kilka kafelków na mapie (np. *Definicja Przestrzeni* + *Definicja Metryki*)
  można scalić w danej ścieżce w jeden bloczek (*Przestrzeń Metryczna*),
  **bez niszczenia ich atomowości** w bazie głównej.
- **Wybór wersji** — ścieżka wskazuje konkretną wersję każdego kafelka
  (np. „w tym skrypcie używam definicji zwartości wg Rudina, nie wg wykładu").

### Kluczowa zasada

> **Kafelek w bazie jest niezmienny przez ścieżki.** Ścieżka to widok/kompozycja,
> nie edytor treści. Edycja kafelka = nowa wersja kafelka.

### Trzy warstwy (doprecyzowanie po zderzeniu z praktyką)

Przy budowaniu podsumowania z dwóch książek okazało się, że dwie warstwy to
za mało. Naprawdę są trzy i mylenie ich jest źródłem problemów:

| Warstwa | Co to jest | Atomowa? |
|---|---|---|
| **Źródło** | co autor napisał w jednym miejscu | **nie** — jeden akapit może definiować 3 byty |
| **Wiedza** | kafelek = jeden byt | **tak** |
| **Kompozycja** | jak to pokazujemy w ścieżce | **nie** — tu się scala i grupuje |

Konsekwencje:

- **Źródłem może być kafelek**, nie tylko wycinek PDF. Robiąc podsumowanie,
  źródłami są własne kafelki z wcześniejszych etapów. Powstaje **genealogia
  wiedzy**: podsumowanie → kafelek z książki A → wycinek strony 214.
- **Autor definiujący 3 byty naraz** → 3 kafelki, ten sam wycinek PDF podpięty
  pod każdy. Atomowość zostaje, źródło się nie dubluje.
- **Brzydko wygląda osobno w ścieżce** → od tego jest **scalanie**: kilka
  kafelków pokazywanych jako jeden blok danego typu (np. jedno twierdzenie
  z dwóch twierdzeń), bez naruszania atomowości w bazie.

### Powiązania kafelków — trzy osie

Wersje mówią „to samo pojęcie, inne ujęcie". Nie wystarczają, gdy różne byty
mają się do siebie w określony sposób (definicja ogólna a jej przypadki
szczególne — to są **różne obiekty**, nie wersje jednego). Stąd trzecia
konstrukcja obok wersji i wiki-linków — relacje na trzech osiach:

1. **Zawieranie (mereologia)** — „to jest pojęciową częścią tamtego".
2. **Skala (taksonomia i wnioskowanie)** — „to jest mocniejsze/szczegółowsze
   od tamtego"; z mocniejszego wynika słabsze.
3. **Perspektywa (epistemologia)** — „dwa spojrzenia na ten sam zbiór znaczeń";
   to samo, czym wersje są wewnątrz jednego kafelka.

**Relacja może dotyczyć konkretnej wersji**, bo jedna perspektywa kafelka bywa
uogólnieniem, a inna nie. Relacje żyją w warstwie wiedzy — raz zapisane, widać
je wszędzie: w mini-mapie przy kafelku, jako przerywane strzałki na mapie ścieżki
i pod treścią bloku przy czytaniu (kafelek ogólny **przykrywa** swoje przypadki
szczególne — są wypisane i rozwijalne w miejscu, bez wchodzenia w ścieżkę).

*Świadomie poza modelem:* prerekwizyt („żeby to zrozumieć, znaj najpierw tamto")
to oś **dydaktyczna**, nie ontologiczna — do rozważenia osobno przy porządkowaniu
ścieżek.

---

## 3. Interfejs i wymagania techniczne

1. **Hybrydowy edytor tekstu** — bazowo prosty i czysty jak Google Docs (WYSIWYG),
   ale w każdej chwili można przełączyć na **widok kodu** (Markdown/LaTeX)
   i pisać bezpośrednio ze źródła. Oba widoki są równoprawne.
2. **Potężny LaTeX** — dwa poziomy:
   - *Wzory* (inline `$...$`, display, `align`, `cases`) — renderowane natychmiastowo
     podczas pisania.
   - *Pełny LaTeX jak w Overleafie* — zaawansowana grafika (**TikZ**, `pgfplots`,
     diagramy przemienne itd.) z możliwością dociągania pakietów jak w Overleafie.
     W notatkach ma się dać wygenerować „niezwykle wiele rzeczy matematycznych".
     Wynik kompilacji jest cache'owany (SVG), żeby telefon nie musiał nic kompilować.
3. **Pełna synchronizacja multiplatformowa** — komputer + telefon, edycja w czasie
   rzeczywistym, zmiana na jednym urządzeniu natychmiast widoczna na drugim.
4. **Estetyka jako wymaganie pierwszej klasy** — środowisko ma być *przyjemne*:
   przejrzyste, spokojne typograficznie, bez wizualnego szumu. To nie dodatek — to powód,
   dla którego będzie się chciało do niego wracać.
5. **Praca z PDF (Context-Lock, doprecyzowane)** — wrzucamy PDF do aplikacji
   (albo linkujemy własny). Podczas tworzenia kafelka zaznaczamy w PDF-ie fragment
   **prostokątem** — celowo nie zaznaczeniem tekstu, bo PDF może być zbiorem skanów/zdjęć
   bez warstwy tekstowej. Z kafelka można z takiego linku **bezpośrednio skoczyć**
   do zaznaczonego miejsca w PDF-ie (właściwa strona + podświetlony prostokąt).

---

## 4. Decyzje (rozstrzygnięte)

- [x] **Build vs. adapt** → **BUILD**. Budujemy od zera, nie adaptujemy istniejących narzędzi.
- [x] **Stack technologiczny** → web app (PWA), szczegóły w [ROADMAP.md](ROADMAP.md) Etap 0.
  Twarde ograniczenie: **zero kosztów** — wyłącznie darmowe biblioteki i darmowe tiery usług.
- [x] **Format przechowywania** → wszechstronny i oszczędny: treść jako Markdown+LaTeX
  (tekst = grosze pamięciowo), metadane jako JSON. Odnośniki do PDF przechowywane jako
  **współrzędne** (plik, strona, prostokąt), nie jako zapisane obrazy — wycinek renderuje się
  z PDF na żądanie. Oszczędza to pamięć (istotne na telefonie) i zachowuje żywy link do źródła.
- [x] **Model wersjonowania** → jawne wersje: „zapisz jako v2". Użytkownik świadomie
  tworzy nową wersję pojęcia; stare zostają w historii.
- [x] **Zakres MVP** → ROADMAP.md Etap 1. Uwaga: „szybko używalne" rozumiemy jako
  *najpierw najważniejszy fundament*, nie jako cięcie jakości.
- [x] **Nazwa** → **Kompendium** (robocza; zmiana później nie ma znaczenia).

### Wciąż otwarte

- [ ] **Wygląd tablicy (canvas)** — czym i jak mają wyglądać ścieżki na mapie; do ustalenia
  przy Etapie 3 (będą prototypy do porównania).
- [ ] **Mechanizm sync** — do rozstrzygnięcia przy Etapie 5; kierunek: notatki (tekst) są
  malutkie i sync-uje się je łatwo, ciężkie PDF-y trzymane w chmurze / pobierane na żądanie,
  żeby nie zapychać pamięci telefonu.

---

## 5. Nauka i utrwalanie (ustalone 2026-11-09)

Kompendium nie kończy się na notatkach. Droga jest trzystopniowa:
**NOTOWANIE → NAUKA → UTRWALENIE**. Notowanie to kafelki i ścieżki. Nauka
i utrwalanie to system powtórek w duchu Anki, ale dla wiedzy strukturalnej.

### Co ma umieć ten, kto się nauczył

Przywołać sens treści, strukturę relacji w niej i metodykę (z jej
konsekwencjami), wyjaśnić konsekwencje definicji, podać przykłady zastosowań
albo uogólnień i podać strukturalne uzasadnienie treści, jeśli jest znane.
Ta lista (połączona z pytaniami mapowania) jest **jedna**, stoi
w Ustawieniach i służy trzem rzeczom: wsparciu przy mapowaniu (do wglądu,
nie jako szablon do wypełniania — mapowanie zawsze jest bez schematu),
poleceniom w teście i poleceniu dla czatu.

### Sektor zamiast pojedynczej fiszki

Uczenie się kafelek po kafelku jest niewykonalne, więc jednostką nauki jest
**sektor**: spójna grupa kafelków w Linii ścieżki. W jednej ścieżce kafelek
należy najwyżej do jednego sektora. Kafelki spoza sektorów można uczyć się
osobno jako **pojedyncze fiszki**. Sektor ma rozsądną wielkość (podpowiedź
3–12 kafelków; ostrzeżenie informuje, nie blokuje).

Środek widoku **Nauka** to domyślnie **Sektory**: ścieżka jako jedna oś, kafelek to kulka i zwarta karta (rodzaj, nazwa, dwie linijki treści, znaczki: strony, słaby, do poprawy; klik rozwija), rozdział to kreska z tytułem, sektor to gruby barwny odcinek z nagłówkiem (kafelki, zadania, etap), a zadania z paska stoją na jego końcu. Zaznacza się przeciąganiem po osi. Przełącznik „Sektory / Pełna linia” wraca do zwykłej Linii.

W widoku **Nauka** Linia jest tylko do czytania; pod prawym przyciskiem są
sprawy sektorów (sektor z rozdziału, dodaj / wyjmij, nowe zadanie). Sektor
robi się z zaznaczonych, z rozdziału, albo jako pusty i wtedy wybiera się
kafelki klikaniem. **Przegląd** pokazuje całą Linię jako linię z kuleczkami:
kafelek to kulka, rozdział to kreska z podpisem, sektor to barwny odcinek;
zaznacza się w nim przeciąganiem. Notatki i rozdziały w środku sektora nie
przerywają jego pasma.

### Powtórka zero (pierwsza nauka sektora)

1. **Mapowanie**: przedstawia, kluczowe pojęcia, zakres, celowość, sens
   struktury, granice, połączenia, przykład i kontrprzykład, mapa
   (najprostsza forma). Mapę najlepiej robić z dystansu od źródła. Przed
   startem aplikacja uprzedza, ile czasu trzeba na całość.
2. **Przerwa 20–30 min**: test odblokowuje się po 20 min, w 25. przychodzi
   powiadomienie. Zaraz po nauce wszystko „siedzi" w głowie i test mierzyłby
   to, a nie pamięć (efekt opóźnionej oceny).
3. **Test zakryty**: kafelki i mapa zakryte. Najpierw **piszesz**
   odpowiedź, dopiero potem odsłaniasz. Odsłonięcie jest oceną kafelka
   (Tak / Częściowo / Nie); podejrzenie przed przypomnieniem = „Nie". Ocenę
   sektora podpowiadają zaznaczenia. Źle → wracasz do mapowania tylko tych
   miejsc.
4. **Test czatem** (etap 2): jedno stałe polecenie, czat jest egzaminatorem,
   nie nauczycielem. Wynik źle → luki → poprawka mapowania → dogrywka tylko
   z luk.
5. **Zadania** (opcjonalne, można je pominąć jednym kliknięciem): z
   podręcznika albo własne. Zadanie to kafelek ze stronami
   Treść / Rozwiązanie (rodzaju „Zadanie"); mieszka w folderze ścieżki i jest przypięte
   do sektora. W Linii stoi w zwiniętym pasku „Zadania" na końcu sektora,
   do Skryptu ani PDF nie trafia. Rozwiązanie (z tokiem rozumowania) wchodzi
   do treści sektora (także tej dla czatu); metodę warto przeanalizować i dopisać do
   mapy. Zadanie z paska da się wstawić do Linii, a kafelek „Zadanie" z Linii
   przenieść do paska.
6. **Test końcowy**, zakryty, już z zadaniami: treść zadania widać, rozwiązanie
   odtwarzasz z pamięci (chodzi o pomysł i tok rozumowania, nie o liczenie).
   Kafelek rodzaju „Zadanie" stojący w Linii sektora w teście też wygląda jak zadanie.
   Termin z pierwszego testu zostaje. Zaliczony → sektor idzie do powtórek;
   niezaliczony → poprawiasz zaznaczone miejsca i robisz go jeszcze raz.

### Powtórki

Zwykła powtórka jest bez czatu: zakryj, napisz, odsłoń, oceń. **Co jakiś
czas** powtórka jest **rozszerzona** (czat, zadania albo trudny tryb, na
zmianę; zadania tylko w sektorze, który je ma — po kilka naraz, za każdym
razem kolejne), nigdy w pierwszych dwóch: domyślnie co 3. powtórkę, a gdy terminy
się oddalą (ponad 60 dni), co 2. Terminy liczy **FSRS** (darmowy algorytm
z Anki) przy celu **95%**, ustawialnym do 97%.

- Sektor ocenia się większością; **słaby kafelek** ma własne, krótsze
  terminy, aż dogoni sektor. Słabość kafelka liczy się we wszystkich
  ścieżkach.
- **Uparty kafelek** (wiele wpadek) → „przemapuj go: rozbij, dodaj
  przykład, dopisz do mapy".
- Zmieniony sektor dostaje znaczek; można go „nauczyć od nowa". Nowy
  kafelek w nauczonym sektorze uczy się osobno. Usunięcie sektora nigdy nie
  usuwa kafelków, a historia zostaje.
- Strona Powtórek pokazuje, **ile dziś i ile jutro łącznie** (bez dziennego
  limitu); czego nie zrobisz, przechodzi dalej. Opuszczone dni nie zerują
  nauki — spóźniona, a zdana powtórka wydłuża odstęp.
- **Próg obciążenia** (minuty dziennie) tylko informuje przy rozpoczynaniu
  nowego sektora; powtórek nie da się obciąć bez zapominania, da się
  pilnować wejścia nowego materiału.

Symulacja (FSRS, sektor 7 kafelków, cel 95%): nowy sektor codziennie to po
roku ok. 2 h powtórek dziennie, co dwa dni ok. 1 h. Obciążenie robią
głównie sektory z ostatnich miesięcy.

**Świadomie odrzucone:** zadania mieszane z wielu sektorów. **Później:**
mapa jako tablica ze strzałkami, nauka na telefonie (tam głównie czytanie;
historia powtórek jest zapisywana tak, żeby dało się ją potem łączyć).

---

## 6. Czym to NIE jest

- To nie jest kolejny generyczny notatnik „do wszystkiego" — jest wyspecjalizowany
  w wiedzy strukturalnej (definicja → twierdzenie → dowód → przykład).
- To nie jest menedżer zadań, kalendarz ani dziennik.
- To nie jest (przynajmniej na początku) narzędzie do współpracy wieloosobowej —
  jeden użytkownik, wiele urządzeń.
