import grpc
from concurrent import futures
import sys
import os
import signal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import plugin_pb2
    import plugin_pb2_grpc
    print("Proto files imported successfully")
except ImportError as e:
    print(f"Import error: {e}")

class LogProcessorServicer(plugin_pb2_grpc.LogProcessorServicer):
    def ProcessLogs(self, request, context):
        print(f"Received request with {len(request.logs)} logs, filter: {request.filter_type}")
        
        logs = []
        for entry in request.logs:
            log_dict = {
                'id': entry.id,
                'raw_json': entry.raw_json,
                'ts': entry.ts,
                'level': entry.level,
                'tf_req_id': entry.tf_req_id,
                'tf_resource': entry.tf_resource,
                'section': entry.section,
                'text_excerpt': entry.text_excerpt
            }
            logs.append(log_dict)
        
        # Пример фильтрации: только ошибки
        if request.filter_type == "errors_only":
            filtered = [log for log in logs if log.get('level') == 'error']
        elif request.filter_type == "warnings_only":
            filtered = [log for log in logs if log.get('level') == 'warning']
        elif request.filter_type == "group_by_resource":
            filtered = logs
        else:
            filtered = logs
        
        response = plugin_pb2.LogResponse()
        for log in filtered:
            entry = plugin_pb2.LogEntry(
                id=log['id'],
                raw_json=log['raw_json'],
                ts=log['ts'],
                level=log['level'],
                tf_req_id=log['tf_req_id'],
                tf_resource=log['tf_resource'],
                section=log['section'],
                text_excerpt=log['text_excerpt']
            )
            response.filtered_logs.append(entry)
        
        response.summary = f"Processed {len(logs)} logs, returned {len(filtered)} (filter: {request.filter_type})"
        print(f"Returning {len(filtered)} logs")
        return response

# Глобальная переменная для сервера
server_instance = None

def signal_handler(sig, frame):
    print('Shutting down gRPC server...')
    if server_instance:
        server_instance.stop(5)  # Остановить за 5 секунд
    sys.exit(0)

def serve():
    global server_instance
    
    # Регистрируем обработчик сигналов
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    server_instance = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    plugin_pb2_grpc.add_LogProcessorServicer_to_server(LogProcessorServicer(), server_instance)
    server_instance.add_insecure_port('[::]:50051')
    server_instance.start()
    print("gRPC Plugin Server started on port 50051")
    print("Ready to accept connections... (Press Ctrl+C to stop)")
    
    try:
        server_instance.wait_for_termination()
    except KeyboardInterrupt:
        print("Server interrupted, shutting down...")
        server_instance.stop(5)

if __name__ == '__main__':
    serve()