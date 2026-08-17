/** Droga notatek z komputera na telefon.
 *
 *  Program jedzie do telefonu adresem publicznym, ale notatki tam nigdy nie
 *  trafiają. Jadą osobno, do PRYWATNEGO repozytorium na GitHubie, i tylko
 *  stamtąd telefon je bierze.
 *
 *  Dwie decyzje, które warto znać, bo z nich wynika bezpieczeństwo całości:
 *
 *  1. RUCH JEST JEDNOSTRONNY. Komputer wysyła, telefon pobiera. Migawka jest
 *     tylko kurierem — nie jest kopią zapasową ani źródłem prawdy. Nawet gdyby
 *     ktoś ją nadpisał czymś pustym, dane na komputerze zostają nietknięte,
 *     a naprawa to ponowne wysłanie. Nie ma tu więc scalania zmian z dwóch
 *     stron i nie ma jak zgubić tekstu.
 *
 *  2. WCZYTANIE NIGDY NIE KASUJE. Migawka wchodzi przez `wczytajDane`, które
 *     nadpisuje rekordy o tym samym id i dokłada nowe. Czego w migawce nie ma,
 *     to na telefonie zostaje. Kasowanie kafelka na komputerze nie skasuje go
 *     więc na telefonie — świadomie, bo cichy zdalny kasownik to ostatnia
 *     rzecz, jakiej chce się w notatkach.
 *
 *  PDF-y domyślnie zostają na komputerze: ważą setki razy więcej niż cała
 *  reszta, a na telefonie czyta się treść, nie skany.
 */

import { zbierzDane, wczytajDane, type BackupData } from './backup'
import { db } from './db'

/** Gałąź trzymająca migawkę. Osobna od kodu i nadpisywana w całości. */
const GALAZ = 'dane'
const PLIK = 'migawka.json'

const KLUCZ_TOKEN = 'ui.telefonToken'
const KLUCZ_REPO = 'ui.telefonRepo'
const KLUCZ_WYSLANO = 'ui.telefonWyslano'
const KLUCZ_POBRANO = 'ui.telefonPobrano'

export const telefonToken = () => localStorage.getItem(KLUCZ_TOKEN) ?? ''
export const telefonRepo = () => localStorage.getItem(KLUCZ_REPO) ?? 'Scepeczki/Kompendium'
export const ostatnioWyslano = () => localStorage.getItem(KLUCZ_WYSLANO) ?? ''
export const ostatnioPobrano = () => localStorage.getItem(KLUCZ_POBRANO) ?? ''

export function zapiszUstawieniaTelefonu(token: string, repo: string) {
  if (token) localStorage.setItem(KLUCZ_TOKEN, token.trim())
  else localStorage.removeItem(KLUCZ_TOKEN)
  localStorage.setItem(KLUCZ_REPO, repo.trim())
}

/** Wywołanie GitHuba z sensownym komunikatem błędu — „401" nikomu nic nie
 *  mówi, a „klucz nie ma prawa pisać" już tak. */
async function api(
  sciezka: string,
  opcje: RequestInit & { token: string },
): Promise<unknown> {
  const { token, ...reszta } = opcje
  const r = await fetch(`https://api.github.com${sciezka}`, {
    ...reszta,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(reszta.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (r.status === 401) throw new Error('Klucz nie został przyjęty — sprawdź, czy jest wklejony w całości.')
  if (r.status === 403) throw new Error('Klucz nie ma uprawnień do tego repozytorium (potrzebne: Contents).')
  if (r.status === 404) throw new Error('Nie ma takiego repozytorium albo klucz go nie widzi.')
  if (!r.ok) throw new Error(`GitHub odpowiedział ${r.status}: ${(await r.text()).slice(0, 160)}`)
  return r.status === 204 ? null : await r.json()
}

/** Base64 z tekstu — przez bajty UTF-8, bo `btoa` nie zna polskich znaków. */
function doBase64(tekst: string): string {
  const bajty = new TextEncoder().encode(tekst)
  let s = ''
  for (const b of bajty) s += String.fromCharCode(b)
  return btoa(s)
}

function zBase64(b64: string): string {
  const s = atob(b64.replace(/\s/g, ''))
  const bajty = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bajty[i] = s.charCodeAt(i)
  return new TextDecoder().decode(bajty)
}

export interface WynikWyslania {
  kafelki: number
  sciezki: number
  rozmiarKB: number
}

/** Wysyła migawkę notatek. Gałąź `dane` ma dokładnie jeden zapis — za każdym
 *  razem robimy nowy, bez rodzica, i przestawiamy na niego wskaźnik. Inaczej
 *  historia rosłaby o kilka megabajtów przy każdym wysłaniu. */
export async function wyslijNotatki(): Promise<WynikWyslania> {
  const token = telefonToken()
  const repo = telefonRepo()
  if (!token) throw new Error('Najpierw wklej klucz dostępu.')

  const { dane } = await zbierzDane()
  const tekst = JSON.stringify(dane)

  const blob = (await api(`/repos/${repo}/git/blobs`, {
    token,
    method: 'POST',
    body: JSON.stringify({ content: doBase64(tekst), encoding: 'base64' }),
  })) as { sha: string }

  const tree = (await api(`/repos/${repo}/git/trees`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      tree: [{ path: PLIK, mode: '100644', type: 'blob', sha: blob.sha }],
    }),
  })) as { sha: string }

  const commit = (await api(`/repos/${repo}/git/commits`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      // bez rodzica: gałąź ma zawsze jeden zapis, więc nic się nie zbiera
      message: `Migawka notatek ${new Date().toISOString().slice(0, 16)}`,
      tree: tree.sha,
      parents: [],
    }),
  })) as { sha: string }

  try {
    await api(`/repos/${repo}/git/refs/heads/${GALAZ}`, {
      token,
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    })
  } catch {
    // gałęzi jeszcze nie ma — pierwsze wysłanie ją zakłada
    await api(`/repos/${repo}/git/refs`, {
      token,
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${GALAZ}`, sha: commit.sha }),
    })
  }

  localStorage.setItem(KLUCZ_WYSLANO, new Date().toISOString())
  return {
    kafelki: dane.concepts.length,
    sciezki: dane.paths.length,
    rozmiarKB: Math.round(new TextEncoder().encode(tekst).length / 1024),
  }
}

export interface WynikPobrania {
  kafelki: number
  sciezki: number
  zDnia: string
}

/** Pobiera migawkę i wpisuje ją do bazy tego urządzenia. */
export async function pobierzNotatki(): Promise<WynikPobrania> {
  const token = telefonToken()
  const repo = telefonRepo()
  if (!token) throw new Error('Najpierw wklej klucz dostępu.')

  const wpis = (await api(`/repos/${repo}/contents/${PLIK}?ref=${GALAZ}`, { token })) as {
    content?: string
    encoding?: string
    download_url?: string
  }

  let tekst: string
  if (wpis.content && wpis.encoding === 'base64') {
    tekst = zBase64(wpis.content)
  } else if (wpis.download_url) {
    // pliki powyżej megabajta GitHub oddaje osobnym adresem, nie w treści
    const r = await fetch(wpis.download_url)
    if (!r.ok) throw new Error(`Nie udało się pobrać migawki (${r.status}).`)
    tekst = await r.text()
  } else {
    throw new Error('Migawka jest pusta albo w nieznanym formacie.')
  }

  const dane = JSON.parse(tekst) as BackupData
  if (dane.version !== 1) throw new Error(`Nieobsługiwana wersja migawki: ${dane.version}`)
  // bez ustawień wyglądu: są spod dużego ekranu i na telefonie przeszkadzają
  await wczytajDane(dane, [], false)

  localStorage.setItem(KLUCZ_POBRANO, new Date().toISOString())
  return {
    kafelki: dane.concepts.length,
    sciezki: dane.paths.length,
    zDnia: dane.exportedAt,
  }
}

/** Ile rzeczy siedzi w bazie tego urządzenia — do pokazania obok przycisków,
 *  żeby było widać, czy pobranie w ogóle coś zmieniło. */
export async function ileTutaj(): Promise<{ kafelki: number; sciezki: number }> {
  const [kafelki, sciezki] = await Promise.all([db.concepts.count(), db.paths.count()])
  return { kafelki, sciezki }
}
