/** Kto przewija: użytkownik czy program?
 *
 *  Samo zdarzenie `scroll` tego nie mówi — przychodzi tak samo po kółku myszy,
 *  jak po poprawce przewinięcia, gdy kafelek nad ekranem urósł. A to dwie
 *  różne sprawy: przewijanie ręką wybiera nowy punkt stały Linii i zmienia
 *  bieżący rozdział w spisie, a przesunięcie programu nie może niczego ruszyć.
 *
 *  O ręce świadczą: kółko, dotyk, klawisze przewijania i chwycenie paska
 *  przewijania. Skok ze spisu treści (`data-skok` na przewijanym widoku) liczy
 *  się jak ręka — to też wybór użytkownika, dokąd chce być. */

let ostatniaReka = 0
let pasekWcisniety = false
/** Kierunek ostatniego przewinięcia ręką: -1 w górę, 1 w dół. */
let kierunek = 0

const KLAWISZE = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
/** Ile po ostatnim ruchu ręki zdarzenia przewijania są jeszcze „jej"
 *  (przewijanie płynne i bezwładne gładzika dobiega jeszcze chwilę). */
const DOBIEG = 300

/** Przewijanie zaczęte ręką trwa, dopóki widok się nie zatrzyma — płynne i
 *  bezwładne przewijanie na wolnym komputerze dobiega dużo dłużej niż chwilę
 *  po ostatnim ruchu kółka. */
let sesjaDo = 0
/** Ręka ruszyła, a widok jeszcze się nie przesunął. Na zajętym komputerze
 *  zdarzenie scroll przychodzi długo po kółku — wtedy i tak należy do ręki. */
let czeka = false
const CZEKA_NAJDLUZEJ = 1500
const KONIEC_SESJI = 200
/** Najdłużej tyle po ostatnim ruchu ręki — przesunięcia samej przeglądarki
 *  (jej kotwiczenie) też dają zdarzenia scroll i bez tej granicy przedłużałyby
 *  „przewijanie ręką” bez końca, a punkt stały nie byłby wtedy pilnowany. */
const NAJDLUZEJ = 2000

/** Wołane przy KAŻDYM zdarzeniu scroll widoku: przedłuża przewijanie ręką. */
export function zauwazPrzewiniecie() {
  const t = performance.now()
  if (czeka && t - ostatniaReka < CZEKA_NAJDLUZEJ) {
    czeka = false
    sesjaDo = Math.min(t + KONIEC_SESJI, ostatniaReka + NAJDLUZEJ)
    return
  }
  czeka = false
  if (pasekWcisniety || t - ostatniaReka < DOBIEG || (t < sesjaDo && t - ostatniaReka < NAJDLUZEJ))
    sesjaDo = Math.min(t + KONIEC_SESJI, ostatniaReka + NAJDLUZEJ)
}

/** Przewijanie ręką się skończyło (klik w treść, pisanie). */
function koniecReki() {
  ostatniaReka = 0
  sesjaDo = 0
  czeka = false
}

let podlaczone = false
function podlacz() {
  if (podlaczone || typeof window === 'undefined') return
  podlaczone = true
  const reka = () => {
    ostatniaReka = performance.now()
    czeka = true
  }
  window.addEventListener(
    'wheel',
    (e) => {
      reka()
      if (e.deltaY) kierunek = e.deltaY < 0 ? -1 : 1
    },
    { capture: true, passive: true },
  )
  window.addEventListener('touchstart', reka, { capture: true, passive: true })
  window.addEventListener('touchmove', reka, { capture: true, passive: true })
  window.addEventListener(
    'keydown',
    (e) => {
      if (!KLAWISZE.has(e.key)) {
        // zwykły klawisz (pisanie) kończy przewijanie ręką
        koniecReki()
        return
      }
      reka()
      kierunek = e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home' || (e.key === ' ' && e.shiftKey) ? -1 : 1
    },
    { capture: true },
  )
  window.addEventListener(
    'pointerdown',
    (e) => {
      // pasek przewijania: kliknięcie w element poza jego treścią (na prawo od niej)
      const t = e.target as HTMLElement | null
      if (!t || !(t instanceof HTMLElement)) return
      const r = t.getBoundingClientRect()
      if (t.scrollHeight > t.clientHeight && e.clientX > r.left + t.clientWidth) {
        pasekWcisniety = true
        reka()
      } else {
        // klik w treść (zakładka strony, tekst) kończy przewijanie ręką — od tej
        // chwili znów pilnujemy punktu stałego (kliknięty kafelek stoi)
        koniecReki()
      }
    },
    { capture: true, passive: true },
  )
  const pusc = () => {
    if (!pasekWcisniety) return
    pasekWcisniety = false
    reka()
  }
  window.addEventListener('pointerup', pusc, { capture: true, passive: true })
  window.addEventListener('pointercancel', pusc, { capture: true, passive: true })
}
podlacz()

/** Czy to, co się teraz przewija w `widok`, przewija użytkownik. */
export function przewijaUzytkownik(widok?: HTMLElement | null): boolean {
  if (widok?.dataset.skok === '1') return true
  const t = performance.now()
  return pasekWcisniety || t - ostatniaReka < DOBIEG || t < sesjaDo || (czeka && t - ostatniaReka < CZEKA_NAJDLUZEJ)
}

/** Kierunek ostatniego przewijania ręką (−1 w górę, 1 w dół, 0 nie wiadomo). */
export const kierunekPrzewijania = () => kierunek
