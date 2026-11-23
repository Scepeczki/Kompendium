import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// kroje pisma dowożone z paczką — działają bez internetu i wyglądają
// tak samo na każdym komputerze (Inter = interfejs, Source Serif = treść)
import '@fontsource-variable/figtree'
import '@fontsource-variable/source-serif-4'
// katex przed naszymi stylami — inaczej jego `.katex { font: 1.21em }`
// wygrywa z naszym ustawieniem wielkości wzorów (ta sama specyficzność)
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { initUiSettings } from './uiSettings'
import { seedBlockTypes } from './db'
import { podlaczCofanie, wlaczCofanie, wlaczSkrotyCofania } from './cofanie'
import { wlaczKopiowanieZrodla } from './kopiowanie'
import { wczytajObrazy } from './obrazy'
import { naPulpicie, wlaczPulpit } from './pulpit'
import { OknoPowiadomienia } from './components/OknoPowiadomienia'

/** Okienko powiadomienia (program na Windows) — ta sama paczka, inny widok. */
const oknoPowiadomienia = new URLSearchParams(location.search).get('okno') === 'powiadomienie'

// motyw: zapamiętany wybór albo preferencja systemowa
const savedTheme = localStorage.getItem('ui.theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.dataset.theme =
  savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : prefersDark
      ? 'dark'
      : 'light'

if (oknoPowiadomienia) {
  document.documentElement.classList.add('okno-powiadomienia')
  createRoot(document.getElementById('root')!).render(<OknoPowiadomienia />)
} else {
  uruchomProgram()
}

function uruchomProgram() {
// zapamiętane ustawienia wyglądu tekstu (szerokość strony, interlinia, akapity)
initUiSettings()

// typy kafelków są danymi — świeża baza musi dostać fabryczne, zanim
// ktokolwiek o nie zapyta (widoki i tak czekają na dane z Dexie)
// Cofanie (Ctrl+Z) obejmuje zmiany w bazie od pierwszego działania
// użytkownika — porządki przy starcie programu to nie jego działania.
podlaczCofanie()
wlaczSkrotyCofania()
void seedBlockTypes().finally(() => {
  const start = () => {
    wlaczCofanie()
    window.removeEventListener('pointerdown', start, true)
    window.removeEventListener('keydown', start, true)
  }
  window.addEventListener('pointerdown', start, true)
  window.addEventListener('keydown', start, true)
})

// Tryb offline i samoaktualizacja — tylko w wersji zbudowanej. W trybie pracy
// pracownik serwisowy podawałby zapamiętane pliki zamiast świeżych i zmiany
// w kodzie przestawałyby być widoczne.
// Program na Windows ma pliki u siebie i aktualizuje się sam — bez tego.
if (import.meta.env.PROD && !naPulpicie && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // brak trybu offline to nie powód, żeby program nie wstał
    })
  })
}

// Dane w przeglądarce mogą zostać wyczyszczone przy braku miejsca na dysku —
// prosimy, żeby były trwałe (Firefox raz zapyta o zgodę).
void navigator.storage?.persist?.().catch(() => {})

// Kompendium jako program: zasobnik, kopie w folderze, aktualizacje.
if (naPulpicie) document.documentElement.classList.add('na-pulpicie')
wlaczPulpit()

// Ctrl+C w wyrenderowanym tekście ma dawać źródło (wzory jako $…$),
// a nie sklejkę trzech kopii wzoru, które KaTeX trzyma w drzewie strony.
wlaczKopiowanieZrodla()

// Zdjęcia muszą być pod ręką przed pierwszym narysowaniem treści, a brak
// któregoś nie może zatrzymać programu.
wczytajObrazy()
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
