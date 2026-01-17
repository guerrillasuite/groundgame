import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'polling.sqlite')

export const sqlite = new Database(dbPath)

// Recommended pragmas
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
