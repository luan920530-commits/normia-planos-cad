PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    site TEXT NOT NULL DEFAULT '',
    workplace TEXT NOT NULL DEFAULT '',
    responsible TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS floors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    design_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    draft_json TEXT NULL,
    draft_base_version INTEGER NULL,
    draft_updated_at TEXT NULL,
    check_days INTEGER NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_floors_project ON floors(project_id, sort_order, id);

CREATE TABLE IF NOT EXISTS floor_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    design_json TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (floor_id, version)
);
CREATE INDEX IF NOT EXISTS idx_versions_floor ON floor_versions(floor_id, version DESC);

-- Modo brigadista: enlace público de solo lectura por piso.
CREATE TABLE IF NOT EXISTS brigade_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_id INTEGER NOT NULL UNIQUE REFERENCES floors(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_brigade_token ON brigade_links(token);

-- Verificación física: estado por elemento y rondas de inspección.
CREATE TABLE IF NOT EXISTS verification_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open',
    note TEXT NOT NULL DEFAULT '',
    started_by INTEGER REFERENCES users(id),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by INTEGER REFERENCES users(id),
    closed_at TEXT
);

CREATE TABLE IF NOT EXISTS element_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    round_id INTEGER REFERENCES verification_rounds(id) ON DELETE SET NULL,
    element_id TEXT NOT NULL,
    element_type TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ok',
    note TEXT NOT NULL DEFAULT '',
    photo BLOB,
    photo_type TEXT NOT NULL DEFAULT '',
    photo_name TEXT NOT NULL DEFAULT '',
    checked_by INTEGER REFERENCES users(id),
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checks_floor ON element_checks(floor_id, element_id);
CREATE INDEX IF NOT EXISTS idx_checks_round ON element_checks(round_id);
CREATE INDEX IF NOT EXISTS idx_rounds_floor ON verification_rounds(floor_id, id);

-- Complementos (plugins) instalados. El manifiesto vive en
-- storage/plugins/<id>/plugin.json; aquí solo el estado de activación.
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

PRAGMA user_version = 5;
