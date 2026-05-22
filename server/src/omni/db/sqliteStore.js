import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { createOmniSeed } from '../seed.js'

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))

const COLLECTIONS = [
  'pages',
  'platformAccounts',
  'brandGroups',
  'policySets',
  'agentProfiles',
  'customers',
  'threads',
  'messages',
  'orders',
  'orderLinks',
  'inventorySnapshots',
  'paymentRequests',
  'paymentEvents',
  'aiDecisions',
  'actionAudits',
  'approvalTasks',
  'connectorHealth',
]

function clone(value) {
  return structuredClone(value)
}

function createEmptySnapshot(seed = createOmniSeed()) {
  const snapshot = clone(seed)
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(snapshot[collection])) snapshot[collection] = []
  }
  return snapshot
}

export function createSqliteOmniStore({ dbPath, seed = createOmniSeed() } = {}) {
  if (!dbPath) throw new Error('db_path_required')
  mkdirSync(dirname(dbPath), { recursive: true })

  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(schemaPath, 'utf8'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS omni_collections (
      name TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const selectCollection = db.prepare('SELECT payload_json FROM omni_collections WHERE name = ?')
  const upsertCollection = db.prepare(`
    INSERT INTO omni_collections (name, payload_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = CURRENT_TIMESTAMP
  `)

  function readCollection(name) {
    const row = selectCollection.get(name)
    if (!row) return null
    return JSON.parse(row.payload_json)
  }

  function writeCollection(name, rows) {
    upsertCollection.run(name, JSON.stringify(rows || []))
  }

  function seedMissingCollections() {
    const base = createEmptySnapshot(seed)
    for (const collection of COLLECTIONS) {
      if (readCollection(collection) === null) {
        writeCollection(collection, base[collection])
      }
    }
  }

  seedMissingCollections()

  return {
    snapshot() {
      const snapshot = createEmptySnapshot(seed)
      for (const collection of COLLECTIONS) {
        snapshot[collection] = readCollection(collection) || []
      }
      return snapshot
    },
    upsert(collectionName, rows, key = 'id') {
      if (!COLLECTIONS.includes(collectionName)) throw new Error(`unknown_collection:${collectionName}`)
      const collection = readCollection(collectionName) || []
      let inserted = 0
      let updated = 0

      for (const row of rows || []) {
        const existingIndex = collection.findIndex((item) => item[key] === row[key])
        if (existingIndex >= 0) {
          collection[existingIndex] = { ...collection[existingIndex], ...clone(row) }
          updated += 1
        } else {
          collection.push(clone(row))
          inserted += 1
        }
      }

      writeCollection(collectionName, collection)
      return { inserted, updated }
    },
    replace(collectionName, rows) {
      if (!COLLECTIONS.includes(collectionName)) throw new Error(`unknown_collection:${collectionName}`)
      writeCollection(collectionName, clone(rows || []))
    },
    close() {
      db.close()
    },
  }
}
