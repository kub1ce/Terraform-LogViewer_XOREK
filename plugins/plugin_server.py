import grpc
from concurrent import futures
import plugin_pb2
import plugin_pb2_grpc
import json
from typing import List, Dict

class LogProcessorServicer(plugin_pb2_grpc.LogProcessorServicer):
    def ProcessLogs(self, request, context):
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
        elif request.filter_type == "group_by_resource":
            # Группировка по ресурсам
            summary = f"Grouped {len(logs)} logs by resource"
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
        
        response.summary = f"Processed {len(logs)} logs, returned {len(filtered)}"
        return response

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    plugin_pb2_grpc.add_LogProcessorServicer_to_server(LogProcessorServicer(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("gRPC Plugin Server started on port 50051")
    server.wait_for_termination()

if __name__ == '__main__':
    serve()