import json
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from backend.storage import Storage
from backend.parser import parse_line


app = FastAPI(title="Terraform LogViewer")


# static files
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


DB_PATH = "logs.db"
store = Storage(DB_PATH)


@app.get("/")
async def root():
    return FileResponse("frontend/templates/index.html")


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    lines = content.decode("utf-8", errors="ignore").splitlines()
    inserted = 0
    for line in lines:
        if not line.strip(): 
            continue
        
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            # Если JSON некорректный, сохраняем как raw
            obj = {"raw": line}
        
        # Парсим строку в любом случае
        parsed = parse_line(obj, raw_text=line)
        
        # Сохраняем в дб
        raw_json = json.dumps(obj, ensure_ascii=False)
        log_id = store.insert_log(
            raw_json=raw_json,
            ts=parsed.get("ts"),
            level=parsed.get("level"),
            tf_req_id=parsed.get("tf_req_id"),
            tf_resource=parsed.get("tf_resource"),
            section=parsed.get("section"),
            text_excerpt=parsed.get("excerpt"),
        )
        
        # Сохраняем JSON
        for body_type, body in parsed.get("bodies", []):
            try:
                store.insert_json_body(log_id, body_type, json.dumps(body, ensure_ascii=False))
            except Exception:
                store.insert_json_body(log_id, body_type, str(body))
        
        inserted += 1
    
    return {"inserted": inserted}


@app.get("/search")
async def search(q: str = None, level: str = None, tf_resource: str = None, tf_req_id: str = None, ts_from: str = None, ts_to: str = None, unread: int = 0, limit: int = 500):
    rows = store.search(q=q, level=level, resource=tf_resource, tf_req_id=tf_req_id, ts_from=ts_from, ts_to=ts_to, unread_only=bool(unread), limit=limit)
    return rows


@app.post("/mark_read")
async def mark_read(payload: dict):
    ids = payload.get("ids") or payload.get("id")
    if not ids:
        raise HTTPException(status_code=400, detail="ids required")
    if isinstance(ids, int):
        ids = [ids]
    store.mark_read(ids)
    return {"status": "ok"}


@app.get("/json_bodies/{log_id}")
async def json_bodies(log_id: int):
    bodies = store.get_json_bodies_for_log(log_id)
    return JSONResponse(bodies)


@app.get("/export")
async def export(q: str = None, level: str = None, tf_req_id: str = None):
    rows = store.search(q=q, level=level, tf_req_id=tf_req_id, limit=10000)
    path = Path("export.jsonl")
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(r['raw_json'] + "\n")
    return FileResponse(str(path), media_type='application/octet-stream', filename='export.jsonl')