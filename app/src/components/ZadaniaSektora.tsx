import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { BlockShell } from './BlockShell'
import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { naprawTypZadan, odepnijZadanie, przesunZadanie, usunZadanie, utworzZadania, wstawZadaniaNaListe } from '../nauka'
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
/** Znacznik przy przeciąganiu z Linii: ciągnie się samo zadanie (albo same zadania). */
export const ZNACZNIK_ZADANIA = 'text/x-komp-jest-zadanie'

/** Czy właśnie przeciąga się ZADANIE (z listy albo z Linii) — wtedy pusta
 *  lista też się pokazuje, żeby było na co upuścić. Przy zwykłych kafelkach
 *  nie: wyskakujące listy przesuwały treść pod kursorem. */
function useCiagnie() {
  const [ciagnie, setCiagnie] = useState(false)
  useEffect(() => {
    const start = (e: DragEvent) => {
      const t = Array.from(e.dataTransfer?.types ?? [])
      if (t.includes(ZNACZNIK_ZADANIA) || t.includes(ZADANIE_MIME)) setCiagnie(true)
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

/** Sektory, których lista zadań jest rozwinięta (na czas działania programu). */
const otwarteListy = new Set<string>()

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
  onZLinii?: (sektorId: string, nodeIds: string[], index: number) => void
}) {
  const j = useLiveQuery(() => db.nauka.get(sektorId), [sektorId])
  const zadania = useZadania(j) ?? []
  // Lista stoi pod OSTATNIM kafelkiem sektora — gdy on się zmienia (zadanie
  // wstawione na koniec, wyjęte), lista przeskakuje i rysuje się od nowa.
  // Rozwinięcie pamiętamy więc dla sektora, a nie dla tego jednego miejsca.
  const [otwarty, ustawOtwarty] = useState(() => otwarteListy.has(sektorId))
  const setOtwarty = (f: (o: boolean) => boolean) =>
    ustawOtwarty((o) => {
      const n = f(o)
      if (n) otwarteListy.add(sektorId)
      else otwarteListy.delete(sektorId)
      return n
    })
  const [menu, setMenu] = useState<{ x: number; y: number; c: Concept } | null>(null)
  /** Gdzie wpadnie upuszczany kafelek (indeks na liście). */
  const [szczelina, setSzczelina] = useState<number | null>(null)
  const ciagnie = useCiagnie()
  /** Zaznaczone zadania (Ctrl+klik, Shift+klik) — przeciąga się je razem. */
  const [zazn, setZazn] = useState<Set<string>>(new Set())
  const ostatniKlik = useRef<string | null>(null)
  useEffect(() => {
    if (!zazn.size) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setZazn(new Set())
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [zazn.size])
  useEffect(() => {
    if (ciagnie) return
    setSzczelina(null)
    // po każdym przeciągnięciu — także gdy element, z którego ciągnięto, zniknął
    setZazn(new Set())
  }, [ciagnie])
  const ids = zadania.map((c) => c.id)
  const dlg = useDialogs()
  /** Usuwa zaznaczone zadania na dobre — po jednym pytaniu o wszystkie. */
  const usunZaznaczone = async () => {
    const wybrane = zadania.filter((c) => zazn.has(c.id))
    if (!wybrane.length) return
    const ok = await dlg.confirm({
      title: wybrane.length === 1 ? `Usunąć zadanie „${wybrane[0].name}" na dobre?` : `Usunąć zaznaczone zadania (${wybrane.length}) na dobre?`,
      message: `${wybrane.map((c) => `„${c.name}"`).join(', ')} — kafelki znikną razem z treścią i rozwiązaniami.`,
      confirmLabel: wybrane.length === 1 ? 'Usuń zadanie' : `Usuń ${wybrane.length} zadania`,
      danger: true,
    })
    if (!ok) return
    for (const c of wybrane) await usunZadanie(sektorId, c.id)
    setZazn(new Set())
  }
  const usunRef = useRef(usunZaznaczone)
  usunRef.current = usunZaznaczone
  useEffect(() => {
    if (!zazn.size) return
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'Delete' || t?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      e.stopPropagation()
      void usunRef.current()
    }
    // przed Linią (ona też usuwa zaznaczone klawiszem Delete)
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [zazn.size])
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
        const p = JSON.parse(zad) as { sektorId: string; conceptId: string; conceptIds?: string[] }
        void wstawZadaniaNaListe(sektorId, p.conceptIds ?? [p.conceptId], gdzie)
        setZazn(new Set())
      } catch {
        /* obce dane */
      }
      return
    }
    const seg = e.dataTransfer.getData(SEG_MIME_LINII)
    if (!seg) return
    // kilka zaznaczonych w Linii przychodzi jako lista
    let nodeIds: string[] = [seg]
    if (seg.startsWith('[')) {
      try {
        nodeIds = JSON.parse(seg) as string[]
      } catch {
        return
      }
    }
    onZLinii?.(sektorId, nodeIds, gdzie)
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
        // …oprócz uchwytu: wstrzymane wciśnięcie nie pozwala zacząć przeciągania
        const t = e.target as Element
        if (t.closest('button') && !t.closest('.zadania-grip')) e.preventDefault()
      }}
      // nad paskiem (poza pozycjami) — na koniec listy. Sam się nie rozwija:
      // rozwinięcie pod kursorem przesuwało całą Linię w trakcie przeciągania.
      // Bez zatrzymywania zdarzenia — Linia ma się dowiedzieć, że jesteśmy
      // nad listą, i zgasić swoją kreskę.
      onDragOver={(e) => {
        if (!nasze(e)) return
        e.preventDefault()
        // z wciśniętym Ctrl (po zaznaczaniu) przeglądarka chce „kopiować"
        e.dataTransfer.dropEffect = 'move'
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
      {edycja && zazn.size > 0 && (
        <div className="zadania-pasek-zaznaczone" data-zaznaczone-zadania>
          <span>
            Zaznaczone: <strong>{zazn.size}</strong> — przeciągnij jedno z nich, pójdą razem
          </span>
          <button className="btn btn-maly" onClick={() => setZazn(new Set())}>
            Odznacz
          </button>
          <button className="btn btn-maly btn-danger" data-usun-zaznaczone onClick={() => void usunZaznaczone()}>
            <Icon name="usun" size={0.9} /> Usuń zaznaczone…
          </button>
        </div>
      )}
      {otwarty && (
        <div className="zadania-pasek-tresc">
          {zadania.map((c, k) => (
            <div
              key={c.id}
              className={`zadania-pasek-zadanie ${zazn.has(c.id) ? 'zaznaczone' : ''} ${szczelina === k ? 'kreska-przed' : ''} ${szczelina === k + 1 && k === zadania.length - 1 ? 'kreska-po' : ''}`}
              data-zadanie={c.id}
              onContextMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, c })}
              // Ctrl+klik dokłada do zaznaczenia, Shift+klik — zakres (jak w Linii)
              onClickCapture={(e) => {
                if (!edycja || !(e.ctrlKey || e.metaKey || e.shiftKey)) return
                e.preventDefault()
                e.stopPropagation()
                setZazn((z) => {
                  const n = new Set(z)
                  const od = ostatniKlik.current ? ids.indexOf(ostatniKlik.current) : -1
                  if (e.shiftKey && od >= 0) {
                    const [a, b] = [Math.min(od, k), Math.max(od, k)]
                    for (const x of ids.slice(a, b + 1)) n.add(x)
                  } else if (n.has(c.id)) n.delete(c.id)
                  else n.add(c.id)
                  return n
                })
                ostatniKlik.current = c.id
              }}
              onDragOver={(e) => {
                if (!nasze(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
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
                  title="Przeciągnij — do Linii albo w inne miejsce listy. Ctrl+klik w zadania zaznacza kilka naraz"
                  aria-label={`Przeciągnij zadanie ${c.name}`}
                  onDragStart={(e) => {
                    e.stopPropagation()
                    // zaznaczone przeciąga się razem (w kolejności listy)
                    const grupa = zazn.has(c.id) && zazn.size > 1 ? ids.filter((x) => zazn.has(x)) : [c.id]
                    e.dataTransfer.setData(ZADANIE_MIME, JSON.stringify({ sektorId, conceptId: grupa[0], conceptIds: grupa }))
                    e.dataTransfer.effectAllowed = 'copyMove'
                    const karta = e.currentTarget.closest('.zadania-pasek-zadanie')
                    if (karta) e.dataTransfer.setDragImage(karta, 20, 20)
                  }}
                  // po przeciągnięciu zaznaczenie już nic nie znaczy — inaczej następne
                  // pojedyncze przeciągnięcie zabrałoby całą dawną grupę
                  onDragEnd={() => setZazn(new Set())}
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
