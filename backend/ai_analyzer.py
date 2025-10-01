import requests
from typing import List, Dict, Optional
import json
import os
from dotenv import load_dotenv
from backend.storage import Storage

# Загружаем переменные из .env
load_dotenv()

class CustomAIAnalyzer:
    def __init__(self):
        self.api_key = os.getenv('CUSTOM_AI_API_KEY')  # Твой ключ
        self.url = "https://api.intelligence.io.solutions/api/v1/chat/completions"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self.model = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8"
        self.temperature = 0.3
        self._prompts = self._load_system_prompts()
    
    def _load_system_prompts(self) -> Dict[str, str]:
        """Загружаем системные промпты для анализа логов"""
        return {
            "TERRAFORM_LOG_ANALYSIS": """Ты эксперт по анализу логов Terraform. 
            Проанализируй следующие логи и предоставь структурированный ответ на русском языке в формате JSON:
            
            {
                "summary": "Краткое резюме анализа",
                "issues": [
                    {"type": "тип проблемы", "count": количество, "severity": "уровень важности"}
                ],
                "recommendations": ["список рекомендаций"],
                "severity_distribution": {"error": 2, "warning": 3, "info": 10}
            }
            
            Пожалуйста, анализируй логи по следующим критериям:
            1. Уровень лога (error, warning, info, debug)
            2. Тип ресурса (если указан)
            3. Тип проблемы (аутентификация, конфигурация, зависимости и т.д.)
            4. Рекомендации по устранению
            
            Логи для анализа:""",
            
            "TERRAFORM_ERROR_RECOMMENDATION": """Ты эксперт по Terraform. 
            На основе следующей ошибки предоставь конкретные рекомендации по её устранению на русском языке:
            
            Ошибка: """
        }
    
    def analyze_logs(self, logs: List[Dict]) -> Dict:
        """Анализ логов с помощью ИИ"""
        if not logs or not self.api_key:
            return self._mock_analysis(logs)
        
        # Подготовка текста для анализа
        text_for_analysis = self._prepare_logs_text(logs)
        
        try:
            payload = self._build_payload(text_for_analysis, "TERRAFORM_LOG_ANALYSIS")
            
            response = requests.post(
                self.url,
                json=payload,
                headers=self.headers
            )
            
            if response.status_code == 200:
                response_data = response.json()
                return self._parse_response(response_data, logs)
            else:
                print(f"❌ API Error: {response.status_code} - {response.text}")
                return self._mock_analysis(logs)
                
        except Exception as e:
            print(f"❌ Error calling API: {e}")
            return self._mock_analysis(logs)
    
    def _prepare_logs_text(self, logs: List[Dict]) -> str:
        """Подготовка текста логов для анализа"""
        text = "Terraform логи для анализа:\n\n"
        
        for i, log in enumerate(logs[:20]):  # Ограничиваем количество
            text += f"{i+1}. [{log.get('level', 'unknown')}] {log.get('text_excerpt', '')[:200]}...\n"
            if log.get('tf_resource'):
                text += f"   Ресурс: {log.get('tf_resource')}\n"
            if log.get('ts'):
                text += f"   Время: {log.get('ts')}\n"
            text += "\n"
        
        return text
    
    def _build_payload(self, text: str, prompt_type: str) -> Dict:
        """Создание полезной нагрузки для API"""
        system_prompt = self._prompts.get(prompt_type, "")
        return {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": text
                }
            ],
            "temperature": self.temperature
        }
    
    def _parse_response(self, response_data: Dict, logs: List[Dict]) -> Dict:
        """Парсинг ответа ИИ"""
        try:
            # Извлекаем ответ из API
            choices = response_data.get('choices', [])
            if choices:
                content = choices[0].get('message', {}).get('content', '')
                
                # Пытаемся извлечь JSON из ответа
                start = content.find('{')
                end = content.rfind('}') + 1
                if start != -1 and end != 0:
                    json_str = content[start:end]
                    parsed = json.loads(json_str)
                    parsed['confidence'] = 0.85  # Добавляем уверенность
                    return parsed
            
            # Если JSON не найден, возвращаем структурированный ответ
            level_counts = {}
            for log in logs:
                level = log.get('level', 'unknown')
                level_counts[level] = level_counts.get(level, 0) + 1
            
            return {
                "summary": f"Анализ ИИ завершен. Обработано {len(logs)} логов. Ответ: {content[:100]}...",
                "issues": [
                    {"type": "Обнаруженные проблемы", "count": len([l for l in logs if l.get('level') in ['error', 'warning']]), "severity": "средний"}
                ],
                "recommendations": [
                    "Проверьте файлы конфигурации Terraform",
                    "Проверьте аутентификацию провайдеров",
                    "Проверьте зависимости ресурсов"
                ],
                "severity_distribution": level_counts,
                "confidence": 0.80
            }
            
        except json.JSONDecodeError:
            # Если JSON не удалось распарсить
            level_counts = {}
            for log in logs:
                level = log.get('level', 'unknown')
                level_counts[level] = level_counts.get(level, 0) + 1
            
            return {
                "summary": f"Анализ ИИ завершен. Обработано {len(logs)} логов.",
                "issues": [{"type": "Анализ завершен", "count": len(logs), "severity": "информация"}],
                "recommendations": ["Проверьте логи вручную для детального анализа"],
                "severity_distribution": level_counts,
                "confidence": 0.75
            }
    
    def _mock_analysis(self, logs: List[Dict]) -> Dict:
        """Mock анализ если API не работает"""
        level_counts = {}
        for log in logs:
            level = log.get('level', 'unknown')
            level_counts[level] = level_counts.get(level, 0) + 1
        
        return {
            "summary": f"Анализ ИИ завершен. Обработано {len(logs)} логов. Используется демонстрационный режим. (проблемы с API KEY)",
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
            "confidence": 0.60
        }
    
    def get_ai_insights(self, query: str = None, limit: int = 100) -> Dict:
        """Получить ИИ-инсайты по логам из базы"""
        store = Storage()
        logs = store.search(q=query, limit=limit)
        return self.analyze_logs(logs)
    