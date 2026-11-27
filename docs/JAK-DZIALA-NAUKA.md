# Jak działa system powtórek w Kompendium

Opis stanu z wersji 1.0.25 (27.11.2026). Spisany z kodu (`app/src/nauka.ts`,
`app/src/naukaUstawienia.ts`, `app/src/components/SesjaNauki.tsx`), nie z planów.

## 1. Pojęcia

- **Kafelek**: jedna porcja wiedzy (definicja, twierdzenie, zadanie…) w Linii ścieżki.
- **Sektor**: grupa kafelków ze ścieżki, uczona razem. To podstawowa jednostka nauki.
  Sektor ma **jeden wspólny termin** powtórki. Kafelek może należeć tylko do jednego
  sektora w danej ścieżce.
- **Fiszka**: pojedynczy kafelek uczony samodzielnie, poza sektorem. Ma własny termin
  i nigdy nie jest „słaba".
- **Pamięć kafelka**: każdy kafelek, który był już oceniany, ma osobny zapis: własną
  kartę FSRS, własny termin, znacznik „słaby", licznik wpadek i sektor, do którego należy.
- **Słaby kafelek**: kafelek z sektora, który poszedł gorzej. Dostaje własne powtórki
  przed sektorem, aż go „dogoni".

## 2. Algorytm terminów: FSRS

Terminy liczy **FSRS** (biblioteka `ts-fsrs`, ten sam algorytm co w Anki). Każda
karta (sektora, fiszki i każdego kafelka osobno) pamięta:

- **stabilność**: po ilu dniach szansa przypomnienia spada do celu,
- **trudność**,
- liczbę powtórek i pomyłek oraz datę ostatniej powtórki.

Po każdej ocenie FSRS wylicza nowy termin. Ustawienia FSRS w programie:

| Ustawienie | Wartość | Znaczenie |
|---|---|---|
| Cel zapamiętania | 95% (do zmiany: 80–97%) | Szansa, że pamiętasz w chwili powtórki. Wyżej = częściej. |
| Losowy rozrzut („fuzz") | włączony | Terminy lekko się rozjeżdżają, żeby nie zbijały się w jeden dzień. |
| Kroki krótkoterminowe | wyłączone | Terminy tylko w pełnych dniach. Powtarzanie tego samego dnia robią mapowanie i test, nie FSRS. |

Ocena ma cztery stopnie: **1 Nie pamiętam, 2 Trudno, 3 Dobrze, 4 Łatwo**.

Dni liczone są **kalendarzowo** (czas lokalny). Termin „jutro" obowiązuje przez cały
jutrzejszy dzień, a nie od tej samej godziny.

## 3. Pierwsza nauka sektora: „powtórka zero"

Nowy sektor przechodzi etapy:

1. **Mapowanie**: robisz mapę sektora (sens, struktura, połączenia, przykłady) i mapy
   kafelków, wspierając się ściągą.
2. **Przerwa**: test odblokowuje się dopiero po 20 minutach (ustawienie), żeby nie
   sprawdzać tego, co jeszcze „siedzi" w głowie. Po 25 minutach przychodzi powiadomienie.
3. **Test zakryty** (opis w p. 5):
   - poszło źle (ocena 1) → sektor **wraca do mapowania** tylko tych kafelków, które
     nie poszły. Termin nie powstaje i pamięci kafelków nie zapisuje się;
   - zaliczony → sektor dostaje pierwszą kartę FSRS i termin, kafelki dostają swoje karty.
4. **Test czatem** (można wyłączyć w ustawieniach): rozmowa z czatem sprawdza każdy
   kafelek. Czat może **obniżyć** ocenę z testu zakrytego (p. 7). Kiedy czat znajdzie
   luki, wraca **dogrywka** (kolejny czat z samych luk).
5. **Zadania i test końcowy** (można pominąć): zadania sektora, potem test zakryty
   z zadaniami. Zaliczony kończy powtórkę zero. Niezaliczony zostawia sektor przy
   zadaniach z zaznaczonymi miejscami do poprawy. Test końcowy **nie rusza** terminów.

Po powtórce zero sektor przechodzi na etap **powtórek** i od tej pory pojawia się
według terminu.

## 4. Codzienny plan: co pokazuje „na dziś"

Plan dnia (`planNauki`) zbiera:

1. **Sektory i fiszki**, których termin to dziś albo wcześniej (zaległe).
2. **Nowe kafelki dołożone do nauczonego sektora**: jeszcze bez pamięci, uczy się ich
   osobno („Doucz nowe"). Wyjątek: jeśli sektor i tak jest dziś, nowe wchodzą w jego
   powtórkę.
3. **Słabe kafelki**, których własny termin to dziś albo wcześniej. Wyjątek: **jeśli ich
   sektor jest dziś do powtórki, kafelek nie pojawia się osobno**, bo i tak zostanie
   sprawdzony w powtórce sektora.
   **Kilka słabych z jednego sektora to jedna pozycja** („Słabe kafelki (2)") i jeden
   wspólny test zakryty. Każdy kafelek dostaje w nim własną ocenę i własny termin.
4. Kafelki w toku (mapowanie, przerwa, czat, zadania) idą do osobnej listy „w toku".

Kolejność na liście: od tego, co **najsłabiej pamiętasz**. Decyduje szansa
przypomnienia wyliczona przez FSRS na teraz, od najniższej.

Czas szacowany jest z twojej historii, a domyślnie wynosi: sektor 3 min + 1,2 min na
kafelek, pojedynczy kafelek ok. 1,5 min, powtórka rozszerzona +5 min.

## 5. Test zakryty: jak wygląda i jak się ocenia

Dla każdego kafelka:

1. Piszesz z pamięci, co pamiętasz (pole na odpowiedź).
2. Odsłaniasz treść:
   - **Sprawdź**, gdy już sobie przypomniałeś,
   - **Podejrzyj**, gdy nie pamiętasz. To liczy się od razu jako „Nie".
3. Zaznaczasz: **Tak / Częściowo / Nie**.

W teście sektora dochodzi **mapa sektora z pamięci** (sens i struktura: Tak / Częściowo / Nie).

Test kafelków osobno (jeden albo kilka słabych z jednego sektora) i test fiszki to ten
sam ekran, tylko z tymi pozycjami. Nie ma w nim mapy sektora ani etapów powtórki zero.
W teście kafelków osobno nie wybiera się oceny ani liczby dni: każdy kafelek ma ocenę
ze swojego zaznaczenia, a pod testem widać, co z nim będzie (p. 6).

### Ocena kafelka

| Zaznaczenie | Ocena FSRS kafelka |
|---|---|
| Tak | 3 (Dobrze) |
| Częściowo | 2 (Trudno) |
| Nie / Podejrzane | 1 (Nie pamiętam) |

### Ocena sektora (podpowiedź, którą możesz zmienić)

Liczy się odsetek kafelków, które **nie** poszły (Częściowo albo Nie):

| Warunek | Podpowiedź |
|---|---|
| ponad 50% nie poszło (ustawienie „Nie pamiętam od") | 1 Nie pamiętam → sektor wraca do mapowania tych miejsc |
| do 20% nie poszło (ustawienie „Dobrze do") | 3 Dobrze |
| pomiędzy | 2 Trudno |
| mapa sektora nie na „Tak", a wyszło „Dobrze" | obniżone do 2 Trudno |
| czat znalazł luki, a wyszło Dobrze/Łatwo | obniżone do 2 Trudno |

Podpowiedź jest zaznaczona na przyciskach, ale wybierasz sam spośród czterech ocen,
również **4 Łatwo**. Wybrana ocena idzie do karty FSRS **sektora**.

## 6. Słabe kafelki: kiedy kafelek jest słaby i jak goni sektor

Zasada ogólna: słaby kafelek **goni sektor**. Idzie własną osią zapominania (FSRS),
dopóki „wartościowo" nie dogoni sektora, a wtedy **wpada do sektora** i dalej idzie
z nim. Nigdy go nie wyprzedza.

### W sesji sektora: kiedy kafelek staje się słaby

Sektor i wszystkie jego kafelki ocenia się w tej samej chwili. Dla każdego kafelka:

- **ocena 1 (Nie)** → słaby, zawsze;
- **czat obniżył** mu ocenę do Częściowo albo Nie → słaby, zawsze;
- **ocena 2 (Częściowo)** → słaby, jeśli jego termin z FSRS wypada **przed** nowym
  terminem sektora;
- był słaby i dostał **Tak** → zostaje słaby, dopóki jego termin z FSRS jest przed
  terminem sektora;
- fiszki nigdy nie są słabe.

Kafelek, który **nie jest słaby, idzie z sektorem**: jego termin to zawsze termin sektora.

### Pierwszy powrót słabego: przed sektorem

FSRS potrafi dać słabemu kafelkowi **ten sam dzień co sektorowi**. Wtedy kafelek nie
miałby kiedy się doćwiczyć. Dlatego termin słabego **z sesji sektora** (także po obniżce
czatem) jest przycinany:

```
dni       = dni od powtórki do terminu sektora
wcześniej = max(1, zaokrąglij(dni × 50%))        ← ustawienie „Słaby kafelek wcześniej o"
dzień     = powtórka + max(1, dni − wcześniej)

termin słabego = wcześniejszy z: (termin z FSRS, dzień)
```

- przycina się tylko **w dół**: jeśli FSRS dał wcześniejszy dzień, zostaje FSRS;
- co najmniej **1 dzień przed** sektorem i nie wcześniej niż **dzień po** powtórce;
- gdy sektor jest już **nazajutrz**, wcześniej się nie da i kafelek wchodzi w jego powtórkę;
- karta FSRS kafelka zostaje bez zmian, zmienia się tylko dzień pojawienia się.

Przykłady (powtórka sektora 26.11, ustawienie 50%):

| Termin sektora | Termin z FSRS | Termin słabego | Dlaczego |
|---|---|---|---|
| 28.11 | 28.11 | **27.11** | 2 dni → 1 dzień wcześniej |
| 06.12 | 05.12 | **01.12** | 10 dni → 5 dni wcześniej |
| 06.12 | 28.11 | **28.11** | FSRS dał wcześniej, zostaje |
| 27.11 | 27.11 | **27.11** | sektor nazajutrz, wcześniej się nie da |

### Słaby powtarzany osobno: goni sektor, aż go dogoni

Test słabego (albo kilku słabych z jednego sektora). Sektor nie jest wtedy powtarzany
i **jego termin się nie zmienia**. Dla każdego kafelka:

1. Ocena z zaznaczenia: Tak 3 / Częściowo 2 / Nie 1. Nie ma wyboru oceny ani liczby dni.
2. FSRS liczy nowy odstęp kafelka (jego własna oś zapominania).
3. Porównanie **wartości**, a nie dat: odstęp kafelka z **odstępem sektora** (dni od
   ostatniej powtórki sektora do jego terminu).
   - **Tak** i odstęp kafelka ≥ odstęp sektora → **dogonił**. Przestaje być słaby
     i dostaje **termin sektora**. Pod testem widać: „dogonił sektor — idzie z nim (jutro)".
     Dalej już nie ma, kafelek nie może wyprzedzić sektora.
   - inaczej → **dalej słaby**, z własnym terminem z FSRS: „wraca za N dni, dalej słaby".
     Ten termin może wypaść nawet **po** terminie sektora. To nie jest wyprzedzanie:
     kafelek nie dogonił sektora wartościowo, a w dniu sektora i tak wejdzie w jego
     powtórkę.

Przykład 1. Sektor ma odstęp 2 dni (26.11 → 28.11), kafelek dziś (27.11) dostał Tak,
a FSRS daje mu 2 albo więcej dni. Dogonił, więc termin to 28.11, z sektorem, już nie słaby.

Przykład 2. Sektor ma odstęp 20 dni i termin za 3 dni, kafelek dostał Tak, a FSRS daje
mu 5 dni. 5 < 20, czyli nie dogonił, więc zostaje słaby z terminem za 5 dni. Za 3 dni
wejdzie w powtórkę sektora i tam dostanie nową ocenę.

Ta sama zasada dotyczy **nowych kafelków** dołożonych do nauczonego sektora („Doucz nowe").

### Kiedy to się przelicza

Po każdym teście, po czacie, przy starcie programu i po zmianie ustawień. Kafelki
niesłabe dostają termin sektora, a słabe z sesji sektora są przycinane. Słabych
powtarzanych osobno nic nie przesuwa, bo idą własną osią.

## 7. Czat a oceny kafelków

W teście czatem powtórki zero każdy kafelek ma **ocenę łączną**: gorszą z dwóch,
z testu zakrytego i z czatu. Jeśli czat obniżył ocenę, karta kafelka jest **liczona
od nowa z tamtego dnia** z niższą oceną, a kafelek staje się słaby.

Czat zapisuje też **luki** przy kafelkach (wymagania). Twoje „Tak" w kolejnym teście
zakrytym zamyka luki tego kafelka.

Dogrywki: nieudany czat → kolejny czat z samych luk. Po 2 nieudanych dogrywkach z rzędu
(ustawienie) następuje **przemapowanie** kafelków z „Nie": mapowanie tylko ich,
przerwa, krótki test (który **nie rusza** terminów) i znowu dogrywka.

## 8. Powtórki rozszerzone

Co kilka powtórek sektora powtórka jest **rozszerzona**, na zmianę: czat → zadania
(jeśli sektor je ma, 2 kolejne zadania) → trudny tryb (zakryte są też nazwy kafelków).

- nigdy przed 3. powtórką,
- potem co 3 powtórki,
- gdy odstęp sektora przekroczy 60 dni: co 2 powtórki,
- jeśli czat w powtórce zero został pominięty, najbliższa powtórka jest z czatem.

Ocena i termin liczą się tak samo jak w zwykłej powtórce.

## 9. Uparte kafelki

Każde „Nie" przy kafelku, który ma już pamięć (poza powtórką zero), to **wpadka**.
Po 4 wpadkach (ustawienie) program radzi **przemapować** kafelek. Tylko radzi, niczego
sam nie zmienia.

## 10. Inne

- **Naucz od nowa**: sektor wraca do powtórki zero. Historia zostaje.
- **Historia**: każda sesja dopisuje wpis (oceny kafelków, ocena sektora, czas, czat).
  Wpisów nigdy się nie zmienia.
- **Cofanie (Ctrl+Z)** nie obejmuje postępów nauki, bo to wyniki, a nie edycja.

## 11. Ustawienia (Ustawienia → Nauka)

| Ustawienie | Domyślnie |
|---|---|
| Cel zapamiętania | 95% |
| Próg obciążenia (uprzedzenie przy nowym sektorze) | 60 min/dzień |
| Przerwa przed testem | 20 min |
| „Dobrze" do | 20% kafelków źle |
| „Nie pamiętam" od | ponad 50% kafelków źle |
| Słaby kafelek wcześniej o | 50% czasu do sektora |
| Uparty kafelek po | 4 wpadkach |
| Dogrywek najwięcej | 2 nieudane |
| Powtórka rozszerzona od / co / przy dalekich | 3. / co 3 / co 2 (od 60 dni) |
| Zadań w powtórce | 2 |

## 12. Pytania do oceny

Miejsca, w których decyzja jest dyskusyjna:

1. **Jeden termin na cały sektor.** Dobre kafelki powtarzają się w rytmie sektora,
   nawet jeśli FSRS dałby im dłuższy odstęp. Upraszcza to naukę („uczę się działu"),
   ale kosztuje dodatkowe powtórki.
2. **Słaby kafelek znika w dniu sektora.** Jest sprawdzany w powtórce sektora, ale jego
   wynik liczy się do oceny całego sektora.
3. **„Tak" = 3, nigdy 4** dla kafelka. Kafelki nie dostają oceny „Łatwo", więc ich
   własne odstępy rosną wolniej niż przy pełnej skali.
4. **Częściowo przy terminie po sektorze nie robi słabego.** Kafelek „Częściowo" wtedy
   po prostu idzie z sektorem.
5. **Przycięcie o 50%** (tylko pierwszy powrót po sesji sektora). Czy połowa czasu do sektora to dobry odstęp, czy lepiej stała
   liczba dni, albo kilka powtórek słabego przed sektorem?
6. **„Dogonił" = odstęp kafelka ≥ odstęp sektora, i tylko na „Tak".** Czy to dobra miara?
   Można by porównywać stabilność FSRS zamiast odstępów.
