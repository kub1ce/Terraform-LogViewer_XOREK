import sqlite3
from typing import List, Dict, Optional


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_json TEXT NOT NULL,
    ts TEXT,
    level TEXT,
    tf_req_id TEXT,
    tf_resource TEXT,
    section TEXT,
    text_excerpt TEXT,
    read_flag INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS json_bodies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id INTEGER,
    body_type TEXT,
    body_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_tf_req_id ON logs(tf_req_id);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_tf_resource ON logs(tf_resource);
CREATE INDEX IF NOT EXISTS idx_logs_section ON logs(section);
"""

class Storage:
    def __init__(self, path: str = 'logs.db'):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.execute('PRAGMA foreign_keys = ON')
        self.conn.executescript(SCHEMA)


    def insert_log(self, raw_json: str, ts: str = None, level: str = None, tf_req_id: str = None, tf_resource: str = None, section: str = None, text_excerpt: str = None) -> int:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO logs(raw_json, ts, level, tf_req_id, tf_resource, section, text_excerpt) VALUES (?,?,?,?,?,?,?)",
            (raw_json, ts, level, tf_req_id, tf_resource, section, text_excerpt)
        )
        self.conn.commit()
        return cur.lastrowid


    def insert_json_body(self, log_id: int, body_type: str, body_json: str):
        cur = self.conn.cursor()
        cur.execute("INSERT INTO json_bodies(log_id, body_type, body_json) VALUES (?,?,?)", (log_id, body_type, body_json))
        self.conn.commit()


    def get_json_bodies_for_log(self, log_id: int) -> List[Dict]:
        cur = self.conn.cursor()
        cur.execute("SELECT id, body_type, body_json FROM json_bodies WHERE log_id = ?", (log_id,))
        rows = cur.fetchall()
        return [{'id': r[0], 'body_type': r[1], 'body_json': r[2]} for r in rows]


    def search(self, q: str = None, level: str = None, resource: str = None, tf_req_id: str = None, ts_from: str = None, ts_to: str = None, unread_only: bool = False, section: str = None, limit: int = 500) -> List[Dict]:
        where = []
        params = []
        sql = "SELECT id, raw_json, ts, level, tf_req_id, tf_resource, section, text_excerpt, read_flag FROM logs"
        
        if q:
            where.append("(raw_json LIKE ? OR text_excerpt LIKE ?)")
            params += [f"%{q}%", f"%{q}%"]
        if level:
            where.append("level = ?"); params.append(level)
        if resource:  # Теперь можно искать по tf_resource_type
            where.append("tf_resource LIKE ?"); params.append(f"%{resource}%")
        if tf_req_id:
            where.append("tf_req_id = ?"); params.append(tf_req_id)
        if ts_from:
            where.append("ts >= ?"); params.append(ts_from)
        if ts_to:
            where.append("ts <= ?"); params.append(ts_to)
        if section:  # Добавляем фильтр по секции
            where.append("section = ?"); params.append(section)
        if unread_only:
            where.append("read_flag = 0")
        
        if where:
            sql += " WHERE " + " AND ".join(where)

        sql += " ORDER BY ts DESC NULLS LAST LIMIT ?"
        params.append(limit)
        cur = self.conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in rows]


    def get_sections_summary(self) -> List[Dict]:
        """Получить сводку по секциям"""
        cur = self.conn.cursor()
        cur.execute("""
            SELECT section, COUNT(*) as count, MIN(ts) as start_time, MAX(ts) as end_time
            FROM logs 
            WHERE section IS NOT NULL 
            GROUP BY section
            ORDER BY start_time
        """)
        rows = cur.fetchall()
        return [{'section': r[0], 'count': r[1], 'start_time': r[2], 'end_time': r[3]} for r in rows]


    def mark_read(self, ids: List[int]):
        if not ids:
            return
        cur = self.conn.cursor()
        placeholders = ",".join(["?"] * len(ids))
        cur.execute(f"UPDATE logs SET read_flag=1 WHERE id IN ({placeholders})", ids)
        self.conn.commit()