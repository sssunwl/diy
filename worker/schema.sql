CREATE TABLE IF NOT EXISTS stalls (
 id TEXT PRIMARY KEY, region TEXT NOT NULL, market TEXT NOT NULL,
 status TEXT NOT NULL, live_json TEXT, draft_json TEXT,
 email TEXT NOT NULL, token_hash TEXT NOT NULL, reject_reason TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS stalls_email ON stalls(email);
CREATE INDEX IF NOT EXISTS stalls_region_status ON stalls(region,status);
CREATE TABLE IF NOT EXISTS apply_log (ip TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS apply_log_ip_at ON apply_log(ip,at);
CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, email TEXT, path TEXT, country TEXT);
CREATE INDEX IF NOT EXISTS visits_at ON visits(at);
-- 防止同時審核時把兩攤放進同一位置。
CREATE UNIQUE INDEX IF NOT EXISTS stalls_live_slot ON stalls(json_extract(live_json,'$.market'),json_extract(live_json,'$.street'),json_extract(live_json,'$.slot')) WHERE live_json IS NOT NULL;
