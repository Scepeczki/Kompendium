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
import { wlaczKopiowanieZrodla } from './kopiowanie'

// motyw: zapamiętany wybór albo preferencja systemowa
const savedTheme = localStorage.getItem('ui.theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.dataset.theme =
  savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : prefersDark
      ? 'dark'
      : 'light'

// zapamiętane ustawienia wyglądu tekstu (szerokość strony, interlinia, akapity)
initUiSettings()

// typy kafelków są danymi — świeża baza musi dostać fabryczne, zanim
// ktokolwiek o nie zapyta (widoki i tak czekają na dane z Dexie)
seedBlockTypes()

// Tryb offline i samoaktualizacja — tylko w wersji zbudowanej. W trybie pracy
// pracownik serwisowy podawałby zapamiętane pliki zamiast świeżych i zmiany
// w kodzie przestawałyby być widoczne.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // brak trybu offline to nie powód, żeby program nie wstał
    })
  })
}

// Ctrl+C w wyrenderowanym tekście ma dawać źródło (wzory jako $…$),
// a nie sklejkę trzech kopii wzoru, które KaTeX trzyma w drzewie strony.
wlaczKopiowanieZrodla()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
