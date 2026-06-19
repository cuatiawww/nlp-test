include .env

up:
	docker compose up -d --build

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
	curl -X POST http://localhost:8080/api/v1/ingest \
	-H "Content-Type: application/json" \
	-d '{"source_type":"Berita Online","source_name":"Portal Demo","published_at":"2026-06-18","text":"Di Kabupaten Bogor terdapat 25 warga mengalami demam tinggi dan diare setelah banjir.","url":"https://example.local/demo"}'
