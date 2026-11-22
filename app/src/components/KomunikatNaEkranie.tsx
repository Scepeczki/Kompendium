import { useEffect, useState } from 'react'

/** Komunikaty („Polecenie w schowku" itp.) na ekranach, które zasłaniają
 *  boczny pasek — tam zwykle się pokazują. */
export function KomunikatNaEkranie() {
  const [tekst, setTekst] = useState<string | null>(null)
  useEffect(() => {
    let t: number | undefined
    const h = (e: Event) => {
      setTekst(String((e as CustomEvent).detail ?? ''))
      window.clearTimeout(t)
      t = window.setTimeout(() => setTekst(null), 3500)
    }
    window.addEventListener('komp:komunikat', h)
    return () => {
      window.removeEventListener('komp:komunikat', h)
      window.clearTimeout(t)
    }
  }, [])
  if (!tekst) return null
  return (
    <div className="komunikat-ekran" role="status">
      {tekst}
    </div>
  )
}
