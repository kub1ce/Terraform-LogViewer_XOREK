import re
import json
from typing import Dict, List, Tuple, Optional


# шаблоны timestamp
TS_PATTERNS = [
    r"(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)",
    r"(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})",
    r"(?P<ts>\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})",
]

# Состояния для отслеживания plan/apply
class ParseState:
    def __init__(self):
        self.current_section = None
        self.section_start_ts = None
        self.section_end_ts = None

TS_PATTERNS = [
    r"(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)",
    r"(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})",
    r"(?P<ts>\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})",
]

LEVEL_KEYWORDS = {
    'error': ['error', 'failed', 'panic', 'exception', 'traceback', 'failure'],
    'warning': ['warning', 'deprecated', 'deprecation', 'warn'],
    'info': ['info', 'notice', 'started', 'complete', 'success', 'begin', 'end'],
    'debug': ['debug', 'verbose', 'trace']
}

def extract_timestamp(s: str) -> Optional[str]:
    if not s:
        return None
    for p in TS_PATTERNS:
        m = re.search(p, s)
        if m:
            return m.group('ts')
    return None

def extract_level_from_obj(obj: Dict) -> Optional[str]:
    """Извлечение уровня лога из разных форматов"""
    # Проверяем стандартные поля для уровня
    level_fields = ['level', '@level', 'log_level', 'lvl']
    for field in level_fields:
        if field in obj:
            level = obj[field]
            if isinstance(level, str):
                level_lower = level.lower()
                # Приводим к стандартным уровням
                if level_lower in ['error', 'err', 'fatal']:
                    return 'error'
                elif level_lower in ['warning', 'warn']:
                    return 'warning'
                elif level_lower in ['info', 'information']:
                    return 'info'
                elif level_lower in ['debug', 'dbg']:
                    return 'debug'
                elif level_lower in ['trace']:
                    return 'debug'  # trace считаем debug
    return None

def guess_level(s: str) -> Optional[str]:
    if not s:
        return None
    low = s.lower()
    for lvl in ['error', 'warning', 'info', 'debug']:
        for w in LEVEL_KEYWORDS.get(lvl, []):
            if w in low:
                return lvl
    return None

def detect_section_from_text(s: str) -> Optional[str]:
    """Определение секции из текста"""
    if not s:
        return None
    low = s.lower()
    
    # План
    if 'terraform plan' in low or 'plan:' in low or 'plan operation' in low:
        return 'plan'
    # Применение  
    if 'terraform apply' in low or 'apply:' in low or 'apply operation' in low:
        return 'apply'
    # Начало/конец операций
    if ('starting' in low or 'begin' in low) and ('plan' in low or 'apply' in low):
        return 'start'
    if ('completed' in low or 'finished' in low or 'end' in low) and ('plan' in low or 'apply' in low):
        return 'end'
    if 'refreshing state' in low:
        return 'refresh'
    
    return None

def extract_tf_req_id(obj: Dict, text: str) -> Optional[str]:
    for k in ['tf_req_id', 'req_id', 'request_id', 'tf_request_id', 'correlation_id']:
        if k in obj:
            return obj[k]
        if text:
            m = re.search(r"tf_req_id[:=\s]([A-Za-z0-9_\-:.]+)", text)
            if m:
                return m.group(1)
            m = re.search(r"request_id[:=\s]([A-Za-z0-9_\-:.]+)", text)
            if m:
                return m.group(1)
    return None

def extract_json_bodies(obj: Dict) -> List[Tuple[str, object]]:
    out = []
    for key in ['tf_http_req_body', 'tf_http_res_body', 'http_request_body', 'http_response_body', 'request_body', 'response_body']:
        if key in obj and obj[key]:
            val = obj[key]
            if isinstance(val, str):
                try:
                    j = json.loads(val)
                    out.append((key, j))
                except Exception:
                    # try to find JSON substring
                    m = re.search(r"(\{.*\})", val, re.S)
                    if m:
                        try:
                            j = json.loads(m.group(1))
                            out.append((key, j))
                        except Exception:
                            out.append((key, val))
                    else:
                        out.append((key, val))
            else:
                out.append((key, val))
    return out

def extract_tf_resource(obj: Dict) -> Optional[str]:
    """Извлечение terraform ресурса из объекта"""
    resource_fields = ['tf_resource', 'resource', 'tf_resource_type', 'type', 'resource_type']
    for field in resource_fields:
        if field in obj:
            return obj[field]
    return None

def parse_line(obj: Dict, raw_text: str = "") -> Dict:
    text = ''
    try:
        text = json.dumps(obj, ensure_ascii=False) if isinstance(obj, dict) else str(obj)
    except Exception:
        text = str(obj)

    # Извлекаем поля
    ts = obj.get('timestamp') or obj.get('@timestamp') or extract_timestamp(text) or extract_timestamp(raw_text)
    level = extract_level_from_obj(obj) or guess_level(text) or guess_level(raw_text)
    
    # Определяем секцию
    section = detect_section_from_text(text) or detect_section_from_text(raw_text)
    if not section and obj.get('type') == 'change_summary':
        section = 'plan_summary'
    elif not section and obj.get('type') == 'apply':
        section = 'apply_summary'
    
    tf_req_id = extract_tf_req_id(obj, text) or extract_tf_req_id(obj, raw_text)
    tf_resource = extract_tf_resource(obj) or obj.get('resource') or None
    bodies = extract_json_bodies(obj)
    excerpt = (text[:400] + '...') if len(text) > 400 else text
    
    return {
        'ts': ts,
        'level': level,
        'section': section,
        'tf_req_id': tf_req_id,
        'tf_resource': tf_resource,
        'bodies': bodies,
        'excerpt': excerpt,
    }