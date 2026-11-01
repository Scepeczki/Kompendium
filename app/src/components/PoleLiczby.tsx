import { useEffect, useState } from 'react'

/** Liczbę przyjmujemy dopiero, gdy mieści się w zakresie. Inaczej pierwsza
 *  cyfra „24" byłaby wielkością za małą i pole poprawiałoby ją w trakcie pisania. */
export function PoleLiczby({
  wartosc,
  min,
  max,
  tytul,
  onZmien,
}: {
  wartosc: number
  min: number
  max: number
  tytul: string
  onZmien: (v: number) => void
}) {
  const [tekst, setTekst] = useState(String(wartosc))
  useEffect(() => setTekst(String(wartosc)), [wartosc])

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={tekst}
      title={tytul}
      aria-label={tytul}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setTekst(e.target.value)
        const n = Number(e.target.value)
        if (Number.isInteger(n) && n >= min && n <= max) onZmien(n)
      }}
      onBlur={() => setTekst(String(wartosc))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
