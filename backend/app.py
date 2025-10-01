import json
from pathlib import Path
import sys
import os

# Добавь путь к плагинам
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from backend.storage import Storage
from backend.parser import parse_line
from backend.ai_analyzer import CustomAIAnalyzer
from backend.ai_analyzer_openai import OpenAIAIAnalyzer
from typing import List, Dict

try:
    import grpc
    
    # Добавляем путь к папке plugins
    plugins_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'plugins')
    sys.path.insert(0, plugins_path)
    
    import plugin_pb2
    import plugin_pb2_grpc
    
    # Возвращаем путь обратно
    sys.path.remove(plugins_path)
    
    GRPC_AVAILABLE = True
except ImportError:
    GRPC_AVAILABLE = False
    print("gRPC not available - install grpcio and generate proto files")



app = FastAPI(title="Terraform LogViewer")

# static files
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


DB_PATH = "logs.db"
store = Storage(DB_PATH)

ai_analyzer = CustomAIAnalyzer()
openai_ai_analyzer = OpenAIAIAnalyzer()

def call_grpc_plugin(logs: List[Dict], filter_type: str = "default"):
    try:
        channel = grpc.insecure_channel('localhost:50051')
        stub = plugin_pb2_grpc.LogProcessorStub(channel)
        
        request_logs = []
        for log in logs:
            entry = plugin_pb2.LogEntry(
                id=log.get('id', 0),
                raw_json=log.get('raw_json', ''),
                ts=log.get('ts', ''),
                level=log.get('level', ''),
                tf_req_id=log.get('tf_req_id', ''),
                tf_resource=log.get('tf_resource', ''),
                section=log.get('section', ''),
                text_excerpt=log.get('text_excerpt', '')
            )
            request_logs.append(entry)
        
        request = plugin_pb2.LogRequest(
            logs=request_logs,
            filter_type=filter_type
        )
        
        response = stub.ProcessLogs(request)
        return [{'id': entry.id, 'level': entry.level, 'text_excerpt': entry.text_excerpt} 
                for entry in response.filtered_logs]
    except Exception as e:
        print(f"Plugin error: {e}")
        return logs  # Возврат оригинальных данных при ошибке


@app.get("/ai/models")
async def get_ai_models():
    """Получить список доступных моделей ИИ"""
    models = [
        {"id": "openai", "name": "OpenAI GPT-3.5", "description": "OpenAI GPT-3.5 Turbo", "available": bool(os.getenv('OPENAI_API_KEY'))},
        {"id": "custom", "name": "Custom AI", "description": "Llama 4 Maverick-17B-128E Instruct FP8", "available": True},
    ]
    return JSONResponse(models)


@app.get("/ai/analyze")
async def ai_analyze(q: str = None, limit: int = 100, model: str = "custom"):
    """ИИ анализ логов с выбором модели"""
    try:
        if model == "openai":
            insights = openai_ai_analyzer.get_ai_insights(query=q, limit=limit)
        else:
            insights = CustomAIAnalyzer.get_ai_insights(query=q, limit=limit)
        
        insights['selected_model'] = model
        return JSONResponse(insights)
    except Exception as e:
        return JSONResponse({
            "error": str(e),
            "summary": "AI analysis temporarily unavailable",
            "issues": [],
            "recommendations": ["Manual analysis required"],
            "severity_distribution": {},
            "selected_model": model
        }, status_code=500)


@app.post("/ai/recommend")
async def ai_recommend(payload: dict):
    """Получить ИИ рекомендации по конкретной ошибке"""
    error_text = payload.get('error_text', '')
    if not error_text:
        return JSONResponse({"recommendations": ["Please provide error text"]})
    
    try:
        # Mock рекомендации (в реальности это будет ИИ вызов)
        recommendations = [
            "Check Terraform configuration files",
            "Verify provider credentials",
            "Review resource dependencies",
            "Increase API rate limits if applicable"
        ]

        return JSONResponse({
            "error": error_text,
            "recommendations": recommendations,
            "confidence": 0.9
        })
    except Exception as e:
        return JSONResponse({"error": str(e), "recommendations": []})
    

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
async def search(q: str = None, level: str = None, tf_resource: str = None, tf_req_id: str = None, ts_from: str = None, ts_to: str = None, section: str = None, unread: int = 0, limit: int = 500):
    rows = store.search(q=q, level=level, resource=tf_resource, tf_req_id=tf_req_id, ts_from=ts_from, ts_to=ts_to, section=section, unread_only=bool(unread), limit=limit)
    return rows

@app.get("/sections")
async def get_sections():
    """Получить сводку по секциям (plan/apply)"""
    sections = store.get_sections_summary()
    return JSONResponse(sections)

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


@app.post("/plugin/process")
async def process_with_plugin(payload: dict):
    # Получаем логи из базы
    q = payload.get('search_query', '')
    logs = store.search(q=q, limit=1000)
    
    # Обрабатываем через плагин
    filter_type = payload.get('filter_type', 'default')
    processed_logs = call_grpc_plugin(logs, filter_type)
    
    return {"processed_count": len(processed_logs), "summary": f"Applied {filter_type}"}