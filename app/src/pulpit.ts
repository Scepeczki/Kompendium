/** Kompendium jako program na Windows (Tauri) — to, czego strona nie umie.
 *
 *  Ten sam kod chodzi i w przeglądarce, i w programie. Wszystko tu sprawdza
 *  najpierw `naPulpicie`; w przeglądarce zostaje stare zachowanie. Paczki
 *  Tauri są ładowane dopiero w programie, strona ich nie ściąga. */

export const naPulpicie = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const komunikat = (tekst: string) =>
  window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: tekst }))

/** Powiadomienie systemowe. W programie: dymek Windows (zostaje w centrum
 *  powiadomień) i miganie ikony na pasku zadań, dopóki nie zajrzysz. */
export interface OpcjePowiadomienia {
  /** Co otworzyć po kliknięciu: 'powtorki', 'aktualizacja' albo nic (samo okno). */
  akcja?: string
  /** Napis na przycisku w okienku. */
  przycisk?: string
}

/** Wygląd powiadomień w programie: własne okienko Kompendium albo dymek Windows. */
export const wygladPowiadomien = (): 'kompendium' | 'windows' =>
  czytaj('pulpit.wygladPowiadomien') === 'windows' ? 'windows' : 'kompendium'
export const ustawWygladPowiadomien = (w: 'kompendium' | 'windows') => zapisz('pulpit.wygladPowiadomien', w)
/** Po ilu sekundach okienko znika; 0 = zostaje, aż klikniesz. */
export const czasPowiadomien = (): number => {
  const v = Number(czytaj('pulpit.czasPowiadomien') ?? '0')
  return Number.isFinite(v) && v >= 0 ? v : 0
}
export const ustawCzasPowiadomien = (s: number) => zapisz('pulpit.czasPowiadomien', String(Math.max(0, Math.round(s))))

export async function powiadom(tekst: string, opcje: OpcjePowiadomienia = {}): Promise<void> {
  if (naPulpicie) {
    try {
      if (wygladPowiadomien() === 'kompendium') {
        const { invoke } = await import('@tauri-apps/api/core')
        const q = new URLSearchParams({
          okno: 'powiadomienie',
          t: tekst,
          a: opcje.akcja ?? '',
          e: opcje.przycisk ?? 'Otwórz',
          z: String(czasPowiadomien()),
        })
        await invoke('pokaz_powiadomienie', { zapytanie: q.toString() })
      } else {
        const n = await import('@tauri-apps/plugin-notification')
        let ok = await n.isPermissionGranted()
        if (!ok) ok = (await n.requestPermission()) === 'granted'
        if (ok) n.sendNotification({ title: 'Kompendium', body: tekst })
      }
      const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window')
      await getCurrentWindow().requestUserAttention(UserAttentionType.Critical)
    } catch {
      // brak powiadomienia nie może zatrzymać programu
    }
    return
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Kompendium', { body: tekst })
  }
}

/** Prosi o zgodę na powiadomienia (przeglądarka pyta raz; program nie musi). */
export function poprosOPowiadomienia(): void {
  if (naPulpicie) return
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

/** Otwiera adres w zwykłej przeglądarce (w programie) albo w nowej karcie. */
export async function otworzAdres(url: string): Promise<void> {
  if (naPulpicie) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}

/** Zapisuje plik na dysku. W programie przez nasze polecenie w Rust;
 *  `nadpisz` tylko wtedy, gdy plik wskazał sam użytkownik. */
async function zapiszNaDysku(sciezka: string, blob: Blob, nadpisz: boolean): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  const dane = new Uint8Array(await blob.arrayBuffer())
  return invoke<string>('zapisz_plik', dane, {
    headers: { sciezka: encodeURIComponent(sciezka), nadpisz: nadpisz ? '1' : '0' },
  })
}

/** „Pobierz plik": w przeglądarce zwykłe pobieranie, w programie okno
 *  „Zapisz jako". Zwraca false, gdy użytkownik zrezygnował. */
export async function pobierzPlik(nazwa: string, blob: Blob): Promise<boolean> {
  if (naPulpicie) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const rozsz = nazwa.split('.').pop() ?? ''
    const sciezka = await save({
      defaultPath: nazwa,
      filters: rozsz ? [{ name: rozsz.toUpperCase(), extensions: [rozsz] }] : [],
    })
    if (!sciezka) return false
    await zapiszNaDysku(sciezka, blob, true)
    return true
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nazwa
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

// ---------- kopie zapasowe w folderze ----------

const K_WLACZONE = 'pulpit.kopie'
const K_FOLDER = 'pulpit.folderKopii'
const K_ILE = 'pulpit.ileKopii'
const K_OSTATNIA = 'pulpit.ostatniaKopia'

// Klucze bez przedrostka `ui.` — nie jadą z kopią zapasową na inny komputer
// (tam folder może nie istnieć).
const czytaj = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const zapisz = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // bez pamięci ustawień program działa dalej
  }
}

export interface UstawieniaKopii {
  wlaczone: boolean
  folder: string
  /** 0 = trzymaj wszystkie (nic nie jest kasowane). */
  ile: number
  ostatnia: string | null
}

export async function ustawieniaKopii(): Promise<UstawieniaKopii> {
  let folder = czytaj(K_FOLDER)
  if (!folder) {
    const { invoke } = await import('@tauri-apps/api/core')
    folder = await invoke<string>('domyslny_folder_kopii')
  }
  const ile = Number(czytaj(K_ILE) ?? '0')
  return {
    wlaczone: czytaj(K_WLACZONE) !== '0',
    folder,
    ile: Number.isFinite(ile) && ile >= 0 ? ile : 0,
    ostatnia: czytaj(K_OSTATNIA),
  }
}

export function ustawKopie(z: Partial<Omit<UstawieniaKopii, 'ostatnia'>>): void {
  if (z.wlaczone !== undefined) zapisz(K_WLACZONE, z.wlaczone ? '1' : '0')
  if (z.folder !== undefined) zapisz(K_FOLDER, z.folder)
  if (z.ile !== undefined) zapisz(K_ILE, String(Math.max(0, Math.round(z.ile))))
}

export async function wybierzFolderKopii(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const f = await open({ directory: true, title: 'Folder na kopie zapasowe' })
  return typeof f === 'string' ? f : null
}

export async function otworzFolderKopii(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('otworz_folder', { folder: (await ustawieniaKopii()).folder })
}

const dzis = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Robi kopię do folderu. Jedna na dzień: kolejna tego samego dnia dostaje
 *  godzinę w nazwie. Stare kasuje tylko przy ustawionym limicie. */
export async function zrobKopieDoFolderu(): Promise<string> {
  const { zrobKopie } = await import('./backup')
  const { invoke } = await import('@tauri-apps/api/core')
  const u = await ustawieniaKopii()
  const blob = await zrobKopie()
  const sep = u.folder.includes('/') && !u.folder.includes('\\') ? '/' : '\\'
  const baza = `${u.folder}${u.folder.endsWith(sep) ? '' : sep}kompendium-${dzis()}`
  let sciezka: string
  try {
    sciezka = await zapiszNaDysku(`${baza}.zip`, blob, false)
  } catch {
    // dzisiejsza już jest — kolejna dostaje godzinę (z sekundami, żeby dwie
    // kopie w tej samej minucie się nie zderzyły)
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    sciezka = await zapiszNaDysku(`${baza}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`, blob, false)
  }
  zapisz(K_OSTATNIA, new Date().toISOString())
  if (u.ile > 0) {
    const lista = await invoke<{ nazwa: string }[]>('lista_kopii', { folder: u.folder })
    for (const k of lista.slice(0, Math.max(0, lista.length - u.ile))) {
      await invoke('usun_kopie', { folder: u.folder, nazwa: k.nazwa }).catch(() => {})
    }
  }
  return sciezka
}

/** Codzienna kopia: sprawdza przy starcie i co godzinę. */
function codziennaKopia() {
  const sprawdz = async () => {
    try {
      const u = await ustawieniaKopii()
      // porównanie po dniu lokalnym (jak nazwa pliku), nie po dniu w UTC
      const ostatniDzien = u.ostatnia ? new Date(u.ostatnia).toDateString() : null
      if (!u.wlaczone || ostatniDzien === new Date().toDateString()) return
      await zrobKopieDoFolderu()
    } catch (e) {
      komunikat(`Kopia zapasowa się nie udała: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  setTimeout(() => void sprawdz(), 60_000)
  setInterval(() => void sprawdz(), 60 * 60_000)
}

// ---------- start z Windows ----------

export async function czyAutostart(): Promise<boolean> {
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function ustawAutostart(wl: boolean): Promise<void> {
  const a = await import('@tauri-apps/plugin-autostart')
  if (wl) await a.enable()
  else await a.disable()
}

// ---------- aktualizacje ----------

export async function wersjaProgramu(): Promise<string> {
  const { getVersion } = await import('@tauri-apps/api/app')
  return getVersion()
}

type Aktualizacja = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>
let znaleziona: Aktualizacja = null

/** Pyta GitHuba o nowszą wersję. Zwraca jej numer albo null.
 *  Gdy jest, ogłasza to zdarzeniem `komp:aktualizacja` (pasek w oknie)
 *  i raz na wersję powiadomieniem systemowym. */
export async function szukajAktualizacji(): Promise<string | null> {
  const { check } = await import('@tauri-apps/plugin-updater')
  znaleziona = await check()
  const v = znaleziona?.version ?? null
  if (v) {
    window.dispatchEvent(new CustomEvent('komp:aktualizacja', { detail: v }))
    if (czytaj('pulpit.powiadomionoO') !== v) {
      zapisz('pulpit.powiadomionoO', v)
      void powiadom(`Jest nowa wersja Kompendium (${v}).`, { akcja: 'aktualizacja', przycisk: 'Zobacz' })
    }
  }
  return v
}

/** Ściąga i instaluje znalezioną wersję; program zamyka się i wstaje sam. */
export async function zainstalujAktualizacje(): Promise<boolean> {
  if (!znaleziona) await szukajAktualizacji()
  if (!znaleziona) {
    komunikat('Masz najnowszą wersję')
    return false
  }
  komunikat('Pobieram aktualizację…')
  await znaleziona.downloadAndInstall()
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
  return true
}

/** Przycisk w Ustawieniach: mówi też „masz najnowszą" albo co poszło nie tak. */
export async function sprawdzAktualizacje(): Promise<void> {
  try {
    const v = await szukajAktualizacji()
    komunikat(v ? `Jest wersja ${v} — pasek u góry okna` : 'Masz najnowszą wersję')
  } catch (e) {
    komunikat(`Nie udało się sprawdzić aktualizacji: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ---------- start ----------

/** Wołane raz przy starcie programu. W przeglądarce nic nie robi. */
export function wlaczPulpit(): void {
  if (!naPulpicie) return

  // Linki do internetu otwierają się w zwykłej przeglądarce — inaczej
  // klik w link w notatce podmieniłby okno programu na tę stronę.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/i.test(href) && !href.startsWith(location.origin)) {
        e.preventDefault()
        void otworzAdres(href)
      }
    },
    true,
  )
  window.open = ((url?: string | URL) => {
    if (url) void otworzAdres(String(url))
    return null
  }) as typeof window.open

  // Dane programu nie mogą wyparować przy braku miejsca na dysku.
  void navigator.storage?.persist?.().catch(() => {})

  // Start z Windows włączony za pierwszym razem — potem to wybór w Ustawieniach.
  if (czytaj('pulpit.autostartUstawiony') !== '1') {
    ustawAutostart(true)
      .then(() => zapisz('pulpit.autostartUstawiony', '1'))
      .catch(() => {})
  }

  codziennaKopia()

  // Klik w okienko powiadomienia: program się pokazuje i otwiera to, o czym było.
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<string>('komp-akcja', (e) => {
      if (e.payload) window.dispatchEvent(new CustomEvent('komp:akcja', { detail: e.payload }))
    }),
  )
  // Aktualizacje: przy starcie i co 6 godzin (program może chodzić tygodniami
  // w tle). Pasek w oknie + powiadomienie — bez okienek, które przy schowanym
  // oknie nikt by nie zobaczył.
  const szukaj = () => void szukajAktualizacji().catch(() => {})
  setTimeout(szukaj, 8000)
  setInterval(szukaj, 6 * 60 * 60_000)
}
