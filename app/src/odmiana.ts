/** Liczba z rzeczownikiem w polskiej odmianie: 1 kafelek, 2 kafelki, 5 kafelków. */
export function odmien(n: number, jeden: string, kilka: string, wiele: string): string {
  const dziesiatki = n % 100
  const jednosci = n % 10
  const slowo =
    n === 1
      ? jeden
      : jednosci >= 2 && jednosci <= 4 && (dziesiatki < 12 || dziesiatki > 14)
        ? kilka
        : wiele
  return `${n} ${slowo}`
}
