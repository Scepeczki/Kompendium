---
name: project-program-windows
description: "Kompendium jako program na Windows (Tauri 2) — jedno publiczne repo Scepeczki/Kompendium, aktualizacje z Releases, zasobnik, kopie w folderze; stan 2026-11-20"
metadata:
  node_type: memory
  type: project
  originSessionId: aa0469f7-ff5b-4897-a86d-3ce9f069d361
  modified: 2026-11-20T09:14:36.893Z
---

Od 2026-11-19 Kompendium to program na Windows (Tauri 2, `app/src-tauri`). Użytkownik używa już tylko programu (notatki przeniesione 2026-11-20); wersja w przeglądarce niepotrzebna, telefon „na razie nie pisz".

- JEDNO repozytorium: **Scepeczki/Kompendium, publiczne** (od 2026-11-20, historia przepisana: e-mail → noreply, bez settings.local.json). Lokalnie `git config user.email` = 113235133+Scepeczki@users.noreply.github.com — nie zmieniać na gmail.
- Stare: Scepeczki/Kompendium-stare (prywatne, gałąź `dane` z notatkami i starym tokenem) i Kompendium-web — do skasowania (użytkownik zgodził się; potrzebny zakres delete_repo w gh).
- Aktualizacje: endpoint `https://github.com/Scepeczki/Kompendium/releases/latest/download/latest.json`; `npm run wydaj` buduje, podpisuje (`C:\Users\scepe\.tauri\kompendium.key`, poza repo!) i zakłada Release (instalator + latest.json) przez `gh` (zalogowany).
- Identyfikator `pl.kompendium.app` — NIGDY nie zmieniać (folder danych WebView2).
- Krzyżyk → zasobnik; autostart `--w-tle`; powiadomienia (test po przerwie, `godzinaPowtorek`); aktualizacja = pasek w oknie + powiadomienie (nie okienko — przy schowanym oknie nikt go nie widział, to był błąd 1.0.0).
- Kopie codziennie do Dokumenty\Kompendium\Kopie (klucze `pulpit.*`); klucz GitHuba (`ui.telefonToken`) NIE jedzie z kopią; telefon.ts nie wysyła notatek do publicznego repo.
- Sprawdzenie programu: `node scripts/sprawdz-program.mjs` (KOMPENDIUM_PROBA=1 omija „jedną kopię", osobne dane, oddaje wpis autostartu zainstalowanego programu).
- W PowerShell przed cargo/gh odświeżyć PATH z rejestru.

Focus (program użytkownika, .NET, C:\Projects\FOCUS) — integracja „może później".

**Why:** użytkownik chciał programu z powiadomieniami, instalatora, aktualizacji i jednego repozytorium; notatek na GitHubie nie chce.
**How to apply:** zmiany strony działają w programie; rzeczy systemowe tylko przez `pulpit.ts`. Zob. [[project-system-nauki]], [[feedback-no-delete-existing]].
