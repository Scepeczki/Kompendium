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
| **Klocek** | Najmniejszy zbiór informacji uznany za jeden byt. Ma typ, nazwę, tagi i wersje. To podstawowa jednostka całego systemu. | Nie jest akapitem z książki ani „notatką" — jeden akapit autora może dać trzy klocki. |
| **Typ klocka** | Rola logiczna klocka: fabrycznie Definicja, Twierdzenie, Lemat, Przykład, Uwaga. Steruje barwą i etykietą wszędzie w aplikacji. **Lista typów jest danymi** — w Ustawieniach → Typy klocków można dodać własne (Aksjomat, Kontrprzykład…), przemianować, przemalować i schować. | Nie jest tagiem — tag opisuje dziedzinę, typ opisuje rolę logiczną. Nie jest „kafelkiem" ani „bloczkiem" — kafelek to klocek położony na mapie ścieżki. |
| **Wersja** | Inne ujęcie **tego samego** klocka (np. „wg Rudina" obok „z wykładu"). Treść żyje wyłącznie w wersjach; stare są tylko do odczytu. | Nie służy do trzymania różnych bytów (język 1. i 2. rzędu to osobne klocki, nie wersje jednego). |
| **Strona klocka** | Dodatkowa treść obok głównej — najczęściej „Dowód", ale nazwa jest dowolna. Strony są wspólne dla wszystkich wersji. | Nie jest osobnym klockiem ani wersją. |
| **Strona główna** | Pierwsza strona klocka, domyślnie „Treść"; nazwę można zmienić (np. „Sformułowanie"). | — |
| **Źródło** | Odpowiedź na pytanie „skąd to wiem". Dwa rodzaje: **wycinek PDF** (strona + prostokąt) albo **inny klocek**. Źródła należą do wersji, więc są wspólne dla wszystkich jej stron. | Nie jest kopią treści — to odnośnik; wycinek renderuje się z PDF na żądanie. |
| **Genealogia wiedzy** | Łańcuch źródeł: klocek podsumowujący → klocki z książek → wycinki stron. Powstaje sam, gdy źródłem bywa klocek. | — |
| **Powiązanie** | Relacja **między** klockami na jednej z trzech osi (niżej). Można ją zawęzić do konkretnej wersji. | Nie jest wiki-linkiem — link to odnośnik w tekście, powiązanie to zapisany fakt o relacji bytów. |
| **Wiki-link** | `[[Nazwa]]` w treści; klik nawiguje do klocka, brakujący można utworzyć klikiem. | — |
| **Odwołania** | Lista klocków, które linkują do bieżącego (odwrotność wiki-linków). | — |

### Trzy osie powiązań

| Oś | Znaczenie | Etykiety |
|---|---|---|
| **Zawieranie** (mereologia) | To jest pojęciową częścią tamtego. | „zawiera" / „jest częścią" |
| **Skala** (taksonomia i wnioskowanie) | To jest mocniejsze/szczegółowsze od tamtego; z mocniejszego wynika słabsze. | „mocniejsze niż" / „słabsze niż" |
| **Perspektywa** (epistemologia) | Dwa spojrzenia na ten sam zbiór znaczeń — to samo, czym wersje są wewnątrz jednego klocka. | „inna perspektywa" (symetryczna) |

---

## 2. Warstwa kompozycji — jak to układamy

| Nazwa | Co to jest | Czym NIE jest |
|---|---|---|
| **Ścieżka** | Kompozycja klocków w materiał do nauki — własna kolejność przez wiedzę. Żyje w tym samym drzewie folderów co klocki. | Nie jest edytorem treści: **ścieżka nigdy nie zmienia klocka**. |
| **Kafelek** | Klocek pokazany **w ścieżce** (na mapie albo jako segment w linii). Wskazuje wersję i stronę do pokazania. | Nie jest klockiem — usunięcie kafelka nie rusza klocka w bazie. |
| **Grupa** | Kilka klocków pokazanych razem pod jedną nazwą nadaną w tej ścieżce; czyta się jak jeden blok wybranego typu, a klocki w środku tracą własne ramki i tytuły. | Nie scala klocków w bazie — to wyłącznie sposób pokazania. |
| **Rozdział / podrozdział / sekcja** | Nagłówek dzielący ścieżkę na części (trzy poziomy). Zasila spis treści. | — |
| **Notatka** | Luźny tekst należący do ścieżki — intuicja, tkanka łączna między klockami. Trafia do skryptu. | Nie modyfikuje klocków. |
| **Komentarz** | Uwaga na marginesie ścieżki. **Nie trafia do skryptu** — to notka robocza. | — |
| **Strzałka** | Logiczna kolejność między kafelkami na mapie; przy rozgałęzieniu numer ustala priorytet. | — |
| **Spis treści** | Konspekt ścieżki z rozdziałów; klik przenosi do miejsca, można go schować. | — |

### Trzy widoki ścieżki

| Widok | Do czego służy |
|---|---|
| **Mapa** | Przestrzenne układanie: kafelki i strzałki na nieskończonej tablicy. Tu się buduje strukturę. |
| **Linia** | Doklejanie segmentów jeden pod drugim — budowanie skryptu po kolei. |
| **Skrypt** | Gotowy, ciągły dokument do czytania i druku (tylko odczyt). |

---

## 3. Praca ze źródłami

| Nazwa | Co to jest |
|---|---|
| **Biblioteka PDF** | Lista wrzuconych PDF-ów z folderami (jeden poziom). |
| **Podpięcie źródła** | Zaznaczenie prostokątem fragmentu strony → odnośnik w klocku. Działa też na skanach bez warstwy tekstu. |
| **Mapa wykorzystanych fragmentów** | Prostokąty na stronach PDF pokazujące, co już gdzieś wykorzystano; klik otwiera klocek. |

---

## 4. Nazwy wycofane i rozbieżności

Te słowa padały wcześniej — zostawiamy je tu, żeby nie wracały jako zagadka:

| Dawna nazwa | Obowiązuje | Dlaczego zmiana |
|---|---|---|
| **Fuzja**, „scalony blok" | **Grupa** | „Fuzja" sugerowała zlanie klocków w jeden byt; chodzi o wspólne pokazanie. *W kodzie pole nadal nazywa się `fusion` — zapisane ścieżki go używają.* |
| **Tkanka łączna** | **Notatka** | Ta sama rzecz; w interfejsie od początku jest „Notatka". |
| **Context-Lock** | **Źródło** (wycinek PDF) | Nazwa z pierwszej wizji; dziś źródłem bywa też klocek, więc szersze słowo pasuje lepiej. |
| **Magazyn Atomowy / Poziom Przestrzenny** | **warstwa wiedzy / warstwa kompozycji** | Prościej i zgodnie z trójwarstwowym modelem z [VISION.md](VISION.md) §2. |
| **Dowód** jako typ klocka | **Strona klocka** o nazwie „Dowód" | Dowód należy do twierdzenia, nie jest osobnym bytem obok niego. *Typ „Dowód" istnieje nadal, ale startuje schowany — można go odsłonić w Ustawieniach.* |
| **Intuicja** jako typ klocka | **Notatka** w ścieżce | Intuicja jest sposobem opowiedzenia, nie osobnym bytem wiedzy. *Jak wyżej: typ zostaje, schowany.* |
| **Bloczek**, „blok" o typie | **Typ klocka** | „Blok" mówi o wyglądzie w Skrypcie, a nie o roli logicznej. Kafelek to z kolei klocek położony na mapie ścieżki — trzy różne rzeczy. |

---

## 5. Nazwy w kodzie (dla orientacji)

| Rozmowa | Kod / baza |
|---|---|
| klocek | `Concept` (tabela `concepts`) |
| wersja | `BlockVersion` (`versions`) |
| strona klocka | `Subpage` (`subpages`) |
| źródło | `SourceRef` = `PdfSourceRef` \| `BlockSourceRef` (w polu `sourceRefs` wersji) |
| powiązanie | `Relation` (`relations`) |
| ścieżka | `LearningPath` (`paths`) |
| kafelek | `PathNodeBlock` |
| grupa | `PathNodeFusion` (*nazwa historyczna*) |
| rozdział | `PathNodeHeading` |
| notatka / komentarz | `PathNodeText` / `PathNodeComment` |
