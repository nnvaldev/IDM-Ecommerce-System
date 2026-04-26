.PHONY: up down build logs shell migrate seed reset

up:
	docker compose up

build:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f backend

shell:
	docker compose exec backend bash

migrate:
	docker compose exec backend alembic upgrade head

seed:
	docker compose exec backend python app/seed.py

reset:
	docker compose down -v
	docker compose up --build -d
	docker compose exec backend alembic upgrade head
	docker compose exec backend python app/seed.py
