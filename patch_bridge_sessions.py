import re

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "r") as f:
    lines = f.readlines()

new_methods = """
import time

SESSIONS_FILE = os.path.join(CONFIG_DIR, "sessions.json")
_sessions_lock = threading.Lock()

def _load_sessions_db():
    if not os.path.exists(SESSIONS_FILE):
        return {"sessions": []}
    try:
        with open(SESSIONS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"sessions": []}

def _save_sessions_db(db):
    with open(SESSIONS_FILE, "w") as f:
        json.dump(db, f)

def m_sessions_list(req, params):
    with _sessions_lock:
        db = _load_sessions_db()
        return [{"id": s["id"], "title": s["title"], "updated_at": s.get("updated_at", 0)} for s in db["sessions"]]

def m_session_load(req, params):
    sid = params.get("id")
    with _sessions_lock:
        db = _load_sessions_db()
        for s in db["sessions"]:
            if s["id"] == sid:
                return s["turns"]
    return []

def m_session_save(req, params):
    sid = params.get("id")
    title = params.get("title")
    turns = params.get("turns", [])
    with _sessions_lock:
        db = _load_sessions_db()
        found = False
        for s in db["sessions"]:
            if s["id"] == sid:
                s["title"] = title
                s["turns"] = turns
                s["updated_at"] = time.time()
                found = True
                break
        if not found:
            db["sessions"].append({
                "id": sid,
                "title": title,
                "turns": turns,
                "updated_at": time.time()
            })
        db["sessions"].sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        _save_sessions_db(db)
    return True
"""

for i, line in enumerate(lines):
    if "def m_stop_wake" in line:
        lines.insert(i, new_methods + "\n")
        break

for i, line in enumerate(lines):
    if '"stop_wake": m_stop_wake,' in line:
        lines.insert(i + 1, '    "sessions_list": m_sessions_list,\n    "session_load": m_session_load,\n    "session_save": m_session_save,\n')
        break

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "w") as f:
    f.writelines(lines)
