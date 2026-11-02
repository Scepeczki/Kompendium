import Dexie, { type Table } from 'dexie'
import { BUILTIN_BLOCK_TYPES, isSymmetricRelation } from './types'
import { topoOrder } from './topo'
import type {
  BlockType,
  BlockTypeDef,
  BlockVersion,
  Concept,
  Folder,
  FolderKind,
  LearningPath,
  PathNode,
  WlasneTresci,
  PdfDoc,
  Relation,
  RelationKind,
  Subpage,
  Obraz,
} from './types'

class KompendiumDB extends Dexie {
  concepts!: Table<Concept, string>
  versions!: Table<BlockVersion, string>
  pdfs!: Table<PdfDoc, string>
  folders!: Table<Folder, string>
  paths!: Table<LearningPath, string>
  subpages!: Table<Subpage, string>
  relations!: Table<Relation, string>
  blockTypes!: Table<BlockTypeDef, string>
  obrazy!: Table<Obraz, string>

  constructor() {
    super('kompendium')
    this.version(1).stores({
      concepts: 'id, name, type, createdAt, updatedAt, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt',
    })
    // v2: foldery + ręczna kolejność kafelków. Istniejące dane dostają
    // folderId=null (poziom główny) i kolejność wg daty utworzenia.
    this.version(2)
      .stores({
        concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
        versions: 'id, conceptId, [conceptId+version], createdAt',
        pdfs: 'id, title, addedAt, folderId',
        folders: 'id, kind, parentId, name',
      })
      .upgrade(async (tx) => {
        let i = 0
        await tx
          .table('concepts')
          .toCollection()
          .modify((c) => {
            c.folderId = null
            c.order = ++i
          })
        await tx
          .table('pdfs')
          .toCollection()
          .modify((p) => {
            p.folderId = null
          })
      })
    // v3: foldery dostają wspólną kolejność z kafelkami (przeplatanie).
    // Istniejące foldery lądują przed kafelkami (kolejność ujemna), jak dotąd.
    this.version(3)
      .stores({
        concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
        versions: 'id, conceptId, [conceptId+version], createdAt',
        pdfs: 'id, title, addedAt, folderId',
        folders: 'id, kind, parentId, name',
      })
      .upgrade(async (tx) => {
        const all = (await tx.table('folders').toArray()) as Folder[]
        const byParent = new Map<string, Folder[]>()
        for (const f of all) {
          const key = `${f.kind}:${f.parentId ?? ''}`
          byParent.set(key, [...(byParent.get(key) ?? []), f])
        }
        for (const group of byParent.values()) {
          group.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
          for (let i = 0; i < group.length; i++) {
            await tx.table('folders').update(group[i].id, { order: i - group.length })
          }
        }
      })
    // v4: ścieżki (Poziom Przestrzenny).
    this.version(4).stores({
      concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt, folderId',
      folders: 'id, kind, parentId, name',
      paths: 'id, name, folderId, createdAt, updatedAt',
    })
    // v5: strony kafelka (dowody itp. — dodatkowe treści pojęcia).
    this.version(5).stores({
      concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt, folderId',
      folders: 'id, kind, parentId, name',
      paths: 'id, name, folderId, createdAt, updatedAt',
      subpages: 'id, conceptId',
    })
    // v6: relacje między kafelkami (uogólnienie, równoważność, część, wymaganie).
    this.version(6).stores({
      concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt, folderId',
      folders: 'id, kind, parentId, name',
      paths: 'id, name, folderId, createdAt, updatedAt',
      subpages: 'id, conceptId',
      relations: 'id, fromId, toId, kind',
    })
    // v7: typy kafelków jako dane, a nie zamknięta lista w kodzie.
    this.version(7)
      .stores({
        concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
        versions: 'id, conceptId, [conceptId+version], createdAt',
        pdfs: 'id, title, addedAt, folderId',
        folders: 'id, kind, parentId, name',
        paths: 'id, name, folderId, createdAt, updatedAt',
        subpages: 'id, conceptId',
        relations: 'id, fromId, toId, kind',
        blockTypes: 'id, order',
      })
      .upgrade(async (tx) => {
        // barwy typów mieszkały dotąd w localStorage jako nadpisania stylów —
        // przenosimy je, żeby nikt nie stracił swoich kolorów przy aktualizacji
        await tx.table('blockTypes').bulkAdd(
          BUILTIN_BLOCK_TYPES.map((t) => {
            const own = localStorage.getItem(`ui.color.${t.id}`)
            return own && /^#[0-9a-f]{6}$/i.test(own) ? { ...t, color: own } : { ...t }
          }),
        )
      })
    // v8: strony należą do WERSJI, nie do pojęcia.
    //
    // Wersje mają być niezależne — mogą mieć różną liczbę stron. Dotąd strona
    // wisiała przy pojęciu, więc usunięcie jej w jednej wersji zabierało ją
    // wszystkim naraz. Migracja nie kasuje niczego: istniejąca strona zostaje
    // przy wersji bieżącej, a każda pozostała wersja dostaje własną kopię z tą
    // samą treścią. Nikt nic nie traci, a od teraz wersje idą swoimi drogami.
    // Tylko nowa tabela: istniejące dane zostają nietknięte.
    this.version(9).stores({ obrazy: 'id, dodano' })
    this.version(8)
      .stores({
        concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
        versions: 'id, conceptId, [conceptId+version], createdAt',
        pdfs: 'id, title, addedAt, folderId',
        folders: 'id, kind, parentId, name',
        paths: 'id, name, folderId, createdAt, updatedAt',
        subpages: 'id, conceptId, versionId, [conceptId+versionId]',
        relations: 'id, fromId, toId, kind',
        blockTypes: 'id, order',
      })
      .upgrade(async (tx) => {
        const concepts = (await tx.table('concepts').toArray()) as Concept[]
        const versions = (await tx.table('versions').toArray()) as BlockVersion[]
        const strony = (await tx.table('subpages').toArray()) as Subpage[]
        const wgKlocka = new Map<string, BlockVersion[]>()
        for (const v of versions) {
          wgKlocka.set(v.conceptId, [...(wgKlocka.get(v.conceptId) ?? []), v])
        }
        const kopie: Subpage[] = []
        for (const s of strony) {
          const wersje = wgKlocka.get(s.conceptId) ?? []
          const biezaca =
            concepts.find((c) => c.id === s.conceptId)?.currentVersionId ?? wersje[0]?.id
          if (!biezaca) continue
          s.versionId = biezaca
          for (const v of wersje) {
            if (v.id === biezaca) continue
            kopie.push({ ...s, id: uid(), versionId: v.id })
          }
        }
        await tx.table('subpages').bulkPut(strony)
        if (kopie.length) await tx.table('subpages').bulkAdd(kopie)
      })
  }
}

export const db = new KompendiumDB()

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

// ---------------------------------------------------------------------------
// Typy kafelków (dane, nie kod)
// ---------------------------------------------------------------------------

/** Barwy fabryczne sprzed nowego wyglądu. */
const DAWNE_BARWY: Record<string, string> = {
  definicja: '#31619e',
  twierdzenie: '#6d4a9e',
  lemat: '#8a5fb0',
  przyklad: '#3d7a52',
  zadanie: '#2f7b7b',
  uwaga: '#a9742c',
  dowod: '#6b6b66',
}

/** Jednorazowa zmiana palety. Przestrajamy tylko typy, które wciąż mają barwę
 *  fabryczną — kolor wybrany w Ustawieniach to decyzja użytkownika. */
async function przejdzNaNowaPalete(): Promise<void> {
  const znacznik = 'ui.paleta.v2'
  if (localStorage.getItem(znacznik)) return
  localStorage.setItem(znacznik, '1')
  for (const wzor of BUILTIN_BLOCK_TYPES) {
    const typ = await db.blockTypes.get(wzor.id)
    if (typ && typ.color.toLowerCase() === DAWNE_BARWY[wzor.id]) {
      await db.blockTypes.update(wzor.id, { color: wzor.color })
    }
  }
}

/** Wsypuje fabryczne typy do pustej tabeli. Świeża baza nie przechodzi przez
 *  `upgrade`, więc bez tego startowałaby bez ani jednego typu. */
export async function seedBlockTypes(): Promise<void> {
  if ((await db.blockTypes.count()) === 0) {
    await db.blockTypes.bulkAdd(BUILTIN_BLOCK_TYPES.map((t) => ({ ...t })))
    return
  }
  await przejdzNaNowaPalete()
  // Jednorazowe dosypanie dla baz założonych, zanim rodzaje umiały mieszkać
  // w ścieżce. Robimy to raz — potem użytkownik jest panem swojej listy
  // i skasowanego „Zadania" nie wskrzeszamy przy każdym uruchomieniu.
  const znacznik = 'ui.rodzajeWSciezce.v1'
  if (localStorage.getItem(znacznik)) return
  localStorage.setItem(znacznik, '1')
  const przyklad = await db.blockTypes.get('przyklad')
  if (przyklad && przyklad.wSciezce === undefined) {
    await db.blockTypes.update('przyklad', { wSciezce: true })
  }
  if (!(await db.blockTypes.get('zadanie'))) {
    const wzor = BUILTIN_BLOCK_TYPES.find((t) => t.id === 'zadanie')!
    const zajete = await db.blockTypes.toArray()
    await db.blockTypes.add({
      ...wzor,
      order: zajete.length ? Math.max(...zajete.map((t) => t.order)) + 1 : wzor.order,
    })
  }
}

/** Przypina kafelek do ścieżki niezależnie od jego rodzaju — ręczne
 *  „trzymaj to tutaj" spod prawego przycisku. Rodzaje załatwiają zwykły
 *  przypadek, ale użytkownik musi móc zdecydować o pojedynczym kafelku. */
export async function keepConceptInPath(pathId: string, conceptId: string) {
  await db.concepts.update(conceptId, { pathId })
}

/** Nowy własny typ — ląduje na końcu listy. */
export async function addBlockType(
  label: string,
  short: string,
  color: string,
): Promise<string> {
  const all = await db.blockTypes.toArray()
  const id = uid()
  await db.blockTypes.add({
    id,
    label,
    short,
    color,
    order: all.length ? Math.max(...all.map((t) => t.order)) + 1 : 1,
  })
  return id
}

export async function updateBlockType(
  id: string,
  patch: Partial<
    Pick<BlockTypeDef, 'label' | 'short' | 'color' | 'hidden' | 'order' | 'wSciezce'>
  >,
) {
  await db.blockTypes.update(id, patch)
}

/** Ile kafelków używa danego typu — usuwanie musi o tym powiedzieć. */
export async function countBlocksOfType(id: string): Promise<number> {
  return db.concepts.where('type').equals(id).count()
}

/** Usuwa typ — także fabryczny. Kafelki, które go używały, dostają `zamiennik`,
 *  więc nigdy nie zostają z typem, którego nie ma (plakietka pokazywałaby
 *  wtedy surowe id). Jedyna granica: musi zostać przynajmniej jeden typ.
 *  Skasowane fabryczne wraca `restoreBuiltinBlockTypes()`. */
export async function deleteBlockType(id: string, zamiennik: string): Promise<void> {
  if (id === zamiennik) return
  const zostanie = await db.blockTypes.count()
  if (zostanie <= 1) return
  await db.transaction('rw', [db.blockTypes, db.concepts], async () => {
    await db.concepts.where('type').equals(id).modify({ type: zamiennik })
    await db.blockTypes.delete(id)
  })
}

/** Dopisuje z powrotem te fabryczne typy, których w tabeli nie ma.
 *  Istniejących nie rusza — przemianowanej „Definicji" nikt nie cofa. */
export async function restoreBuiltinBlockTypes(): Promise<number> {
  const sa = new Set((await db.blockTypes.toArray()).map((t) => t.id))
  const brakuje = BUILTIN_BLOCK_TYPES.filter((t) => !sa.has(t.id))
  if (brakuje.length) await db.blockTypes.bulkAdd(brakuje.map((t) => ({ ...t })))
  return brakuje.length
}

/** Kolejność typów po przeciągnięciu na liście w Ustawieniach. */
export async function reorderBlockTypes(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.blockTypes, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.blockTypes.update(orderedIds[i], { order: i + 1 })
    }
  })
}

/** Kolejność „na końcu" danego folderu — wspólna dla kafelków, ścieżek i podfolderów. */
export async function nextConceptOrder(folderId: string | null): Promise<number> {
  const concepts = await db.concepts.toArray()
  const folders = await db.folders.where('kind').equals('concepts').toArray()
  const paths = await db.paths.toArray()
  const orders = [
    ...concepts
      .filter((c) => (c.folderId ?? null) === folderId)
      .map((c) => c.order ?? 0),
    ...folders
      .filter((f) => (f.parentId ?? null) === folderId)
      .map((f) => f.order ?? 0),
    ...paths
      .filter((p) => (p.folderId ?? null) === folderId)
      .map((p) => p.order ?? 0),
  ]
  return orders.length ? Math.max(...orders) + 1 : 1
}

/** Tworzy nowe pojęcie z pustą wersją v1 i zwraca jego id. */
/** Tworzy kafelek. `pathId` robi z niego własność ścieżki: taki kafelek nie
 *  pokazuje się w bibliotece po lewej (tak trzymamy przykłady przy wykładzie,
 *  do którego należą). */
export async function createConcept(
  type: BlockType = 'definicja',
  pathId?: string,
): Promise<string> {
  const conceptId = uid()
  const versionId = uid()
  const t = now()
  const order = await nextConceptOrder(null)
  await db.transaction('rw', db.concepts, db.versions, async () => {
    await db.versions.add({
      id: versionId,
      conceptId,
      version: 1,
      content: '',
      sourceRefs: [],
      createdAt: t,
      updatedAt: t,
    })
    await db.concepts.add({
      id: conceptId,
      name: 'Nowe pojęcie',
      type,
      tags: [],
      folderId: null,
      ...(pathId ? { pathId } : {}),
      order,
      createdAt: t,
      updatedAt: t,
      currentVersionId: versionId,
    })
  })
  return conceptId
}

/** Zdejmuje z kafelka przypisanie do ścieżki — od tej chwili widać go w
 *  bibliotece. Używamy tego zamiast kasowania: kafelek wyjęty ze ścieżki ma
 *  gdzieś wylądować, a nie zniknąć. */
export async function releaseConceptToLibrary(conceptId: string) {
  await db.concepts
    .where('id')
    .equals(conceptId)
    .modify((c) => {
      delete c.pathId
    })
}

/** Wszystkie kafelki należące do ścieżki (przykłady zrobione w środku). */
export async function conceptsOwnedByPath(pathId: string): Promise<Concept[]> {
  const all = await db.concepts.toArray()
  return all.filter((c) => c.pathId === pathId)
}

export async function updateConcept(
  id: string,
  patch: Partial<Pick<Concept, 'name' | 'type' | 'tags' | 'mainPageName' | 'icon' | 'iconColor' | 'iconText'>>,
) {
  await db.concepts.update(id, { ...patch, updatedAt: now() })
}

/** Przenosi kafelek do folderu (i/lub na podaną pozycję). Nie zmienia updatedAt —
 *  porządkowanie to nie edycja treści. */
export async function moveConcept(
  id: string,
  folderId: string | null,
  order?: number,
) {
  const o = order ?? (await nextConceptOrder(folderId))
  await db.concepts.update(id, { folderId, order: o })
}

export async function updateVersion(
  id: string,
  patch: Partial<Pick<BlockVersion, 'content' | 'label' | 'sourceRefs' | 'sourceGroups'>>,
) {
  await db.versions.update(id, { ...patch, updatedAt: now() })
  const v = await db.versions.get(id)
  if (v) await db.concepts.update(v.conceptId, { updatedAt: now() })
}

/** „Zapisz jako v(n+1)": kopiuje najnowszą wersję jako nową i ustawia ją jako aktualną. */
export async function saveAsNewVersion(conceptId: string, label?: string): Promise<string> {
  const versions = await db.versions.where('conceptId').equals(conceptId).toArray()
  const latest = versions.sort((a, b) => b.version - a.version)[0]
  const id = uid()
  const t = now()
  // strony też są własnością wersji — nowa dostaje swoje kopie, żeby dalej
  // można je było zmieniać i kasować bez ruszania poprzedniej
  const strony = await db.subpages
    .where('[conceptId+versionId]')
    .equals([conceptId, latest.id])
    .toArray()
  await db.transaction('rw', db.concepts, db.versions, db.subpages, async () => {
    await db.versions.add({
      id,
      conceptId,
      version: latest.version + 1,
      label,
      content: latest.content,
      sourceRefs: latest.sourceRefs.map((r) => ({ ...r, id: uid() })),
      sourceGroups: latest.sourceGroups ? [...latest.sourceGroups] : undefined,
      createdAt: t,
      updatedAt: t,
    })
    if (strony.length) {
      await db.subpages.bulkAdd(
        strony.map((s) => ({ ...s, id: uid(), versionId: id, createdAt: t, updatedAt: t })),
      )
    }
    await db.concepts.update(conceptId, { currentVersionId: id, updatedAt: t })
  })
  return id
}

/** Kafelek w ścieżce bez wskazanej wersji pokazuje wersję bieżącą, a tekst
 *  napisany w ścieżce jest przypisany do konkretnej wersji. Gdy bieżąca się
 *  zmienia, taki tekst przestałby być widoczny — więc przypinamy węzeł do
 *  wersji, przy której powstał. */
export function przypnijTekstDoWersji(
  nodes: PathNode[],
  conceptId: string,
  wersjaId: string,
): PathNode[] {
  const maTekst = (m?: WlasneTresci) =>
    Object.keys(m ?? {}).some((k) => k.startsWith(`${wersjaId}:`))
  return nodes.map((n) => {
    if (n.kind === 'block' && n.conceptId === conceptId && !n.versionId && maTekst(n.wlasneTresci)) {
      return { ...n, versionId: wersjaId }
    }
    if (n.kind === 'fusion') {
      return {
        ...n,
        parts: n.parts.map((p) =>
          p.conceptId === conceptId && !p.versionId && maTekst(p.wlasneTresci)
            ? { ...p, versionId: wersjaId }
            : p,
        ),
      }
    }
    return n
  })
}

/** „Wyślij do biblioteki": tekst napisany w ścieżce staje się nową wersją
 *  kafelka. Dotychczasowa wersja zostaje, więc nic nie przepada. Zwraca id
 *  nowej wersji i to, jakie id dostały jej kopie stron. */
export async function wyslijDoBiblioteki(
  conceptId: string,
  zWersji: string,
  stronaId: string | null,
  tekst: string,
  zPathId: string,
): Promise<{ wersjaId: string; mapaStron: Record<string, string> }> {
  const zrodlo = await db.versions.get(zWersji)
  const bylaBiezaca = (await db.concepts.get(conceptId))?.currentVersionId
  if (bylaBiezaca) {
    // ścieżka, z której wysyłamy, pilnuje tego sama (trzyma stan u siebie)
    await db.transaction('rw', db.paths, async () => {
      await db.paths.toCollection().modify((p) => {
        if (p.id !== zPathId) p.nodes = przypnijTekstDoWersji(p.nodes, conceptId, bylaBiezaca)
      })
    })
  }
  const stronyZrodla = await db.subpages.where('versionId').equals(zWersji).toArray()
  const wersjaId = await saveAsNewVersion(conceptId)
  // kopia powstaje z najnowszej wersji, a pisać można też na starszej
  const nowa = {
    content: stronaId ? (zrodlo?.content ?? '') : tekst,
    sourceRefs: (zrodlo?.sourceRefs ?? []).map((r) => ({ ...r, id: uid() })),
    sourceGroups: zrodlo?.sourceGroups,
  }
  await db.versions.update(wersjaId, nowa)
  // Kopie stron powstały z najnowszej wersji. Pisać można i na starszej, więc
  // strony wysyłanej wersji odnajdujemy po nazwie, a brakujące dokładamy.
  const kopie = await db.subpages.where('versionId').equals(wersjaId).toArray()
  const mapaStron: Record<string, string> = {}
  const t = now()
  for (const s of stronyZrodla) {
    const kopia = kopie.find((k) => k.name === s.name)
    const id = kopia?.id ?? uid()
    if (!kopia) {
      await db.subpages.add({ ...s, id, versionId: wersjaId, createdAt: t, updatedAt: t })
    }
    mapaStron[s.id] = id
    if (s.id === stronaId) await db.subpages.update(id, { content: tekst })
    else if (kopia) await db.subpages.update(id, { content: s.content })
  }
  return { wersjaId, mapaStron }
}

/** Zmienia etykietę wersji (metadane — dozwolone też dla starych wersji). */
export async function renameVersion(id: string, label: string | undefined) {
  await db.versions.update(id, { label })
}

/** Ustawia nową kolejność wersji pojęcia (numery v1..vn wg podanej listy id). */
export async function reorderVersions(conceptId: string, orderedIds: string[]) {
  await db.transaction('rw', db.versions, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.versions.update(orderedIds[i], { version: i + 1 })
    }
  })
  void conceptId
}

/** Usuwa wersję (nie ostatnią). Numeracja pozostałych jest scalana;
 *  jeśli usunięto wersję bieżącą, bieżącą staje się ostatnia z pozostałych. */
export async function deleteVersion(versionId: string) {
  await db.transaction('rw', db.concepts, db.versions, db.subpages, async () => {
    const v = await db.versions.get(versionId)
    if (!v) return
    const all = await db.versions.where('conceptId').equals(v.conceptId).toArray()
    if (all.length <= 1) return
    await db.versions.delete(versionId)
    // strony należą do wersji, więc znikają razem z nią (użytkownik został
    // o utracie treści zapytany przed wywołaniem)
    await db.subpages.where('versionId').equals(versionId).delete()
    const rest = all
      .filter((x) => x.id !== versionId)
      .sort((a, b) => a.version - b.version)
    for (let i = 0; i < rest.length; i++) {
      await db.versions.update(rest[i].id, { version: i + 1 })
    }
    const c = await db.concepts.get(v.conceptId)
    if (c && c.currentVersionId === versionId) {
      await db.concepts.update(c.id, {
        currentVersionId: rest[rest.length - 1].id,
      })
    }
  })
}

export async function deleteConcept(id: string) {
  await db.transaction(
    'rw',
    [db.concepts, db.versions, db.subpages, db.relations],
    async () => {
      await db.versions.where('conceptId').equals(id).delete()
      await db.subpages.where('conceptId').equals(id).delete()
      await db.relations.where('fromId').equals(id).delete()
      await db.relations.where('toId').equals(id).delete()
      await db.concepts.delete(id)
    },
  )
}

// ---------------------------------------------------------------------------
// Powielanie
// ---------------------------------------------------------------------------

/** Nazwa kopii: „Funkcja" → „Funkcja (kopia)" → „Funkcja (kopia 2)" …
 *  Numerujemy dopiero od drugiej kopii, bo tak się mówi po polsku. */
function copyName(base: string, taken: string[]): string {
  const first = `${base} (kopia)`
  if (!taken.includes(first)) return first
  for (let i = 2; ; i++) {
    const next = `${base} (kopia ${i})`
    if (!taken.includes(next)) return next
  }
}

/** Powiela kafelek z całą historią: wszystkie wersje, wszystkie strony.
 *  Kopia ląduje tuż obok pierwowzoru, w tym samym folderze.
 *
 *  Powiązań (relacji) celowo nie kopiujemy: mówią o konkretnym kafelku,
 *  a nie o jego treści — świeża kopia zaczyna bez cudzych zobowiązań. */
export async function duplicateConcept(id: string): Promise<string | null> {
  const src = await db.concepts.get(id)
  if (!src) return null
  const versions = await db.versions.where('conceptId').equals(id).toArray()
  const pages = await db.subpages.where('conceptId').equals(id).toArray()
  const siblings = await db.concepts.toArray()
  const newId = uid()
  const t = now()
  // mapowanie stare id wersji → nowe, żeby wskazanie bieżącej wersji przeżyło
  const verMap = new Map(versions.map((v) => [v.id, uid()]))

  await db.transaction('rw', [db.concepts, db.versions, db.subpages], async () => {
    await db.versions.bulkAdd(
      versions.map((v) => ({
        ...v,
        id: verMap.get(v.id)!,
        conceptId: newId,
        // źródła kopiujemy w głąb — inaczej obie wersje trzymałyby tę samą tablicę
        sourceRefs: v.sourceRefs.map((r) => ({ ...r })),
        sourceGroups: v.sourceGroups ? [...v.sourceGroups] : undefined,
        createdAt: t,
        updatedAt: t,
      })),
    )
    await db.subpages.bulkAdd(
      pages.map((p) => ({
        ...p,
        id: uid(),
        conceptId: newId,
        // strona należy do wersji, więc musi trafić do NOWEJ wersji, nie starej
        versionId: verMap.get(p.versionId) ?? p.versionId,
        createdAt: t,
        updatedAt: t,
      })),
    )
    await db.concepts.add({
      ...src,
      id: newId,
      name: copyName(
        src.name,
        siblings
          .filter((c) => (c.folderId ?? null) === (src.folderId ?? null))
          .map((c) => c.name),
      ),
      tags: [...src.tags],
      // ułamkowa kolejność: kopia siada zaraz za pierwowzorem
      order: (src.order ?? 0) + 0.5,
      currentVersionId: verMap.get(src.currentVersionId) ?? verMap.values().next().value!,
      createdAt: t,
      updatedAt: t,
    })
  })
  return newId
}

/** Powiela ścieżkę razem z układem kafelków. Kafelki zostają te same —
 *  ścieżka jest tylko sposobem ich ułożenia, a nie ich właścicielem. */
export async function duplicatePath(id: string): Promise<string | null> {
  const src = await db.paths.get(id)
  if (!src) return null
  const siblings = await db.paths.toArray()
  const newId = uid()
  const t = now()
  await db.paths.add({
    ...src,
    id: newId,
    name: copyName(
      src.name,
      siblings
        .filter((p) => (p.folderId ?? null) === (src.folderId ?? null))
        .map((p) => p.name),
    ),
    nodes: src.nodes.map((n) => ({ ...n })),
    edges: src.edges.map((e) => ({ ...e })),
    order: (src.order ?? 0) + 0.5,
    createdAt: t,
    updatedAt: t,
  })
  return newId
}

/** Powiela folder z całą zawartością: podfolderami, kafelkami i ścieżkami.
 *  Kopie kafelków powstają przez duplicateConcept, więc mają własne wersje
 *  i strony — zmiana w kopii nie rusza pierwowzoru. */
export async function duplicateFolder(id: string): Promise<string | null> {
  const src = await db.folders.get(id)
  if (!src) return null
  const allFolders = await db.folders.where('kind').equals('concepts').toArray()
  const newId = uid()
  await db.folders.add({
    ...src,
    id: newId,
    name: copyName(
      src.name,
      allFolders.filter((f) => (f.parentId ?? null) === (src.parentId ?? null)).map((f) => f.name),
    ),
    order: (src.order ?? 0) + 0.5,
    createdAt: now(),
  })

  /** Przepisuje zawartość folderu `from` do folderu `to` (rekurencyjnie). */
  const copyInto = async (from: string, to: string) => {
    const concepts = await db.concepts.where('folderId').equals(from).toArray()
    for (const c of concepts) {
      const copy = await duplicateConcept(c.id)
      if (copy) await db.concepts.update(copy, { folderId: to, name: c.name, order: c.order })
    }
    const paths = await db.paths.where('folderId').equals(from).toArray()
    for (const p of paths) {
      const copy = await duplicatePath(p.id)
      if (copy) await db.paths.update(copy, { folderId: to, name: p.name, order: p.order })
    }
    for (const sub of allFolders.filter((f) => f.parentId === from)) {
      const subId = uid()
      await db.folders.add({ ...sub, id: subId, parentId: to, createdAt: now() })
      await copyInto(sub.id, subId)
    }
  }
  await copyInto(id, newId)
  return newId
}

// ---------------------------------------------------------------------------
// Relacje między kafelkami
// ---------------------------------------------------------------------------

/** Dodaje relację `from --kind--> to`. Nie duplikuje istniejącej pary
 *  (w tym w drugą stronę, gdy relacja jest symetryczna). */
export async function addRelation(
  fromId: string,
  toId: string,
  kind: RelationKind,
  note?: string,
): Promise<string | null> {
  if (fromId === toId) return null
  const all = await db.relations.toArray()
  const symmetric = isSymmetricRelation(kind)
  const exists = all.some(
    (r) =>
      r.kind === kind &&
      ((r.fromId === fromId && r.toId === toId) ||
        (symmetric && r.fromId === toId && r.toId === fromId)),
  )
  if (exists) return null
  const id = uid()
  await db.relations.add({
    id,
    fromId,
    fromVersionId: null,
    toId,
    toVersionId: null,
    kind,
    note,
    createdAt: now(),
  })
  return id
}

export async function updateRelation(
  id: string,
  patch: Partial<Pick<Relation, 'kind' | 'note' | 'fromVersionId' | 'toVersionId'>>,
) {
  await db.relations.update(id, patch)
}

export async function deleteRelation(id: string) {
  await db.relations.delete(id)
}

/** Odwraca kierunek relacji (np. pomyłka przy wskazywaniu, co jest mocniejsze). */
export async function flipRelation(id: string) {
  const r = await db.relations.get(id)
  if (!r) return
  await db.relations.update(id, {
    fromId: r.toId,
    fromVersionId: r.toVersionId ?? null,
    toId: r.fromId,
    toVersionId: r.fromVersionId ?? null,
  })
}

// ---------------------------------------------------------------------------
// Strony kafelka (dowody itp.)
// ---------------------------------------------------------------------------

/** Nazwa strony głównej kafelka — domyślnie „Treść". */
export const mainPageName = (c: { mainPageName?: string }) =>
  c.mainPageName?.trim() || 'Treść'

/** Dodaje nową stronę (np. dowód) do KONKRETNEJ WERSJI kafelka i zwraca jej id. */
export async function createSubpage(
  conceptId: string,
  versionId: string,
  name: string,
): Promise<string> {
  const id = uid()
  const t = now()
  const existing = await db.subpages
    .where('[conceptId+versionId]')
    .equals([conceptId, versionId])
    .toArray()
  const order = existing.length
    ? Math.max(...existing.map((s) => s.order ?? 0)) + 1
    : 1
  await db.subpages.add({
    id,
    conceptId,
    versionId,
    name,
    content: '',
    order,
    createdAt: t,
    updatedAt: t,
  })
  return id
}

/** Dokleja kafelek na koniec ścieżki — tak samo, jakby go tam przeciągnąć
 *  w widoku Linia. Dzięki temu w liście po lewej ścieżka zachowuje się jak
 *  folder: upuszczasz na nią kafelek i on do niej wchodzi. */
export async function addConceptToPath(pathId: string, conceptId: string) {
  const p = await db.paths.get(pathId)
  if (!p) return
  // Kafelek już w tej ścieżce nie ma się dublować. Upuszczenie na ścieżkę to
  // „włóż do folderu", a nie „dołóż jeszcze raz" — bez tego przeciągnięcie
  // zaznaczonych przykładów robiło ich kopie na samym dole.
  const juzJest = p.nodes.some(
    (n) =>
      (n.kind === 'block' && n.conceptId === conceptId) ||
      (n.kind === 'fusion' && n.parts.some((c) => c.conceptId === conceptId)),
  )
  if (juzJest) return
  const kolejnosc = topoOrder(p.nodes, p.edges)
  const ostatni = kolejnosc[kolejnosc.length - 1] ?? null
  const id = uid()
  const wezel: PathNode = {
    id,
    kind: 'block',
    conceptId,
    versionId: null,
    subpageId: null,
    x: ostatni?.x ?? 120,
    y: (ostatni?.y ?? -160) + 160,
  }
  await db.paths.update(pathId, {
    nodes: [...p.nodes, wezel],
    edges: ostatni ? [...p.edges, { id: uid(), from: ostatni.id, to: id }] : p.edges,
    updatedAt: now(),
  })
}


/** Ścieżki, w których ten kafelek występuje (także jako składnik scalonego
 *  bloku) — edytor kafelka pokazuje, gdzie on właściwie pracuje. */
export async function pathsWithConcept(conceptId: string): Promise<LearningPath[]> {
  const wszystkie = await db.paths.toArray()
  return wszystkie.filter((p) =>
    p.nodes.some(
      (n) =>
        (n.kind === 'block' && n.conceptId === conceptId) ||
        (n.kind === 'fusion' && n.parts.some((c) => c.conceptId === conceptId)),
    ),
  )
}

/** Nowa kolejność stron po przeciągnięciu. */
export async function reorderSubpages(ids: string[]) {
  const t = now()
  await db.transaction('rw', db.subpages, async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.subpages.update(ids[i], { order: i, updatedAt: t })
    }
  })
}

export async function renameSubpage(id: string, name: string) {
  await db.subpages.update(id, { name, updatedAt: now() })
}

export async function updateSubpage(
  id: string,
  patch: Partial<Pick<Subpage, 'content'>>,
) {
  await db.subpages.update(id, { ...patch, updatedAt: now() })
}

export async function deleteSubpage(id: string) {
  await db.subpages.delete(id)
}

// ---------------------------------------------------------------------------
// Foldery
// ---------------------------------------------------------------------------

export async function createFolder(
  kind: FolderKind,
  name: string,
  parentId: string | null = null,
): Promise<string> {
  const id = uid()
  const order = kind === 'concepts' ? await nextConceptOrder(parentId) : 0
  await db.folders.add({ id, kind, name, parentId, order, createdAt: now() })
  return id
}

/** Przenosi folder kafelków (i/lub ustawia jego pozycję we wspólnej kolejności). */
export async function moveFolder(
  id: string,
  parentId: string | null,
  order?: number,
) {
  const o = order ?? (await nextConceptOrder(parentId))
  await db.folders.update(id, { parentId, order: o })
}

export async function renameFolder(id: string, name: string) {
  await db.folders.update(id, { name })
}

/** Nazwa i/lub własny znaczek folderu. */
export async function updateFolder(
  id: string,
  patch: Partial<Pick<Folder, 'name' | 'icon' | 'iconColor' | 'iconText'>>,
) {
  await db.folders.update(id, patch)
}

/** Usuwa folder; jego zawartość (podfoldery, kafelki, ścieżki, PDF-y) przechodzi do rodzica. */
export async function deleteFolder(id: string) {
  await db.transaction('rw', db.folders, db.concepts, db.pdfs, db.paths, async () => {
    const f = await db.folders.get(id)
    if (!f) return
    const parent = f.parentId ?? null
    await db.folders
      .where('parentId')
      .equals(id)
      .modify((x) => {
        x.parentId = parent
      })
    const cs = await db.concepts.toArray()
    for (const c of cs) {
      if (c.folderId === id) await db.concepts.update(c.id, { folderId: parent })
    }
    const ps = await db.pdfs.toArray()
    for (const p of ps) {
      if (p.folderId === id) await db.pdfs.update(p.id, { folderId: parent })
    }
    const paths = await db.paths.toArray()
    for (const p of paths) {
      if (p.folderId === id) await db.paths.update(p.id, { folderId: parent })
    }
    await db.folders.delete(id)
  })
}

// ---------------------------------------------------------------------------
// Ścieżki
// ---------------------------------------------------------------------------

export async function createPath(name: string): Promise<string> {
  const id = uid()
  const t = now()
  const order = await nextConceptOrder(null)
  await db.paths.add({
    id,
    name,
    folderId: null,
    order,
    nodes: [],
    edges: [],
    createdAt: t,
    updatedAt: t,
  })
  return id
}

export async function updatePath(
  id: string,
  patch: Partial<Pick<LearningPath, 'name' | 'nodes' | 'edges' | 'icon' | 'iconColor' | 'iconText'>>,
) {
  await db.paths.update(id, { ...patch, updatedAt: now() })
}

export async function movePath(id: string, folderId: string | null, order?: number) {
  const o = order ?? (await nextConceptOrder(folderId))
  await db.paths.update(id, { folderId, order: o })
}

export async function deletePath(id: string) {
  // Przykłady zrobione w środku należą do ścieżki — gdyby zostały z jej id,
  // przepadłyby bez śladu (nigdzie by ich nie było widać). Wypuszczamy je
  // do biblioteki i dopiero wtedy kasujemy ścieżkę.
  await db.concepts
    .where('id')
    .anyOf((await conceptsOwnedByPath(id)).map((c) => c.id))
    .modify((c) => {
      delete c.pathId
    })
  await db.paths.delete(id)
}

// ---------------------------------------------------------------------------
// PDF-y
// ---------------------------------------------------------------------------

/** Importuje plik PDF do lokalnej bazy i zwraca jego id. */
export async function importPdf(file: File): Promise<string> {
  const id = uid()
  await db.pdfs.add({
    id,
    title: file.name.replace(/\.pdf$/i, ''),
    fileName: file.name,
    folderId: null,
    addedAt: now(),
    data: file,
  })
  return id
}

export async function movePdf(id: string, folderId: string | null) {
  await db.pdfs.update(id, { folderId })
}

export async function renamePdf(id: string, title: string) {
  await db.pdfs.update(id, { title })
}

/** Usuwa PDF z biblioteki (wraz z plikiem). Podpięte źródła w kafelkach
 *  zostają — to odnośniki, nie kopie treści; przestają tylko prowadzić do pliku. */
export async function deletePdf(id: string) {
  await db.pdfs.delete(id)
}
