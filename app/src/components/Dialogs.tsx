import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

/** Własne okienka pytań zamiast systemowych `confirm` i `prompt`.
 *
 *  Systemowe okienka wyglądają jak komunikat przeglądarki, nie jak część
 *  programu: obcy krój, obcy kolor, przycisk „OK", który nic nie mówi.
 *  Tutaj pytanie ma tytuł, wyjaśnienie i przycisk nazwany czynnością
 *  („Usuń", „Zapisz"), a rzeczy nieodwracalne są czerwone.
 *
 *  Wołanie zostaje takie samo jak dawniej — tylko z `await`:
 *      if (await dlg.confirm({ … })) …
 *      const name = await dlg.prompt({ … })   // null = anulowano */

interface ConfirmOpts {
  title: string
  /** Co się właściwie stanie — pełnym zdaniem, nie skrótem. */
  message?: string
  /** Napis na przycisku potwierdzenia; domyślnie „OK". */
  confirmLabel?: string
  /** Czerwony przycisk — dla rzeczy, których nie da się cofnąć. */
  danger?: boolean
}

interface PromptOpts {
  title: string
  message?: string
  /** Podpis nad polem, gdy sam tytuł nie wystarcza. */
  label?: string
  value?: string
  placeholder?: string
  confirmLabel?: string
  /** Czy puste pole wolno zatwierdzić (np. „etykieta wersji: brak"). */
  allowEmpty?: boolean
}

/** Wybór jednej rzeczy z listy — np. „do której ścieżki?". Lepszy od pytania
 *  z polem tekstowym: nie da się wpisać czegoś, czego nie ma. */
interface ChooseOpts {
  title: string
  message?: string
  options: { id: string; label: string; hint?: string }[]
  /** Napis na przycisku rezygnacji; domyślnie „Anuluj". */
  cancelLabel?: string
}

interface Dialogs {
  confirm: (opts: ConfirmOpts) => Promise<boolean>
  prompt: (opts: PromptOpts) => Promise<string | null>
  choose: (opts: ChooseOpts) => Promise<string | null>
}

const Ctx = createContext<Dialogs | null>(null)

/** Zapasowe okienka systemowe — gdyby ktoś zawołał hook spoza dostawcy.
 *  Lepsze brzydkie pytanie niż ciche nic. */
const fallback: Dialogs = {
  confirm: async (o) => window.confirm([o.title, o.message].filter(Boolean).join('\n\n')),
  prompt: async (o) => window.prompt(o.title, o.value ?? ''),
  choose: async (o) => o.options[0]?.id ?? null,
}

export const useDialogs = (): Dialogs => useContext(Ctx) ?? fallback

type Otwarte =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: 'choose'; opts: ChooseOpts; resolve: (v: string | null) => void }

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Otwarte | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setOpen({ kind: 'confirm', opts, resolve })),
    [],
  )
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => setOpen({ kind: 'prompt', opts, resolve })),
    [],
  )

  const choose = useCallback(
    (opts: ChooseOpts) =>
      new Promise<string | null>((resolve) => setOpen({ kind: 'choose', opts, resolve })),
    [],
  )

  const zamknij = (wynik: boolean | string | null) => {
    if (!open) return
    setOpen(null)
    if (open.kind === 'confirm') open.resolve(wynik as boolean)
    else open.resolve(wynik as string | null)
  }

  // stała tożsamość: inaczej każdy render dostawcy unieważniałby zapamiętane
  // obiekty u odbiorców (m.in. api mapy, od którego zależy jej płynność)
  const api = useMemo(() => ({ confirm, prompt, choose }), [confirm, prompt, choose])

  return (
    <Ctx.Provider value={api}>
      {children}
      {open?.kind === 'confirm' && (
        <ConfirmBox opts={open.opts} onDone={(v) => zamknij(v)} />
      )}
      {open?.kind === 'prompt' && (
        <PromptBox opts={open.opts} onDone={(v) => zamknij(v)} />
      )}
      {open?.kind === 'choose' && (
        <ChooseBox opts={open.opts} onDone={(v) => zamknij(v)} />
      )}
    </Ctx.Provider>
  )
}

/** Escape zamyka, Enter potwierdza — wspólne dla obu okienek. */
function useKlawisze(onCancel: () => void, onOk: () => void, wPolu = false) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter' && !wPolu) {
        onOk()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCancel, onOk, wPolu])
}

function ConfirmBox({ opts, onDone }: { opts: ConfirmOpts; onDone: (v: boolean) => void }) {
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => okRef.current?.focus(), [])
  useKlawisze(
    () => onDone(false),
    () => onDone(true),
  )

  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(false)}>
      <div
        className={`modal ask-dialog ${opts.danger ? 'grozne' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="ask-title">{opts.title}</h3>
        {opts.message && <p className="ask-message">{opts.message}</p>}
        <footer className="ask-foot">
          <button className="btn" onClick={() => onDone(false)}>
            Anuluj
          </button>
          <button
            ref={okRef}
            className={`btn ${opts.danger ? 'btn-danger-strong' : 'btn-primary'}`}
            onClick={() => onDone(true)}
          >
            {opts.confirmLabel ?? 'OK'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function PromptBox({
  opts,
  onDone,
}: {
  opts: PromptOpts
  onDone: (v: string | null) => void
}) {
  const [draft, setDraft] = useState(opts.value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.select(), [])
  const gotowe = opts.allowEmpty || draft.trim() !== ''
  useKlawisze(
    () => onDone(null),
    () => gotowe && onDone(draft.trim()),
    true,
  )

  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <div className="modal ask-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="ask-title">{opts.title}</h3>
        {opts.message && <p className="ask-message">{opts.message}</p>}
        {opts.label && <label className="ask-label">{opts.label}</label>}
        <input
          ref={inputRef}
          className="input ask-input"
          value={draft}
          placeholder={opts.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && gotowe) onDone(draft.trim())
          }}
        />
        <footer className="ask-foot">
          <button className="btn" onClick={() => onDone(null)}>
            Anuluj
          </button>
          <button
            className="btn btn-primary"
            disabled={!gotowe}
            onClick={() => onDone(draft.trim())}
          >
            {opts.confirmLabel ?? 'Zapisz'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Wybór z listy. Każda pozycja jest przyciskiem — jedno kliknięcie kończy
 *  pytanie, bez osobnego „OK". */
function ChooseBox({ opts, onDone }: { opts: ChooseOpts; onDone: (v: string | null) => void }) {
  useKlawisze(
    () => onDone(null),
    () => {},
    true,
  )

  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <div className="modal ask-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="ask-title">{opts.title}</h3>
        {opts.message && <p className="ask-message">{opts.message}</p>}
        <div className="ask-lista">
          {opts.options.map((o) => (
            <button key={o.id} className="ask-lista-poz" onClick={() => onDone(o.id)}>
              <span className="ask-lista-nazwa">{o.label}</span>
              {o.hint && <span className="ask-lista-opis">{o.hint}</span>}
            </button>
          ))}
        </div>
        <footer className="ask-foot">
          <button className="btn" onClick={() => onDone(null)}>
            {opts.cancelLabel ?? 'Anuluj'}
          </button>
        </footer>
      </div>
    </div>
  )
}
