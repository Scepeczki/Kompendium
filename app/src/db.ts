import Dexie, { type Table } from 'dexie'
import type {
  BlockType,
  BlockVersion,
  Concept,
  Folder,
  FolderKind,
  PdfDoc,
} from './types'

class KompendiumDB extends Dexie {
  concepts!: Table<Concept, string>
  versions!: Table<BlockVersion, string>
  pdfs!: Table<PdfDoc, string>
  folders!: Table<Folder, string>

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
  }
}

export const db = new KompendiumDB()

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

/** Kolejność „na końcu" danego folderu klocków. */
export async function nextConceptOrder(folderId: string | null): Promise<number> {
  const all = await db.concepts.toArray()
  const siblings = all.filter((c) => (c.folderId ?? null) === folderId)
  return siblings.length
    ? Math.max(...siblings.map((c) => c.order ?? 0)) + 1
    : 1
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
  patch: Partial<Pick<BlockVersion, 'content' | 'label' | 'sourceRefs'>>,
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
      createdAt: t,
      updatedAt: t,
    })
    await db.concepts.update(conceptId, { currentVersionId: id, updatedAt: t })
  })
  return id
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
  await db.folders.add({ id, kind, name, parentId, createdAt: now() })
  return id
}

export async function renameFolder(id: string, name: string) {
  await db.folders.update(id, { name })
}

/** Usuwa folder; jego zawartość (podfoldery, klocki, PDF-y) przechodzi do rodzica. */
export async function deleteFolder(id: string) {
  await db.transaction('rw', db.folders, db.concepts, db.pdfs, async () => {
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
    await db.folders.delete(id)
  })
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
