# Po resecie komputera — jak wrócić do pracy

Wszystko, czego potrzeba, jest w prywatnym repozytorium
**https://github.com/Scepeczki/Kompendium** (kod, dokumenty, pamięć Claude'a
i — jeśli ją tu wrzucisz — kopia notatek w folderze `kopie/`).

## Przed resetem (raz)

1. **Kopia notatek.** Notatki NIE są w plikach projektu — siedzą w przeglądarce.
   W Kompendium: **Ustawienia → Dane → „⬇ Eksportuj kopię"**. Powstaje plik
   `kompendium-RRRR-MM-DD.zip` (kafelki, ścieżki, PDF-y, nauka i powtórki,
   ustawienia).
   - Zrób to **w każdym miejscu, w którym pisałeś**: w wersji lokalnej
     (`http://localhost:5173` w Firefoksie) i w wersji z internetu
     (`https://scepeczki.github.io/Kompendium-web/`) — każda ma własne dane.
2. Wrzuć plik(i) do folderu `C:\Projects\Kompendium\kopie\` i poproś Claude'a
   o wysłanie na GitHub. Albo zachowaj je na pendrivie / Dysku Google.
   GitHub przyjmie plik do 100 MB — przy dużych PDF-ach lepiej pendrive.

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
   `docs/pamiec-claude/` (oprócz `settings.local.json`) do
   `C:\Users\<twoja nazwa>\.claude\projects\c--Projects-Kompendium\memory\`.
   Plik `settings.local.json` skopiuj do `C:\Projects\Kompendium\.claude\`.
5. Otwórz Claude Code w `C:\Projects\Kompendium` i napisz, że wracamy po
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
