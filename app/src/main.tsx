import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// kroje pisma dowożone z paczką — działają bez internetu i wyglądają
// tak samo na każdym komputerze (Inter = interfejs, Source Serif = treść)
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
// katex przed naszymi stylami — inaczej jego `.katex { font: 1.21em }`
// wygrywa z naszym ustawieniem wielkości wzorów (ta sama specyficzność)
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { initUiSettings } from './uiSettings'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
