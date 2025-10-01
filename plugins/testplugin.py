import grpc
import plugin_pb2
import plugin_pb2_grpc

def test_plugin():
    channel = grpc.insecure_channel('localhost:50051')
    stub = plugin_pb2_grpc.LogProcessorStub(channel)
    
    # Создаем тестовый запрос
    request = plugin_pb2.LogRequest(
        logs=[plugin_pb2.LogEntry(
            id=1,
            level="error",
            text_excerpt="Test error message"
        )],
        filter_type="errors_only"
    )
    
    response = stub.ProcessLogs(request)
    print(f"Response: {response.summary}")
    print(f"Filtered logs: {len(response.filtered_logs)}")

if __name__ == "__main__":
    test_plugin()