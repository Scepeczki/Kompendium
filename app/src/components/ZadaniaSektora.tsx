import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { BlockShell } from './BlockShell'
import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { naprawTypZadan, odepnijZadanie, przesunZadanie, usunZadanie, utworzZadania, wstawZadanieNaListe } from '../nauka'
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

/** Przeciągane zadanie z listy na końcu sektora: { sektorId, conceptId }. */
export const ZADANIE_MIME = 'text/x-komp-zadanie'
/** Przeciągany segment Linii (ten sam napis co w PathCanvas). */
const SEG_MIME_LINII = 'text/x-komp-seg'

/** Czy właśnie coś się przeciąga (segment Linii albo zadanie z listy) —
 *  wtedy pusta lista też się pokazuje, żeby było na co upuścić. */
function useCiagnie() {
  const [ciagnie, setCiagnie] = useState(false)
  useEffect(() => {
    const start = (e: DragEvent) => {
      const t = Array.from(e.dataTransfer?.types ?? [])
      if (t.includes(SEG_MIME_LINII) || t.includes(ZADANIE_MIME)) setCiagnie(true)
    }
    const stop = () => setCiagnie(false)
    document.addEventListener('dragstart', start)
    document.addEventListener('dragend', stop)
    document.addEventListener('drop', stop)
    return () => {
      document.removeEventListener('dragstart', start)
      document.removeEventListener('dragend', stop)
      document.removeEventListener('drop', stop)
    }
  }, [])
  return ciagnie
}

/** Zwinięty pasek „Zadania (N)" na samym końcu sektora w Linii. Zadania z
 *  listy nie są węzłami ścieżki, więc Skrypt i PDF ich nie widzą. Przeciąga
 *  się zwyczajnie: z listy do Linii (staje tam, gdzie upuścisz), z Linii na
 *  listę i w obrębie listy (kolejność). */
export function PasekZadan({
  sektorId,
  onOtworz,
  onDoLinii,
  onZLinii,
}: {
  sektorId: string
  onOtworz?: (conceptId: string) => void
  /** Zadanie wychodzi z paska i staje w Linii jako zwykły kafelek sektora. */
  onDoLinii?: (sektorId: string, conceptId: string) => void
  /** Kafelek z Linii upuszczony na listę (w miejscu index). Brak = lista
   *  tylko do czytania (np. widok Nauka). */
  onZLinii?: (sektorId: string, nodeId: string, index: number) => void
}) {
  const j = useLiveQuery(() => db.nauka.get(sektorId), [sektorId])
  const zadania = useZadania(j) ?? []
  const [otwarty, setOtwarty] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; c: Concept } | null>(null)
  /** Gdzie wpadnie upuszczany kafelek (indeks na liście). */
  const [szczelina, setSzczelina] = useState<number | null>(null)
  const ciagnie = useCiagnie()
  useEffect(() => {
    if (!ciagnie) setSzczelina(null)
  }, [ciagnie])
  const ids = zadania.map((c) => c.id)
  const wersje = useLiveQuery(() => db.versions.where('conceptId').anyOf(ids).toArray(), [ids.join()]) ?? []
  const edycja = !!onZLinii
  if (!zadania.length && !(edycja && ciagnie)) return null

  /** Indeks na liście sektora (lista może mieć id kafelków, których już nie ma). */
  const naLiscie = (k: number) => {
    const lista = j?.zadania ?? []
    const c = zadania[k]
    return c ? Math.max(0, lista.indexOf(c.id)) : lista.length
  }
  const nasze = (e: React.DragEvent) =>
    edycja && (e.dataTransfer.types.includes(ZADANIE_MIME) || e.dataTransfer.types.includes(SEG_MIME_LINII))
  const upusc = (e: React.DragEvent, k: number) => {
    e.preventDefault()
    e.stopPropagation()
    setSzczelina(null)
    const gdzie = naLiscie(k)
    const zad = e.dataTransfer.getData(ZADANIE_MIME)
    if (zad) {
      try {
        const p = JSON.parse(zad) as { sektorId: string; conceptId: string }
        const lista = j?.zadania ?? []
        const skad = p.sektorId === sektorId ? lista.indexOf(p.conceptId) : -1
        // w obrębie listy: po wyjęciu elementu wyżej wszystko niżej przesuwa się o jeden
        void wstawZadanieNaListe(sektorId, p.conceptId, skad >= 0 && skad < gdzie ? gdzie - 1 : gdzie)
      } catch {
        /* obce dane */
      }
      return
    }
    const seg = e.dataTransfer.getData(SEG_MIME_LINII)
    if (!seg) return
    if (seg.startsWith('[')) {
      window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: 'Na listę zadań przeciągaj po jednym zadaniu.' }))
      return
    }
    onZLinii?.(sektorId, seg, gdzie)
  }

  return (
    <div
      className={`zadania-pasek ${otwarty ? 'otwarty' : ''} ${szczelina !== null ? 'cel-upuszczenia' : ''}`}
      data-pasek-zadan={sektorId}
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
      // nad paskiem (poza pozycjami) — na koniec listy; zwinięty sam się rozwija
      onDragOver={(e) => {
        if (!nasze(e)) return
        e.preventDefault()
        e.stopPropagation()
        if (!otwarty) setOtwarty(true)
        if (!(e.target as Element).closest('.zadania-pasek-zadanie')) setSzczelina(zadania.length)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSzczelina(null)
      }}
      onDrop={(e) => {
        if (!nasze(e)) return
        upusc(e, szczelina ?? zadania.length)
      }}
    >
      <button className="zadania-pasek-glowa" onClick={() => setOtwarty((o) => !o)} aria-expanded={otwarty}>
        <span className="zadania-pasek-strzalka">
          <Icon name="rozwin" size={0.9} />
        </span>
        Zadania ({zadania.length})
        <span className="zadania-pasek-sektor">{j?.nazwa}</span>
        {edycja && ciagnie && <span className="zadania-pasek-upusc">upuść tutaj — na listę zadań sektora</span>}
      </button>
      {otwarty && (
        <div className="zadania-pasek-tresc">
          {zadania.map((c, k) => (
            <div
              key={c.id}
              className={`zadania-pasek-zadanie ${szczelina === k ? 'kreska-przed' : ''} ${szczelina === k + 1 && k === zadania.length - 1 ? 'kreska-po' : ''}`}
              data-zadanie={c.id}
              onContextMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, c })}
              onDragOver={(e) => {
                if (!nasze(e)) return
                e.preventDefault()
                e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                setSzczelina(e.clientY - r.top < r.height / 2 ? k : k + 1)
              }}
              onDrop={(e) => {
                if (!nasze(e)) return
                upusc(e, szczelina ?? k)
              }}
            >
              {edycja && (
                <button
                  draggable
                  className="linear-grip zadania-grip"
                  title="Przeciągnij — do Linii albo w inne miejsce listy"
                  aria-label={`Przeciągnij zadanie ${c.name}`}
                  onDragStart={(e) => {
                    e.stopPropagation()
                    e.dataTransfer.setData(ZADANIE_MIME, JSON.stringify({ sektorId, conceptId: c.id }))
                    e.dataTransfer.effectAllowed = 'move'
                    const karta = e.currentTarget.closest('.zadania-pasek-zadanie')
                    if (karta) e.dataTransfer.setDragImage(karta, 20, 20)
                  }}
                >
                  <Icon name="przesun" size={1.05} />
                </button>
              )}
              <div className="zadania-pasek-kafelek">
                <ZadanieWLinii
                  c={c}
                  wersje={wersje.filter((v) => v.conceptId === c.id)}
                  onMenu={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu({ x: r.left, y: r.bottom + 4, c })
                  }}
                />
              </div>
            </div>
          ))}
          {!zadania.length && <p className="zadania-pasek-pusto">Upuść zadanie tutaj.</p>}
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
