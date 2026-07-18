import Dexie, { type Table } from 'dexie'
import type { BlockType, BlockVersion, Concept, PdfDoc } from './types'

class KompendiumDB extends Dexie {
  concepts!: Table<Concept, string>
  versions!: Table<BlockVersion, string>
  pdfs!: Table<PdfDoc, string>

  constructor() {
    super('kompendium')
    this.version(1).stores({
      concepts: 'id, name, type, createdAt, updatedAt, *tags',
      versions: 'id, conceptId, [conceptId+version], createdAt',
      pdfs: 'id, title, addedAt',
    })
  }
}

export const db = new KompendiumDB()

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

/** Tworzy nowe pojęcie z pustą wersją v1 i zwraca jego id. */
export async function createConcept(type: BlockType = 'definicja'): Promise<string> {
  const conceptId = uid()
  const versionId = uid()
  const t = now()
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

/** Importuje plik PDF do lokalnej bazy i zwraca jego id. */
export async function importPdf(file: File): Promise<string> {
  const id = uid()
  await db.pdfs.add({
    id,
    title: file.name.replace(/\.pdf$/i, ''),
    fileName: file.name,
    addedAt: now(),
    data: file,
  })
  return id
}
