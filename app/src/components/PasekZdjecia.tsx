import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import {
  SZEROKOSC_ZDJECIA_MAX,
  SZEROKOSC_ZDJECIA_MIN,
  czytajUklad,
  zapiszUklad,
  type PolozenieZdjecia,
  type UkladZdjecia,
} from '../obrazy'
import { PoleLiczby } from './PoleLiczby'

const ROZMIARY = [25, 50, 75, 100]

/** Rysunek każdego przycisku: `o` to prostokąt zdjęcia, `k` to kreski tekstu. */
const POLOZENIA: {
  id: PolozenieZdjecia
  tytul: string
  o: [number, number, number, number]
  k: [number, number, number][]
}[] = [
  { id: 'lewo', tytul: 'Po lewej, w osobnym wierszu', o: [1, 1, 9, 8], k: [[1, 13, 18]] },
  { id: 'srodek', tytul: 'Na środku, w osobnym wierszu', o: [5.5, 1, 9, 8], k: [[1, 13, 18]] },
  { id: 'prawo', tytul: 'Po prawej, w osobnym wierszu', o: [10, 1, 9, 8], k: [[1, 13, 18]] },
  {
    id: 'oplyw-lewo',
    tytul: 'Po lewej, a tekst obok niego',
    o: [1, 1, 8, 8],
    k: [[11, 2, 8], [11, 5, 8], [11, 8, 8], [1, 13, 18]],
  },
  {
    id: 'oplyw-prawo',
    tytul: 'Po prawej, a tekst obok niego',
    o: [11, 1, 8, 8],
    k: [[1, 2, 8], [1, 5, 8], [1, 8, 8], [1, 13, 18]],
  },
  {
    id: 'wiersz',
    tytul: 'W wierszu, między słowami',
    o: [7, 3, 6, 6],
    k: [[1, 7, 5], [14, 7, 5], [1, 13, 18]],
  },
]

/** Procenty zdjęcia liczą się od szerokości akapitu, w którym stoi. */
function szerokoscKolumny(img: HTMLElement): number {
  const rodzic = img.parentElement
  if (!rodzic) return 1
  const s = getComputedStyle(rodzic)
  return rodzic.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) || 1
}

/** Sterowanie zaznaczonym zdjęciem. Pasek stoi poza kafelkiem, bo kafelki
 *  ucinają to, co z nich wystaje. */
export function PasekZdjecia({ editor }: { editor: Editor }) {
  const [, odswiez] = useReducer((n: number) => n + 1, 0)
  const [schowany, setSchowany] = useState(false)
  const pasek = useRef<HTMLDivElement>(null)
  const uchwyt = useRef<HTMLSpanElement>(null)
  const ciagniecie = useRef<{ x: number; px: number; kolumna: number } | null>(null)

  const sel = editor.state.selection
  const wybrany = sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel : null
  const img = wybrany ? (editor.view.nodeDOM(wybrany.from) as HTMLElement | null) : null
  const widoczny = !!img && !schowany

  useEffect(() => {
    editor.on('transaction', odswiez)
    return () => {
      editor.off('transaction', odswiez)
    }
  }, [editor])

  // kliknięcie poza tym polem chowa pasek, choć zdjęcie zostaje zaznaczone
  useEffect(() => {
    const klik = (e: MouseEvent) => {
      const t = e.target as Node
      if (pasek.current?.contains(t) || uchwyt.current?.contains(t)) return
      setSchowany(!editor.view.dom.contains(t))
    }
    // przeciągane zdjęcie ma gdzie upaść także pod paskiem
    const ciagnie = () => setSchowany(true)
    const pole = editor.view.dom
    document.addEventListener('mousedown', klik, true)
    pole.addEventListener('dragstart', ciagnie)
    return () => {
      document.removeEventListener('mousedown', klik, true)
      pole.removeEventListener('dragstart', ciagnie)
    }
  }, [editor])

  useEffect(() => {
    if (!widoczny) return
    window.addEventListener('scroll', odswiez, true)
    window.addEventListener('resize', odswiez)
    return () => {
      window.removeEventListener('scroll', odswiez, true)
      window.removeEventListener('resize', odswiez)
    }
  }, [widoczny])

  const uklad = czytajUklad(wybrany?.node.attrs.title)
  const zPrawej = uklad.polozenie === 'prawo' || uklad.polozenie === 'oplyw-prawo'

  useLayoutEffect(() => {
    if (!img || !pasek.current || !uchwyt.current) return
    const r = img.getBoundingClientRect()
    const { offsetWidth: w, offsetHeight: h, style } = pasek.current
    const nad = r.top - h - 8
    const top = nad >= 8 ? nad : Math.min(r.bottom + 8, window.innerHeight - h - 8)
    style.top = `${Math.max(8, top)}px`
    style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`
    style.visibility = r.bottom < 0 || r.top > window.innerHeight ? 'hidden' : 'visible'
    uchwyt.current.style.left = `${(zPrawej ? r.left : r.right) - 6}px`
    uchwyt.current.style.top = `${r.bottom - 6}px`
    uchwyt.current.style.visibility = style.visibility
  })

  if (!widoczny || !wybrany) return null

  const ustaw = (zmiana: Partial<UkladZdjecia>) => {
    const { state, view } = editor
    view.dispatch(state.tr.setNodeAttribute(wybrany.from, 'title', zapiszUklad({ ...uklad, ...zmiana })))
  }
  const rysowana = Math.round((img.getBoundingClientRect().width / szerokoscKolumny(img)) * 100)
  const naZakres = (v: number) =>
    Math.max(SZEROKOSC_ZDJECIA_MIN, Math.min(SZEROKOSC_ZDJECIA_MAX, Math.round(v)))

  return createPortal(
    <>
      <div
        ref={pasek}
        className="zdjecie-pasek"
        onMouseDown={(e) => {
          e.stopPropagation()
          // przyciski nie zabierają kursora z tekstu, tylko pole liczby go przyjmuje
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="zdjecie-grupa">
          {POLOZENIA.map((p) => (
            <button
              key={p.id}
              className={uklad.polozenie === p.id ? 'wybrany' : ''}
              title={p.tytul}
              aria-label={p.tytul}
              onClick={() => ustaw({ polozenie: p.id })}
            >
              <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
                <rect x={p.o[0]} y={p.o[1]} width={p.o[2]} height={p.o[3]} rx="1" fill="currentColor" />
                {p.k.map(([x, y, w]) => (
                  <rect key={`${x}-${y}`} x={x} y={y} width={w} height="1.5" fill="currentColor" opacity="0.55" />
                ))}
              </svg>
            </button>
          ))}
        </div>
        <div className="zdjecie-grupa">
          {ROZMIARY.map((v) => (
            <button
              key={v}
              className={uklad.szerokosc === v ? 'wybrany' : ''}
              title={`Szerokość ${v}% kolumny`}
              onClick={() => ustaw({ szerokosc: v })}
            >
              {v}
            </button>
          ))}
        </div>
        <label className="menu-wielkosc">
          <PoleLiczby
            wartosc={uklad.szerokosc ?? rysowana}
            min={SZEROKOSC_ZDJECIA_MIN}
            max={SZEROKOSC_ZDJECIA_MAX}
            tytul={`Szerokość zdjęcia, od ${SZEROKOSC_ZDJECIA_MIN} do ${SZEROKOSC_ZDJECIA_MAX}% kolumny`}
            onZmien={(v) => ustaw({ szerokosc: v })}
          />
          <span>%</span>
        </label>
        {uklad.szerokosc !== null && (
          <button
            className="zdjecie-domyslny"
            title="Wróć do wielkości z Ustawień"
            onClick={() => ustaw({ szerokosc: null })}
          >
            domyślny
          </button>
        )}
      </div>
      <span
        ref={uchwyt}
        className={`zdjecie-uchwyt ${zPrawej ? 'z-lewej' : ''}`}
        title="Ciągnij, żeby zmienić rozmiar"
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          ciagniecie.current = {
            x: e.clientX,
            px: img.getBoundingClientRect().width,
            kolumna: szerokoscKolumny(img),
          }
        }}
        onPointerMove={(e) => {
          const c = ciagniecie.current
          if (!c) return
          const kierunek = uklad.polozenie === 'srodek' ? 2 : zPrawej ? -1 : 1
          const px = c.px + (e.clientX - c.x) * kierunek
          const szerokosc = naZakres((px / c.kolumna) * 100)
          if (szerokosc !== uklad.szerokosc) ustaw({ szerokosc })
        }}
        onPointerUp={() => {
          ciagniecie.current = null
        }}
      />
    </>,
    document.body,
  )
}
