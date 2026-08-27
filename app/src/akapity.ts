/** Dzielenie tekstu na akapity — po to, żeby dało się postawić pasek stron
 *  w środku kafelka, a nie tylko na jego granicy.
 *
 *  „Akapit" to tu blok najwyższego poziomu: to, co w markdownie rozdziela
 *  pusta linia. Ale nie każda pusta linia rozdziela: w bloku `$$…$$` i w
 *  płocie z odwrotnych apostrofów pusta linia należy do środka i podział
 *  tam rozbiłby wzór albo listing.
 *
 *  Ważna jest sama powtarzalność: pasek pamięta „ile akapitów stoi przede
 *  mną", więc ta funkcja policzona dwa razy na tym samym tekście musi dać
 *  ten sam wynik. Dopóki tak jest, cięcie zawsze wraca w to samo miejsce. */
export function blokiTresci(md: string): string[] {
  const linie = md.replace(/\r\n?/g, '\n').split('\n')
  const bloki: string[] = []
  let biezacy: string[] = []
  let wPlocie = false
  let weWzorze = false

  const zamknij = () => {
    const tekst = biezacy.join('\n').trim()
    if (tekst) bloki.push(tekst)
    biezacy = []
  }

  for (const linia of linie) {
    const goly = linia.trim()
    if (!wPlocie && !weWzorze && goly === '') {
      zamknij()
      continue
    }
    if (!weWzorze && /^(```|~~~)/.test(goly)) wPlocie = !wPlocie
    // `$$` osobno w linii otwiera i zamyka blok; `$$x$$` w jednej linii nie
    else if (!wPlocie && goly === '$$') weWzorze = !weWzorze
    biezacy.push(linia)
  }
  zamknij()
  return bloki
}

/** Z powrotem w jeden tekst — pusta linia między akapitami. */
export function polaczBloki(bloki: string[]): string {
  return bloki.filter((b) => b.trim()).join('\n\n')
}
