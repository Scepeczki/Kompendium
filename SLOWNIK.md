# Kompendium — Słownik pojęć

> Po co to jest: żebyśmy mówili o tym samym tymi samymi słowami. Gdy nazwa
> w rozmowie, w interfejsie i w kodzie się rozjeżdżają, kończy się to
> nieporozumieniem i przerabianiem tego samego dwa razy.
>
> **Zasada:** obowiązuje nazwa z kolumny „Nazwa". Jeśli w kodzie jest inaczej,
> jest to odnotowane — kodu nie zmieniamy pochopnie, bo nazwy pól siedzą
> w zapisanych danych.

---

## 1. Warstwa wiedzy — co gromadzimy

| Nazwa | Co to jest | Czym NIE jest |
|---|---|---|
| **Kafelek** | Najmniejszy zbiór informacji uznany za jeden byt. Ma typ, nazwę, tagi i wersje. To podstawowa jednostka całego systemu. | Nie jest akapitem z książki ani „notatką" — jeden akapit autora może dać trzy kafelki. |
| **Typ kafelka** | Rola logiczna kafelka: fabrycznie Definicja, Twierdzenie, Lemat, Przykład, Uwaga. Steruje barwą i etykietą wszędzie w aplikacji. **Lista typów jest danymi** — w Ustawieniach → Typy kafelków można dodać własne (Aksjomat, Kontrprzykład…), przemianować, przemalować i schować. | Nie jest tagiem — tag opisuje dziedzinę, typ opisuje rolę logiczną. Nie jest „kafelkiem" ani „bloczkiem" — kafelek to kafelek położony na mapie ścieżki. |
| **Wersja** | Inne ujęcie **tego samego** kafelka (np. „wg Rudina" obok „z wykładu"). Treść żyje wyłącznie w wersjach; stare są tylko do odczytu. | Nie służy do trzymania różnych bytów (język 1. i 2. rzędu to osobne kafelki, nie wersje jednego). |
| **Strona kafelka** | Dodatkowa treść obok głównej — najczęściej „Dowód", ale nazwa jest dowolna. Strony są wspólne dla wszystkich wersji. | Nie jest osobnym kafelkiem ani wersją. |
| **Strona główna** | Pierwsza strona kafelka, domyślnie „Treść"; nazwę można zmienić (np. „Sformułowanie"). | — |
| **Źródło** | Odpowiedź na pytanie „skąd to wiem". Dwa rodzaje: **wycinek PDF** (strona + prostokąt) albo **inny kafelek**. Źródła należą do wersji, więc są wspólne dla wszystkich jej stron. | Nie jest kopią treści — to odnośnik; wycinek renderuje się z PDF na żądanie. |
| **Genealogia wiedzy** | Łańcuch źródeł: kafelek podsumowujący → kafelki z książek → wycinki stron. Powstaje sam, gdy źródłem bywa kafelek. | — |
| **Powiązanie** | Relacja **między** kafelkami na jednej z trzech osi (niżej). Można ją zawęzić do konkretnej wersji. | Nie jest wiki-linkiem — link to odnośnik w tekście, powiązanie to zapisany fakt o relacji bytów. |
| **Wiki-link** | `[[Nazwa]]` w treści; klik nawiguje do kafelka, brakujący można utworzyć klikiem. | — |
| **Odwołania** | Lista kafelków, które linkują do bieżącego (odwrotność wiki-linków). | — |

### Trzy osie powiązań

| Oś | Znaczenie | Etykiety |
|---|---|---|
| **Zawieranie** (mereologia) | To jest pojęciową częścią tamtego. | „zawiera" / „jest częścią" |
| **Skala** (taksonomia i wnioskowanie) | To jest mocniejsze/szczegółowsze od tamtego; z mocniejszego wynika słabsze. | „mocniejsze niż" / „słabsze niż" |
| **Perspektywa** (epistemologia) | Dwa spojrzenia na ten sam zbiór znaczeń — to samo, czym wersje są wewnątrz jednego kafelka. | „inna perspektywa" (symetryczna) |

---

## 2. Warstwa kompozycji — jak to układamy

| Nazwa | Co to jest | Czym NIE jest |
|---|---|---|
| **Ścieżka** | Kompozycja kafelków w materiał do nauki — własna kolejność przez wiedzę. Żyje w tym samym drzewie folderów co kafelki. | Nie ma własnej kopii treści: w Linii pisze się wprost w kafelku, ale **zmiana idzie do kafelka w bazie**, więc widać ją wszędzie. |
| **Kafelek** | Kafelek pokazany **w ścieżce** (na mapie albo jako segment w linii). Wskazuje wersję i stronę do pokazania. | Nie jest kafelkiem — usunięcie kafelka nie rusza kafelka w bazie. |
| **Grupa** | Kilka kafelków pokazanych razem pod jedną nazwą nadaną w tej ścieżce; czyta się jak jeden blok wybranego typu, a kafelki w środku tracą własne ramki i tytuły. | Nie scala kafelków w bazie — to wyłącznie sposób pokazania. |
| **Rozdział / podrozdział / sekcja** | Nagłówek dzielący ścieżkę na części (trzy poziomy). Zasila spis treści. | — |
| **Notatka** | Luźny tekst należący do ścieżki — intuicja, tkanka łączna między kafelkami. Trafia do skryptu. | Nie modyfikuje kafelków. |
| **Komentarz** | Uwaga na marginesie ścieżki. **Nie trafia do skryptu** — to notka robocza. | — |
| **Strzałka** | Logiczna kolejność między kafelkami na mapie; przy rozgałęzieniu numer ustala priorytet. | — |
| **Spis treści** | Konspekt ścieżki z rozdziałów; klik przenosi do miejsca, można go schować. | — |

### Trzy widoki ścieżki

| Widok | Do czego służy |
|---|---|
| **Mapa** | Przestrzenne układanie: kafelki i strzałki na nieskończonej tablicy. Tu się buduje strukturę. |
| **Linia** | Doklejanie segmentów jeden pod drugim — i **warsztat**: tytuły i treść zmienia się wprost w kafelkach, bez otwierania edytora. |
| **Skrypt** | Gotowy, ciągły dokument do czytania i druku (tylko odczyt). |
| **Nauka** | Linia z sektorami i panelem nauki obok: spis po sektorach, mapa sektora, pytania, postęp powtórki zero. |

---

## 2a. Nauka i powtórki

| Nazwa | Co to jest | Czym NIE jest |
|---|---|---|
| **Sektor** | Spójna grupa kafelków w Linii ścieżki, której uczy się razem. Ma nazwę, mapę i własny termin powtórki. W jednej ścieżce kafelek należy najwyżej do jednego sektora. | Nie jest rozdziałem — rozdział porządkuje tekst, sektor porcję nauki (można je zrobić z rozdziałów jednym kliknięciem). |
| **Mapa sektora** | Najprostsza forma przedstawienia sektora: tekst, punkty, wzory, zdjęcie. Nie stoi w Linii, otwiera się z boku. | Nie jest Mapą ścieżki (widokiem z kafelkami i strzałkami). |
| **Pytania nauki** | Jedna lista celów i pytań (sens, struktura, metodyka…). W mapowaniu do wglądu, w teście jako polecenia, w czacie jako zakres. | Nie jest szablonem do wypełniania. |
| **Powtórka zero** | Pierwsza nauka sektora: mapowanie → przerwa → test → test czatem → zadania → test końcowy (czat i zadania można pominąć). | — |
| **Zadanie sektora** | Kafelek ze stronami Treść / Rozwiązanie / Metoda, przypięty do sektora; mieszka w folderze ścieżki. W Linii w zwiniętym pasku „Zadania" na końcu sektora. W teście widać treść, metodę odtwarzasz z pamięci. | Nie jest węzłem Linii — nie trafia do Skryptu ani PDF. Odpięcie nie usuwa kafelka. |
| **Test końcowy** | Ostatni krok powtórki zero: zakryty test całego sektora, już z zadaniami. Nie zmienia terminu z pierwszego testu. | — |
| **Powtórka** | Zakryj, napisz z pamięci, odsłoń, oceń. Termin liczy FSRS. | — |
| **Powtórka rozszerzona** | Co jakiś czas dłuższa powtórka: czat, zadania (gdy sektor je ma) albo trudny tryb, na zmianę. | Nie co dzień i nigdy w pierwszych dwóch powtórkach. |
| **Trudny tryb** | Zakryte są też nazwy kafelków — przypominasz sobie, co w ogóle stoi w sektorze. | — |
| **Pojedyncza fiszka** | Kafelek uczony osobno, poza sektorem; można zakryć tylko jedną stronę (np. dowód). | — |
| **Słaby kafelek** | Kafelek, który nie szedł w powtórce sektora; ma własne, krótsze terminy, aż dogoni sektor. Słabość liczy się we wszystkich ścieżkach. | — |
| **Uparty kafelek** | Kafelek z wieloma wpadkami — sygnał, że trzeba go przemapować (rozbić, dodać przykład). | — |
| **Cel zapamiętania** | Szansa, że pamiętasz w chwili powtórki (domyślnie 95%). Między powtórkami pamiętasz więcej. | — |
| **Próg obciążenia** | Minuty dziennie, powyżej których aplikacja odradza (nie blokuje) zaczynanie nowego sektora. | Nie jest dziennym limitem powtórek. |

---

## 3. Praca ze źródłami

| Nazwa | Co to jest |
|---|---|
| **Biblioteka PDF** | Lista wrzuconych PDF-ów z folderami (jeden poziom). |
| **Podpięcie źródła** | Zaznaczenie prostokątem fragmentu strony → odnośnik w kafelku. Działa też na skanach bez warstwy tekstu. |
| **Mapa wykorzystanych fragmentów** | Prostokąty na stronach PDF pokazujące, co już gdzieś wykorzystano; klik otwiera kafelek. |

---

## 4. Nazwy wycofane i rozbieżności

Te słowa padały wcześniej — zostawiamy je tu, żeby nie wracały jako zagadka:

| Dawna nazwa | Obowiązuje | Dlaczego zmiana |
|---|---|---|
| **Fuzja**, „scalony blok" | **Grupa** | „Fuzja" sugerowała zlanie kafelków w jeden byt; chodzi o wspólne pokazanie. *W kodzie pole nadal nazywa się `fusion` — zapisane ścieżki go używają.* |
| **Tkanka łączna** | **Notatka** | Ta sama rzecz; w interfejsie od początku jest „Notatka". |
| **Context-Lock** | **Źródło** (wycinek PDF) | Nazwa z pierwszej wizji; dziś źródłem bywa też kafelek, więc szersze słowo pasuje lepiej. |
| **Magazyn Atomowy / Poziom Przestrzenny** | **warstwa wiedzy / warstwa kompozycji** | Prościej i zgodnie z trójwarstwowym modelem z [VISION.md](VISION.md) §2. |
| **Dowód** jako typ kafelka | **Strona kafelka** o nazwie „Dowód" | Dowód należy do twierdzenia, nie jest osobnym bytem obok niego. *Typ „Dowód" istnieje nadal, ale startuje schowany — można go odsłonić w Ustawieniach.* |
| **Intuicja** jako typ kafelka | **Notatka** w ścieżce | Intuicja jest sposobem opowiedzenia, nie osobnym bytem wiedzy. *Jak wyżej: typ zostaje, schowany.* |
| **Bloczek**, „blok" o typie | **Typ kafelka** | „Blok" mówi o wyglądzie w Skrypcie, a nie o roli logicznej. Kafelek to z kolei kafelek położony na mapie ścieżki — trzy różne rzeczy. |

---

## 5. Nazwy w kodzie (dla orientacji)

| Rozmowa | Kod / baza |
|---|---|
| kafelek | `Concept` (tabela `concepts`) |
| wersja | `BlockVersion` (`versions`) |
| strona kafelka | `Subpage` (`subpages`) |
| źródło | `SourceRef` = `PdfSourceRef` \| `BlockSourceRef` (w polu `sourceRefs` wersji) |
| powiązanie | `Relation` (`relations`) |
| ścieżka | `LearningPath` (`paths`) |
| kafelek | `PathNodeBlock` |
| grupa | `PathNodeFusion` (*nazwa historyczna*) |
| rozdział | `PathNodeHeading` |
| notatka / komentarz | `PathNodeText` / `PathNodeComment` |
