import Dexie, { type Table } from 'dexie'
import type {
  BlockType,
  BlockVersion,
  Concept,
  Folder,
  FolderKind,
  LearningPath,
  PdfDoc,
} from './types'

class KompendiumDB extends Dexie {
  concepts!: Table<Concept, string>
  versions!: Table<BlockVersion, string>
  pdfs!: Table<PdfDoc, string>
  folders!: Table<Folder, string>
  paths!: Table<LearningPath, string>

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
  patch: Partial<Pick<Concept, 'name' | 'type' | 'tags'>>,
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
  await db.transaction('rw', db.concepts, db.versions, async () => {
    await db.versions.where('conceptId').equals(id).delete()
    await db.concepts.delete(id)
  })
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
