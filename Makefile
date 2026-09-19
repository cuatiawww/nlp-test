include .env

up:
	docker compose up -d --build

prod-up:
	docker compose -f docker-compose-prod.yml up -d --build

prod-down:
	docker compose -f docker-compose-prod.yml down

prod-logs:
	docker compose -f docker-compose-prod.yml logs -f --tail=200

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

restart:
	docker compose restart

clean:
	docker compose down -v

api-test:
	curl -X POST http://localhost:8081/api/v1/ingest \
	-H "Content-Type: application/json" \
	-d '{"source_type":"Berita Online","source_name":"Portal Demo","published_at":"2026-06-18","text":"Di Kabupaten Bogor terdapat 25 warga mengalami demam tinggi dan diare setelah banjir.","url":"https://example.local/demo"}'

bootstrap-data:
	python3 scripts/bootstrap_multilingual_data.py

bootstrap-data-llm:
	@echo "DeepSeek dipakai oleh NLP runtime sebagai fallback deteksi; bootstrap WHO tetap deterministik."
	$(MAKE) bootstrap-data

cache-nllb:
	docker compose run --rm --no-deps \
		-e HF_HUB_OFFLINE=0 \
		-e TRANSFORMERS_OFFLINE=0 \
		disease-nlp-python \
		python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="facebook/nllb-200-distilled-600M")'

export-training:
	TRAINING_DATABASE_URL="$(TRAINING_DATABASE_URL)" python3 scripts/export_training_data.py

export-training-all-years:
	TRAINING_DATABASE_URL="$(TRAINING_DATABASE_URL)" python3 scripts/export_training_data.py --all-years

import-bencana-live:
	docker compose run --rm --no-deps -v "$(CURDIR)/scripts:/app/scripts:ro" collector-python \
		python /app/scripts/import_bencana_ai_live.py

import-bencana-live-health:
	docker compose run --rm --no-deps -v "$(CURDIR)/scripts:/app/scripts:ro" collector-python \
		python /app/scripts/import_bencana_ai_live.py --health-only-source --republish-existing

retrain-dry-run:
	TRAINING_DATABASE_URL="$(TRAINING_DATABASE_URL)" python3 scripts/retrain_from_db.py --dry-run

retrain:
	TRAINING_DATABASE_URL="$(TRAINING_DATABASE_URL)" python3 scripts/retrain_from_db.py --restart-service
