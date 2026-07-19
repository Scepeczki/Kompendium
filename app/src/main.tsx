import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'

// motyw: zapamiętany wybór albo preferencja systemowa
const savedTheme = localStorage.getItem('ui.theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.dataset.theme =
  savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : prefersDark
      ? 'dark'
      : 'light'

// szerokość strony tekstu (edytor wizualny, linia, skrypt)
const savedWidth = Number(localStorage.getItem('ui.pageWidth'))
document.documentElement.style.setProperty(
  '--page-width',
  `${savedWidth >= 560 && savedWidth <= 1400 ? savedWidth : 800}px`,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
