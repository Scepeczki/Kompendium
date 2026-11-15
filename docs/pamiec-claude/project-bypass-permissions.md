---
name: project-bypass-permissions
description: Kompendium ma bypassPermissions ustawiony lokalnie — zero promptów o zgodę
metadata: 
  node_type: memory
  type: project
  originSessionId: a419b176-5d2e-43ea-b17c-91f9c0797d08
  modified: 2026-07-31T11:24:23.163Z
---

Projekt Kompendium (`c:\Projects\Kompendium`) ma w
`.claude\settings.local.json` ustawione `permissions.defaultMode:
"bypassPermissions"` oraz `skipDangerousModePermissionPrompt: true` —
żadne narzędzie (Bash, edycje, zapisy) nie pyta już o zgodę w tej pracy.

**Why:** Użytkownik poprosił o to wprost, żeby drobne poprawki i szlif szły
bez przerywania promptami. Plik jest lokalny (w `.gitignore`, nieśledzony).

**How to apply:** Mimo braku promptów, obowiązuje twardy warunek —
patrz [[feedback-no-delete-existing]] (zakaz kasowania istniejących
danych/plików bez pytania). Jeśli w nowej sesji `.claude` nie było widziane
od startu, watcher konfiguracji może nie działać od razu — w razie promptów
mimo ustawienia, poinformować użytkownika, że warto zrestartować sesję.
