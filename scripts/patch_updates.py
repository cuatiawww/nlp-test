import os

# 1. Update docker-compose.yml to mount collector app
dc_path = "/home/aspire_5/app/NLP-PENYAKIT/docker-compose.yml"
with open(dc_path, "r", encoding="utf-8") as f:
    dc_code = f.read()

target_collector_dc = '''  disease-collector-python:
    build:
      context: ./services/collector-python
    container_name: disease-collector-python
    restart: on-failure
    env_file: .env
    environment:
      NLP_SERVICE_URL: http://disease-nlp-python:8000
      MINIO_ENDPOINT: http://disease-minio:9000
      RABBITMQ_URL: ${RABBITMQ_URL_DISEASE:-amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@disease-rabbitmq:5672/%2f}'''

replacement_collector_dc = '''  disease-collector-python:
    build:
      context: ./services/collector-python
    container_name: disease-collector-python
    restart: on-failure
    env_file: .env
    environment:
      NLP_SERVICE_URL: http://disease-nlp-python:8000
      MINIO_ENDPOINT: http://disease-minio:9000
      RABBITMQ_URL: ${RABBITMQ_URL_DISEASE:-amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@disease-rabbitmq:5672/%2f}
    volumes:
      - ./services/collector-python/app:/app/app'''

if target_collector_dc in dc_code:
    dc_code = dc_code.replace(target_collector_dc, replacement_collector_dc, 1)
    with open(dc_path, "w", encoding="utf-8") as f:
        f.write(dc_code)
    print("✅ Successfully updated docker-compose.yml for collector volume mount")

# 2. Update pipeline.py for explicit_outbreak priority
pipe_path = "/home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/app/pipeline.py"
with open(pipe_path, "r", encoding="utf-8") as f:
    pipe_code = f.read()

target_event_logic = '''    if is_reference_content or (
        extractors.is_policy_or_statistical_health_content(analysis_text)
        and not explicit_outbreak
    ):
        outbreak_alert = False
        if is_health_related:
            event_type = "health update"
            event_confidence = max(event_confidence, 0.85)
    elif explicit_outbreak and disease != "UNKNOWN":
        event_type = "disease outbreak wabah"
        event_confidence = max(event_confidence, 0.85)'''

replacement_event_logic = '''    if explicit_outbreak and disease != "UNKNOWN":
        event_type = "disease outbreak wabah"
        event_confidence = max(event_confidence, 0.85)
    elif is_reference_content or (
        extractors.is_policy_or_statistical_health_content(analysis_text)
        and not explicit_outbreak
    ):
        outbreak_alert = False
        if is_health_related:
            event_type = "health update"
            event_confidence = max(event_confidence, 0.85)'''

if target_event_logic in pipe_code:
    pipe_code = pipe_code.replace(target_event_logic, replacement_event_logic, 1)
    with open(pipe_path, "w", encoding="utf-8") as f:
        f.write(pipe_code)
    print("✅ Successfully updated event logic in pipeline.py")

print("=== Applied updates ===")
