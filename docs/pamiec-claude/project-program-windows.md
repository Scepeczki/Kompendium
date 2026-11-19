---
name: project-program-windows
description: "Kompendium jako program na Windows (Tauri 2) — zasobnik, powiadomienia, kopie w folderze, aktualizacje z Kompendium-web/pobierz; stan 2026-11-19"
metadata:
  node_type: memory
  type: project
  originSessionId: aa0469f7-ff5b-4897-a86d-3ce9f069d361
  modified: 2026-11-19T15:55:57.151Z
---

Od 2026-11-19 Kompendium ma też postać programu na Windows (Tauri 2, `app/src-tauri`). Ten sam kod co strona; most w `app/src/pulpit.ts` (`naPulpicie`).

- Identyfikator `pl.kompendium.app` — NIGDY nie zmieniać (od niego zależy folder z danymi WebView2 w %LOCALAPPDATA%).
- Krzyżyk chowa do zasobnika, „Zakończ" w menu ikony. Autostart z `--w-tle`, włączany przy pierwszym starcie.
- Powiadomienia: test po przerwie + codzienne o powtórkach (`godzinaPowtorek`, domyślnie 18).
- Kopie: codziennie do Dokumenty\Kompendium\Kopie (klucze `pulpit.*`, bez `ui.`, żeby nie jechały z kopią); limit 0 = nic nie kasuje.
- Wydanie: `npm run wydaj` → podbija wersję, buduje NSIS, podpisuje kluczem `C:\Users\scepe\.tauri\kompendium.key` (poza repo!), kładzie do `Kompendium-web/pobierz` (latest.json + instalator) i publikuje. publikuj.mjs nie kasuje `pobierz/`.
- Sprawdzenie programu: `node scripts/sprawdz-program.mjs` (osobne dane przez WEBVIEW2_USER_DATA_FOLDER, CDP na 9333, zdejmuje wpis autostartu).
- Budowanie wymaga Rust + VS Build Tools (zainstalowane 2026-11-19); w PowerShell odświeżyć PATH z rejestru.

Użytkownik: na GitHubie ma być tylko program/instalator, notatki przenosi sam przez chmurę. Focus (jego program na prokrastynację, .NET, C:\Projects\FOCUS) — integracja „może później".

**Why:** użytkownik chciał powiadomień nie do pominięcia, instalatora i aktualizacji zamiast strony w przeglądarce.
**How to apply:** zmiany w kodzie strony działają w obu; rzeczy systemowe tylko przez `pulpit.ts`. Zob. [[project-system-nauki]], [[feedback-no-delete-existing]].
