/** Data zbudowania paczki, wstawiana przez Vite (patrz vite.config.ts).
 *
 *  Pokazujemy ją w nagłówku listy, żeby dało się jednym spojrzeniem
 *  stwierdzić, czy urządzenie ma nową wersję programu, czy trzyma starą
 *  kopię — bez tego „nie działa" jest nie do odróżnienia od „nie doszło". */
declare const __WERSJA__: string
/** Numer wersji programu na Windows (src-tauri/tauri.conf.json). */
declare const __WERSJA_PROGRAMU__: string
