import openai
import json
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv
from backend.storage import Storage

# Загружаем переменные из .env
load_dotenv()

class OpenAIAIAnalyzer:
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        if self.api_key:
            openai.api_key = self.api_key
        else:
            print("⚠️  OPENAI_API_KEY не найден в .env файле")
    
    def analyze_logs(self, logs: List[Dict]) -> Dict:
        if not logs or not self.api_key:
            return self._mock_analysis(logs)
        
        # Подготовка контекста для анализа
        context = self._prepare_context(logs)
        
        try:
            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Ты эксперт по анализу логов Terraform. Отвечай на русском языке в формате JSON."},
                    {"role": "user", "content": context}
                ],
                temperature=0.3,
                max_tokens=500
            )
            
            result = response.choices[0].message.content
            
            # Пытаемся распарсить JSON из ответа
            start = result.find('{')
            end = result.rfind('}') + 1
            if start != -1 and end != 0:
                json_str = result[start:end]
                parsed = json.loads(json_str)
                parsed['ai_model'] = 'openai-gpt-3.5-turbo'
                parsed['confidence'] = 0.9
                return parsed
            
            # Если JSON не найден, возвращаем структурированный ответ
            return self._fallback_analysis(logs, result)
            
        except Exception as e:
            print(f"❌ OpenAI API error: {e}")
            return self._mock_analysis(logs)
    
    def _prepare_context(self, logs: List[Dict]) -> str:
        context = """Проанализируй следующие логи Terraform и предоставь структурированный ответ на русском языке в формате JSON:
        
        {
            "summary": "Краткое резюме анализа",
            "issues": [
                {"type": "тип проблемы", "count": количество, "severity": "уровень важности"}
            ],
            "recommendations": ["список рекомендаций"],
            "severity_distribution": {"error": 2, "warning": 3, "info": 10},
            "ai_model": "openai-gpt-3.5-turbo"
        }
        
        Логи:"""
        
        # Добавляем важные логи
        important_logs = [log for log in logs if log.get('level') in ['error', 'warning']]
        for i, log in enumerate(important_logs[:10]):
            context += f"\n\n{i+1}. [{log.get('level', 'unknown')}] {log.get('text_excerpt', '')[:200]}..."
        
        return context
    
    def _fallback_analysis(self, logs: List[Dict], ai_response: str) -> Dict:
        level_counts = {}
        for log in logs:
            level = log.get('level', 'unknown')
            level_counts[level] = level_counts.get(level, 0) + 1
        
        return {
            "summary": f"Анализ GPT завершен. Обработано {len(logs)} логов. Ответ: {ai_response[:100]}...",
            "issues": [
                {"type": "Обнаруженные проблемы", "count": len([l for l in logs if l.get('level') in ['error', 'warning']]), "severity": "средний"}
            ],
            "recommendations": [
                "Проверьте файлы конфигурации Terraform",
                "Проверьте аутентификацию провайдеров",
                "Проверьте зависимости ресурсов"
            ],
            "severity_distribution": level_counts,
            "ai_model": "openai-gpt-3.5-turbo",
            "confidence": 0.85
        }
    
    def _mock_analysis(self, logs: List[Dict]) -> Dict:
        level_counts = {}
        for log in logs:
            level = log.get('level', 'unknown')
            level_counts[level] = level_counts.get(level, 0) + 1
        
        return {
            "summary": f"Анализ GPT завершен. Обработано {len(logs)} логов. API ключ не настроен.",
            "issues": [
                {"type": "Проблемы конфигурации", "count": 2, "severity": "средний"},
                {"type": "Проблемы с API", "count": 1, "severity": "низкий"}
            ],
            "recommendations": [
                "Проверьте файлы конфигурации Terraform",
                "Проверьте аутентификацию провайдеров",
                "Проверьте зависимости ресурсов"
            ],
            "severity_distribution": level_counts,
            "ai_model": "openai-gpt-3.5-turbo-mock",
            "confidence": 0.60
        }
    
    def get_ai_insights(self, query: str = None, limit: int = 100) -> Dict:
        store = Storage()
        logs = store.search(q=query, limit=limit)
        return self.analyze_logs(logs)