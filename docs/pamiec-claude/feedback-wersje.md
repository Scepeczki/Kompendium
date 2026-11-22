---
name: feedback-wersje
description: "Numeracja wydań Kompendium — podbijać tylko trzecią liczbę (1.0.10, 1.0.11…), 1.1.0 dopiero na znak użytkownika"
metadata:
  node_type: memory
  type: feedback
  originSessionId: aa0469f7-ff5b-4897-a86d-3ce9f069d361
  modified: 2026-11-22T05:18:11.589Z
---

Kolejne wydania podbijają tylko trzecią liczbę: 1.0.9 → 1.0.10 → 1.0.11 itd. (`npm run wydaj` bez argumentu robi właśnie to). Na 1.1.0 przechodzimy dopiero, gdy użytkownik powie, że skończyliśmy (2026-11-22).

**Why:** użytkownik chce, żeby 1.1.0 oznaczało skończony etap prac nad nauką.
**How to apply:** nigdy nie podawać numeru wersji w `wydaj` z własnej inicjatywy. Zob. [[project-program-windows]].
