import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "doors.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initDoorsDb(_db);
  }
  return _db;
}

export function initDoorsDb(db?: Database.Database): void {
  const d = db ?? getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS door_walklists (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'knock',
      total_targets INTEGER NOT NULL DEFAULT 0,
      visited_count INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS door_locations (
      item_id TEXT PRIMARY KEY,
      walklist_id TEXT NOT NULL,
      idx INTEGER NOT NULL DEFAULT 0,
      location_id TEXT,
      lat REAL,
      lng REAL,
      address_line1 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      household_id TEXT,
      household_name TEXT,
      primary_person_id TEXT,
      primary_person_name TEXT,
      visited INTEGER NOT NULL DEFAULT 0,
      last_result TEXT,
      last_result_at TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_door_locations_walklist
      ON door_locations(walklist_id);

    CREATE TABLE IF NOT EXISTS pending_stops (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT NOT NULL DEFAULT '',
      walklist_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      person_id TEXT,
      result TEXT NOT NULL,
      notes TEXT,
      photo_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0,
      sync_error TEXT
    );
  `);
  // Idempotent migrations
  try { d.exec(`ALTER TABLE door_walklists ADD COLUMN survey_id TEXT`); } catch {}
  try { d.exec(`ALTER TABLE door_walklists ADD COLUMN user_id TEXT`); } catch {}
  try { d.exec(`CREATE INDEX IF NOT EXISTS idx_door_walklists_user ON door_walklists(tenant_id, user_id)`); } catch {}
}

// ── Walklist helpers ────────────────────────────────────────────────────────

export type DbWalklist = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  mode: string;
  total_targets: number;
  visited_count: number;
  survey_id: string | null;
  synced_at: string;
};

export function upsertWalklists(tenantId: string, userId: string | null, rows: Omit<DbWalklist, "synced_at">[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO door_walklists (id, tenant_id, user_id, name, mode, total_targets, visited_count, survey_id, synced_at)
    VALUES (@id, @tenant_id, @user_id, @name, @mode, @total_targets, @visited_count, @survey_id, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      mode = excluded.mode,
      total_targets = excluded.total_targets,
      visited_count = excluded.visited_count,
      synced_at = excluded.synced_at
  `);
  const upsertMany = db.transaction((items: Omit<DbWalklist, "synced_at">[]) => {
    for (const r of items) stmt.run({ ...r, tenant_id: tenantId, user_id: userId, survey_id: r.survey_id ?? null });
  });
  upsertMany(rows);
}

export function getWalklistSurveyId(walklistId: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT survey_id FROM door_walklists WHERE id = ?")
    .get(walklistId) as { survey_id: string | null } | undefined;
  return row?.survey_id ?? null;
}

export function getWalklists(tenantId: string, userId?: string | null): DbWalklist[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        w.id, w.tenant_id, w.user_id, w.name, w.mode, w.survey_id, w.synced_at,
        COUNT(l.item_id) AS total_targets,
        SUM(l.visited) AS visited_count
      FROM door_walklists w
      LEFT JOIN door_locations l ON l.walklist_id = w.id
      WHERE w.tenant_id = ?
        AND (? IS NULL OR w.user_id = ?)
      GROUP BY w.id
      ORDER BY w.name
    `)
    .all(tenantId, userId ?? null, userId ?? null) as DbWalklist[];
}

// ── Location helpers ────────────────────────────────────────────────────────

export type DbLocation = {
  item_id: string;
  walklist_id: string;
  idx: number;
  location_id: string | null;
  lat: number | null;
  lng: number | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  household_id: string | null;
  household_name: string | null;
  primary_person_id: string | null;
  primary_person_name: string | null;
  visited: boolean;
  last_result: string | null;
  last_result_at: string | null;
};

export function upsertLocations(walklistId: string, rows: Omit<DbLocation, "visited">[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO door_locations (
      item_id, walklist_id, idx, location_id,
      lat, lng, address_line1, city, state, postal_code,
      household_id, household_name, primary_person_id, primary_person_name,
      visited, last_result, last_result_at, synced_at
    ) VALUES (
      @item_id, @walklist_id, @idx, @location_id,
      @lat, @lng, @address_line1, @city, @state, @postal_code,
      @household_id, @household_name, @primary_person_id, @primary_person_name,
      @visited, @last_result, @last_result_at, datetime('now')
    )
    ON CONFLICT(item_id) DO UPDATE SET
      idx = excluded.idx,
      location_id = excluded.location_id,
      lat = excluded.lat,
      lng = excluded.lng,
      address_line1 = excluded.address_line1,
      city = excluded.city,
      state = excluded.state,
      postal_code = excluded.postal_code,
      household_id = excluded.household_id,
      household_name = excluded.household_name,
      primary_person_id = excluded.primary_person_id,
      primary_person_name = excluded.primary_person_name,
      last_result = excluded.last_result,
      last_result_at = excluded.last_result_at,
      synced_at = excluded.synced_at
  `);
  const upsertMany = db.transaction((items: Omit<DbLocation, "visited">[]) => {
    for (const r of items)
      stmt.run({ ...r, walklist_id: walklistId, visited: 0 });
  });
  upsertMany(rows);
}

export function getMissingCoordsLocations(): Array<{
  item_id: string;
  location_id: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}> {
  const db = getDb();
  return db
    .prepare(`
      SELECT item_id, location_id, address_line1, city, state, postal_code
      FROM door_locations
      WHERE (lat IS NULL OR lng IS NULL)
        AND address_line1 IS NOT NULL
        AND address_line1 != ''
    `)
    .all() as any[];
}

export function updateLocationCoords(itemId: string, lat: number, lng: number): void {
  getDb()
    .prepare("UPDATE door_locations SET lat = ?, lng = ? WHERE item_id = ?")
    .run(lat, lng, itemId);
}

/** Update coords for all door_locations entries sharing a location_id (used by "Correct Pin"). */
export function updateCoordsForLocation(locationId: string, lat: number, lng: number): void {
  getDb()
    .prepare("UPDATE door_locations SET lat = ?, lng = ? WHERE location_id = ?")
    .run(lat, lng, locationId);
}

/** Clears coordinates that fall outside the continental US + HI + AK bounding box */
export function clearOutOfBoundsCoords(): number {
  const result = getDb()
    .prepare(`
      UPDATE door_locations
      SET lat = NULL, lng = NULL
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND NOT (
          lat BETWEEN 18.0 AND 72.0
          AND lng BETWEEN -180.0 AND -65.0
        )
    `)
    .run();
  return result.changes;
}

export function getLocations(walklistId: string): DbLocation[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM door_locations WHERE walklist_id = ? ORDER BY idx"
    )
    .all(walklistId) as any[];
  return rows.map((r) => ({ ...r, visited: r.visited === 1 }));
}

export function markVisited(itemId: string, result: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE door_locations
    SET visited = 1, last_result = ?, last_result_at = datetime('now')
    WHERE item_id = ?
  `).run(result, itemId);
}

// ── Pending stop helpers ────────────────────────────────────────────────────

export type PendingStop = {
  id: string;
  tenant_id: string;
  walklist_id: string;
  item_id: string;
  person_id: string | null;
  result: string;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  synced: number;
  sync_error: string | null;
};

export function insertPendingStop(
  stop: Omit<PendingStop, "id" | "created_at" | "synced" | "sync_error">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO pending_stops (id, tenant_id, walklist_id, item_id, person_id, result, notes, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    stop.tenant_id,
    stop.walklist_id,
    stop.item_id,
    stop.person_id ?? null,
    stop.result,
    stop.notes ?? null,
    stop.photo_url ?? null
  );
  return id;
}

export function getPendingStops(): PendingStop[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM pending_stops WHERE synced = 0 ORDER BY created_at")
    .all() as PendingStop[];
}

export function markStopSynced(id: string): void {
  getDb()
    .prepare("UPDATE pending_stops SET synced = 1 WHERE id = ?")
    .run(id);
}

export function markStopError(id: string, err: string): void {
  getDb()
    .prepare("UPDATE pending_stops SET sync_error = ? WHERE id = ?")
    .run(err, id);
}
