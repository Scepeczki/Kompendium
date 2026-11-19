import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { BlockShell } from './BlockShell'
import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { naprawTypZadan, odepnijZadanie, przesunZadanie, usunZadanie, utworzZadania } from '../nauka'
import type { BlockVersion, Concept, JednostkaNauki } from '../types'

/** Zadania sektora, które wciąż istnieją — kafelek mógł zostać usunięty
 *  w bibliotece, a sektor pamięta tylko jego id. */
export function useZadania(j: JednostkaNauki | undefined): Concept[] | undefined {
  const ids = j?.zadania ?? []
  // zadania z rodzajem, którego nie ma (szare), dostają rodzaj „Zadanie"
  useEffect(() => {
    void naprawTypZadan(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join()])
  return useLiveQuery(async () => {
    const cs = await db.concepts.bulkGet(ids)
    return cs.filter((c): c is Concept => !!c)
  }, [ids.join()])
}

/** Usunięcie zadania na dobre — zawsze po pytaniu. */
function useUsunZadanie() {
  const dlg = useDialogs()
  return async (sektorId: string, c: Concept) => {
    const ok = await dlg.confirm({
      title: `Usunąć zadanie „${c.name}" na dobre?`,
      message: 'Kafelek zniknie razem z treścią i rozwiązaniem. Jeśli chcesz go tylko zdjąć z sektora, wybierz „Odepnij".',
      confirmLabel: 'Usuń zadanie',
      danger: true,
    })
    if (ok) await usunZadanie(sektorId, c.id)
  }
}

/** Zadania sektora w panelu Nauki: lista i nowe zadanie. */
export function ListaZadan({
  j,
  onOtworz,
  nowe,
}: {
  j: JednostkaNauki
  onOtworz?: (conceptId: string) => void
  /** Zadania dołożone po nauce — jeszcze nieuczone. */
  nowe?: Set<string>
}) {
  const zadania = useZadania(j) ?? []
  const poprawki = new Set(j.doPoprawy ?? [])
  const usun = useUsunZadanie()

  const noweZadanie = async () => {
    const [id] = await utworzZadania(j.id, [{}])
    if (id) onOtworz?.(id)
  }

  return (
    <div className="zadania-sektora">
      <h4 className="zadania-sektora-glowa">
        Zadania{zadania.length ? ` (${zadania.length})` : ''}
      </h4>
      {zadania.length > 0 && (
        <ol className="zadania-lista">
          {zadania.map((c, i) => (
            <li key={c.id} className={`${poprawki.has(c.id) ? 'do-poprawy' : ''} ${nowe?.has(c.id) ? 'nowy' : ''}`}>
              <button className="zadania-nazwa" title="Otwórz w edytorze" onClick={() => onOtworz?.(c.id)}>
                {c.name}
              </button>
              {nowe?.has(c.id) && <span className="znaczek znaczek-nowe">nowe</span>}
              <span className="zadania-akcje">
                <button className="folder-action" title="Wyżej" disabled={i === 0} onClick={() => przesunZadanie(j.id, c.id, -1)}>
                  ↑
                </button>
                <button
                  className="folder-action"
                  title="Niżej"
                  disabled={i === zadania.length - 1}
                  onClick={() => przesunZadanie(j.id, c.id, 1)}
                >
                  ↓
                </button>
                <button
                  className="folder-action"
                  title="Odepnij od sektora — kafelek zostaje w folderze ścieżki"
                  onClick={() => odepnijZadanie(j.id, c.id)}
                >
                  ✕
                </button>
                <button className="folder-action" title="Usuń zadanie na dobre (zapyta)" onClick={() => usun(j.id, c)}>
                  <Icon name="usun" size={0.9} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="zadania-przyciski">
        <button className="btn btn-maly" onClick={noweZadanie} title="Nowy kafelek-zadanie; otworzy się w edytorze">
          + Nowe zadanie
        </button>
      </div>
    </div>
  )
}

/** Zwinięty pasek „Zadania (N)" na samym końcu sektora w Linii. Zadania nie
 *  są węzłami ścieżki, więc Skrypt i PDF ich nie widzą. */
export function PasekZadan({
  sektorId,
  onOtworz,
  onDoLinii,
}: {
  sektorId: string
  onOtworz?: (conceptId: string) => void
  /** Zadanie wychodzi z paska i staje w Linii jako zwykły kafelek sektora. */
  onDoLinii?: (sektorId: string, conceptId: string) => void
}) {
  const j = useLiveQuery(() => db.nauka.get(sektorId), [sektorId])
  const zadania = useZadania(j) ?? []
  const [otwarty, setOtwarty] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; c: Concept } | null>(null)
  const ids = zadania.map((c) => c.id)
  const wersje = useLiveQuery(() => db.versions.where('conceptId').anyOf(ids).toArray(), [ids.join()]) ?? []
  if (!zadania.length) return null
  return (
    <div
      className={`zadania-pasek ${otwarty ? 'otwarty' : ''}`}
      // pasek siedzi w segmencie Linii — klik nie może zaznaczać kafelka
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      // Fokus na przycisku robi z segmentu „bieżący", a ten dostaje pasek
      // narzędzi — układ przesuwa się między wciśnięciem a puszczeniem
      // myszy i kliknięcie trafiało obok. Przyciski paska fokusu nie biorą.
      onMouseDown={(e) => {
        if ((e.target as Element).closest('button')) e.preventDefault()
      }}
    >
      <button className="zadania-pasek-glowa" onClick={() => setOtwarty((o) => !o)} aria-expanded={otwarty}>
        <span className="zadania-pasek-strzalka">
          <Icon name="rozwin" size={0.9} />
        </span>
        Zadania ({zadania.length})
        <span className="zadania-pasek-sektor">{j?.nazwa}</span>
      </button>
      {otwarty && (
        <div className="zadania-pasek-tresc">
          {zadania.map((c) => (
            <div
              key={c.id}
              className="zadania-pasek-zadanie"
              data-zadanie={c.id}
              onContextMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, c })}
            >
              <ZadanieWLinii
                c={c}
                wersje={wersje.filter((v) => v.conceptId === c.id)}
                onMenu={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setMenu({ x: r.left, y: r.bottom + 4, c })
                }}
              />
            </div>
          ))}
        </div>
      )}
      {menu && (
        <MenuZadania
          x={menu.x}
          y={menu.y}
          c={menu.c}
          sektorId={sektorId}
          onOtworz={onOtworz}
          onDoLinii={onDoLinii}
          onZamknij={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function ZadanieWLinii({
  c,
  wersje,
  onMenu,
}: {
  c: Concept
  wersje: BlockVersion[]
  onMenu: (e: React.MouseEvent) => void
}) {
  const [strona, setStrona] = useState<string | null>(null)
  return (
    <BlockShell
      concept={c}
      versions={wersje}
      versionId={null}
      subpageId={strona}
      onSubpageChange={setStrona}
      showOpen={false}
      bezPaskaWersji
      pochodzenie
      dzialanie={
        <button className="folder-action zadania-menu-btn" title="Co zrobić z tym zadaniem" onClick={onMenu}>
          ⋯
        </button>
      }
    />
  )
}

/** Menu zadania z paska: otwórz, do Linii, odepnij, usuń (po pytaniu).
 *  Przez portal — segment Linii obcina wszystko, co z niego wystaje. */
export function MenuZadania({
  x,
  y,
  c,
  sektorId,
  onOtworz,
  onDoLinii,
  onZamknij,
}: {
  x: number
  y: number
  c: Concept
  sektorId: string
  onOtworz?: (conceptId: string) => void
  onDoLinii?: (sektorId: string, conceptId: string) => void
  onZamknij: () => void
}) {
  const usun = useUsunZadanie()
  useEffect(() => {
    const zamknij = () => onZamknij()
    const klawisz = (e: KeyboardEvent) => e.key === 'Escape' && onZamknij()
    window.addEventListener('mousedown', zamknij)
    window.addEventListener('scroll', zamknij, true)
    window.addEventListener('keydown', klawisz)
    return () => {
      window.removeEventListener('mousedown', zamknij)
      window.removeEventListener('scroll', zamknij, true)
      window.removeEventListener('keydown', klawisz)
    }
  }, [onZamknij])
  const dzialaj = (fn: () => void) => () => {
    onZamknij()
    fn()
  }
  return createPortal(
    <div
      className="tree-menu linear-menu menu-zadania"
      style={{ position: 'fixed', left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      ref={(el) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = Math.min(0, window.innerWidth - 6 - r.right)
        const dy = Math.min(0, window.innerHeight - 6 - r.bottom)
        if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
      }}
    >
      <div className="tree-menu-where">Zadanie „{c.name}"</div>
      {onOtworz && (
        <button className="tree-menu-item" onClick={dzialaj(() => onOtworz(c.id))}>
          <Icon name="edycja" size={1} /> Otwórz w edytorze
        </button>
      )}
      {onDoLinii && (
        <button className="tree-menu-item" onClick={dzialaj(() => onDoLinii(sektorId, c.id))}>
          <Icon name="przesun" size={1} /> Wstaw do Linii (na koniec sektora)
        </button>
      )}
      <button className="tree-menu-item" onClick={dzialaj(() => void odepnijZadanie(sektorId, c.id))}>
        ✕ Odepnij od sektora (zostaje w folderze ścieżki)
      </button>
      <div className="tree-menu-sep" />
      <button className="tree-menu-item danger" onClick={dzialaj(() => void usun(sektorId, c))}>
        <Icon name="usun" size={1} /> Usuń zadanie…
      </button>
    </div>,
    document.body,
  )
}
