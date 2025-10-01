import os
from dotenv import load_dotenv
from backend.ai_analyzer import CustomAIAnalyzer

load_dotenv()

def test_custom_ai():
    analyzer = CustomAIAnalyzer()
    
    # Тестовые логи
    test_logs = [
        {"level": "error", "text_excerpt": "Authentication failed for provider", "tf_resource": "aws_instance"},
        {"level": "warning", "text_excerpt": "Resource dependency cycle detected", "tf_resource": "aws_vpc"},
        {"level": "info", "text_excerpt": "Plan: 2 to add, 0 to change, 0 to destroy", "tf_resource": "aws_s3_bucket"},
        {"level": "error", "text_excerpt": "API rate limit exceeded", "tf_resource": "aws_api_gateway"},
        {"level": "debug", "text_excerpt": "Provider initialized successfully", "tf_resource": "aws_provider"}
    ]
    
    print("🔄 Запускаем тестовый анализ...")
    result = analyzer.analyze_logs(test_logs)
    
    print("📊 Результат анализа:")
    import json
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    test_custom_ai()