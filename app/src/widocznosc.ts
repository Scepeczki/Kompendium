import { db, updateVersion } from './db'
import type { BlockVersion, Subpage } from './types'

/** Widoczność stron kafelka w teście zakrytym.
 *
 *  Domyślnie test zakrywa cały kafelek: widzisz nazwę i sam przypominasz
 *  sobie treść. Stronę można odsłonić — wtedy jest podpowiedzią widoczną od
 *  początku, a zakryte zostaje reszta. Zadanie ma od razu odsłoniętą stronę
 *  główną (polecenie); rozwiązania, ile by ich nie było, są zakryte. */
export const glownaWidoczna = (v: BlockVersion | undefined, typ: string | undefined, typZadania: string) =>
  v?.glownaWTescie ?? typ === typZadania

export const stronaWidoczna = (s: Subpage) => !!s.wTescie

/** Przełącza widoczność strony (null = główna) w danej wersji kafelka. */
export async function ustawWidocznosc(versionId: string, stronaId: string | null, widoczna: boolean) {
  if (stronaId) await db.subpages.update(stronaId, { wTescie: widoczna, updatedAt: new Date().toISOString() })
  else await updateVersion(versionId, { glownaWTescie: widoczna })
}
