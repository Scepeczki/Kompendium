import Dexie, { type Table } from 'dexie'
import { isSymmetricRelation } from './types'
import type {
  BlockType,
  BlockVersion,
  Concept,
  Folder,
  FolderKind,
  LearningPath,
  PdfDoc,
  Relation,
  RelationKind,
  Subpage,
} from './types'

class KompendiumDB extends Dexie {
  concepts!: Table<Concept, string>
  versions!: Table<BlockVersion, string>
  pdfs!: Table<PdfDoc, string>
  folders!: Table<Folder, string>
  paths!: Table<LearningPath, string>
  subpages!: Table<Subpage, string>
  relations!: Table<Relation, string>

  constructor() {
    super('kompendium')
    this.version(1).stores({
      concepts: 'id, name, type, createdAt, updatedAt, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt',
    })
    // v2: foldery + ręczna kolejność klocków. Istniejące dane dostają
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
    // v3: foldery dostają wspólną kolejność z klockami (przeplatanie).
    // Istniejące foldery lądują przed klockami (kolejność ujemna), jak dotąd.
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
    // v5: strony klocka (dowody itp. — dodatkowe treści pojęcia).
    this.version(5).stores({
      concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt, folderId',
      folders: 'id, kind, parentId, name',
      paths: 'id, name, folderId, createdAt, updatedAt',
      subpages: 'id, conceptId',
    })
    // v6: relacje między klockami (uogólnienie, równoważność, część, wymaganie).
    this.version(6).stores({
      concepts: 'id, name, type, createdAt, updatedAt, folderId, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt, folderId',
      folders: 'id, kind, parentId, name',
      paths: 'id, name, folderId, createdAt, updatedAt',
      subpages: 'id, conceptId',
      relations: 'id, fromId, toId, kind',
    })
  }
}

export const db = new KompendiumDB()

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

/** Kolejność „na końcu" danego folderu — wspólna dla klocków, ścieżek i podfolderów. */
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
export async function createConcept(type: BlockType = 'definicja'): Promise<string> {
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
      order,
      createdAt: t,
      updatedAt: t,
      currentVersionId: versionId,
    })
  })
  return conceptId
}

export async function updateConcept(
  id: string,
  patch: Partial<Pick<Concept, 'name' | 'type' | 'tags' | 'mainPageName'>>,
) {
  await db.concepts.update(id, { ...patch, updatedAt: now() })
}

/** Przenosi klocek do folderu (i/lub na podaną pozycję). Nie zmienia updatedAt —
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
  await db.transaction('rw', db.concepts, db.versions, async () => {
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
    await db.concepts.update(conceptId, { currentVersionId: id, updatedAt: t })
  })
  return id
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
  await db.transaction('rw', db.concepts, db.versions, async () => {
    const v = await db.versions.get(versionId)
    if (!v) return
    const all = await db.versions.where('conceptId').equals(v.conceptId).toArray()
    if (all.length <= 1) return
    await db.versions.delete(versionId)
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

/** Powiela klocek z całą historią: wszystkie wersje, wszystkie strony.
 *  Kopia ląduje tuż obok pierwowzoru, w tym samym folderze.
 *
 *  Powiązań (relacji) celowo nie kopiujemy: mówią o konkretnym klocku,
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
      pages.map((p) => ({ ...p, id: uid(), conceptId: newId, createdAt: t, updatedAt: t })),
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

/** Powiela ścieżkę razem z układem kafelków. Klocki zostają te same —
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

/** Powiela folder z całą zawartością: podfolderami, klockami i ścieżkami.
 *  Kopie klocków powstają przez duplicateConcept, więc mają własne wersje
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
// Relacje między klockami
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
// Strony klocka (dowody itp.)
// ---------------------------------------------------------------------------

/** Nazwa strony głównej klocka — domyślnie „Treść". */
export const mainPageName = (c: { mainPageName?: string }) =>
  c.mainPageName?.trim() || 'Treść'

/** Dodaje nową stronę (np. dowód) do pojęcia i zwraca jej id. */
export async function createSubpage(conceptId: string, name: string): Promise<string> {
  const id = uid()
  const t = now()
  const existing = await db.subpages.where('conceptId').equals(conceptId).toArray()
  const order = existing.length
    ? Math.max(...existing.map((s) => s.order ?? 0)) + 1
    : 1
  await db.subpages.add({
    id,
    conceptId,
    name,
    content: '',
    order,
    createdAt: t,
    updatedAt: t,
  })
  return id
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

/** Przenosi folder klocków (i/lub ustawia jego pozycję we wspólnej kolejności). */
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

/** Usuwa folder; jego zawartość (podfoldery, klocki, ścieżki, PDF-y) przechodzi do rodzica. */
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
  patch: Partial<Pick<LearningPath, 'name' | 'nodes' | 'edges'>>,
) {
  await db.paths.update(id, { ...patch, updatedAt: now() })
}

export async function movePath(id: string, folderId: string | null, order?: number) {
  const o = order ?? (await nextConceptOrder(folderId))
  await db.paths.update(id, { folderId, order: o })
}

export async function deletePath(id: string) {
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

/** Usuwa PDF z biblioteki (wraz z plikiem). Podpięte źródła w klockach
 *  zostają — to odnośniki, nie kopie treści; przestają tylko prowadzić do pliku. */
export async function deletePdf(id: string) {
  await db.pdfs.delete(id)
}
