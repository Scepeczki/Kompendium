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

// Pytania („czy na pewno usunąć") i krótkie pola tekstowe też mają własne
// okienka zamiast systemowych — stąd dwa pomocniki niżej.

/** Potwierdza otwarte pytanie (przycisk po prawej: Usuń / Utwórz / OK). */
export async function potwierdz(page) {
  await page.waitForSelector('.ask-dialog')
  await page.click('.ask-foot .btn:last-child')
  await page.waitForTimeout(300)
}

/** Odrzuca otwarte pytanie. */
export async function anuluj(page) {
  await page.waitForSelector('.ask-dialog')
  await page.click('.ask-foot .btn:first-child')
  await page.waitForTimeout(200)
}

/** Wpisuje tekst w otwarte pytanie o nazwę i zatwierdza. */
export async function podaj(page, text) {
  await page.waitForSelector('.ask-input')
  await page.fill('.ask-input', text)
  await page.click('.ask-foot .btn:last-child')
  await page.waitForTimeout(300)
}
