/** Wspólne pomocniki testów.
 *
 *  Tworzenie folderu i ścieżki nie chodzi już przez systemowy `prompt`,
 *  tylko przez własne okienko nazwy (z wyborem znaczka) — stąd `nazwij`. */

/** Wypełnia otwarte okienko nazwy i zapisuje. */
export async function nazwij(page, name) {
  await page.waitForSelector('.name-dialog-input')
  await page.fill('.name-dialog-input', name)
  await page.click('.name-dialog button:has-text("Zapisz")')
  await page.waitForTimeout(350)
}

/** Nowy folder w pasku bocznym, od razu nazwany. */
export async function nowyFolder(page, name) {
  await page.click('.sidebar-create-btn[title="Nowy folder"]')
  await nazwij(page, name)
}

/** Nowa ścieżka w pasku bocznym, od razu nazwana. */
export async function nowaSciezka(page, name) {
  await page.click('.sidebar-create-btn[title*="Nowa ścieżka"]')
  await nazwij(page, name)
}
