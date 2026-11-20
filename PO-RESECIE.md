# Po resecie komputera — jak wrócić do pracy

Wszystko, czego potrzeba, jest w prywatnym repozytorium
**https://github.com/Scepeczki/Kompendium** (kod, dokumenty, pamięć Claude'a).
Notatki są tylko u ciebie (przeglądarka / program) i w twoich kopiach zapasowych.

## Przed resetem (raz)

1. **Kopia notatek.** Notatki NIE są w plikach projektu — siedzą w przeglądarce.
   W Kompendium: **Ustawienia → Dane → „⬇ Eksportuj kopię"**. Powstaje plik
   `kompendium-RRRR-MM-DD.zip` (kafelki, ścieżki, PDF-y, nauka i powtórki,
   ustawienia).
   - W **programie Kompendium na Windows** kopie robią się same, codziennie, w
     `Dokumenty\Kompendium\Kopie` (folder zmienisz w Ustawienia → Program).
     Wystarczy zabrać najnowszy plik.
2. **Klucz do aktualizacji programu:** skopiuj folder `C:\Users\<ty>\.tauri\`
   (pliki `kompendium.key` i `kompendium.key.pub`) na pendrive / Dysk Google.
   Bez niego nowa wersja się zbuduje, ale zainstalowane programy jej nie
   przyjmą (trzeba by je odinstalować i zainstalować od nowa).
3. Zachowaj plik(i) na Dysku Google / pendrivie. Notatek nie wysyłamy na
   GitHub — tam jest tylko program.

## Po resecie

1. Zainstaluj: **Git**, **Node.js** (LTS), **Claude Code**, przeglądarkę **Brave**
   (na niej chodzą testy automatyczne) i Firefoksa.
2. Pobierz projekt:
   ```
   git clone https://github.com/Scepeczki/Kompendium.git C:\Projects\Kompendium
   cd C:\Projects\Kompendium\app
   npm install --legacy-peer-deps
   npm run build
   npm run preview -- --port 5173
   ```
   Aplikacja: `http://localhost:5173`.
3. **Notatki z powrotem:** Ustawienia → Dane → „⬆ Wczytaj kopię" i wybierz plik zip.
4. **Pamięć Claude'a** (co ustaliliśmy, jak pracujemy): skopiuj pliki z
   `docs/pamiec-claude/` do
   `C:\Users\<twoja nazwa>\.claude\projects\c--Projects-Kompendium\memory\`.
   Ustawienia uprawnień Claude'a (`.claude\settings.local.json`) nie są w
   repozytorium (jest publiczne) — po resecie Claude zapyta o zgody od nowa.
5. **Wydawanie programu na Windows** (tylko jeśli chcesz wydawać nowe wersje):
   zainstaluj Rust (`winget install Rustlang.Rustup`) i Microsoft C++ Build
   Tools (`winget install Microsoft.VisualStudio.2022.BuildTools` z zestawem
   „Programowanie aplikacji klasycznych w C++”), włóż klucz z powrotem do
   `C:\Users\<ty>\.tauri\`, a potem `npm run wydaj`.
   Samo **używanie** programu tego nie wymaga — instalator jest na
   https://github.com/Scepeczki/Kompendium/releases/latest
6. Otwórz Claude Code w `C:\Projects\Kompendium` i napisz, że wracamy po
   resecie — opis projektu jest w `VISION.md`, `ROADMAP.md`, `SLOWNIK.md`,
   a stan nauki w `docs/pamiec-claude/project-system-nauki.md`.

## Gdzie skończyliśmy (2026-11-15)

- System nauki gotowy (sektory, powtórka zero, czat, zadania, „Doucz nowe",
  powtórki FSRS), panel PDF pamięta miejsce.
- Następny krok: przebudowa **mapowania** według projektów grafika.
  Opis dla grafika: https://claude.ai/artifact/GP8yxrLiz8Gp8UXoCTUK1e
- Do sprawdzenia przez Ciebie: „Przerwij naukę", pytania w zakładce Mapa,
  „Doucz nowe", pamięć panelu PDF, test czatem w Gemini, telefon w ciemnym
  motywie.

## Program na Windows

Kompendium to program: instalator na https://github.com/Scepeczki/Kompendium/releases/latest,
skrót na pulpicie i w menu Start zakłada instalator. Notatki przenosisz kopią
zapasową (Ustawienia → Dane), kopie robią się same w `Dokumenty\Kompendium\Kopie`.
