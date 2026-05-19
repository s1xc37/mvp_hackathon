# Asphalt Paving Planner

Приложение для планирования укладки асфальтобетонного покрытия с учётом прогноза погоды. Кейс «Цифровая Эра Транспорта 2026».

## Стек

- **Backend**: FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL (SQLite fallback вне Docker)
- **Frontend**: React 18 + TypeScript, Vite, Tailwind, Yandex Maps API
- **Внешние API**: Open-Meteo (погода), OSRM (маршруты)

## Быстрый запуск (Docker)

Требования: Docker Desktop с Compose v2.

```bash
docker compose up -d --build
```

После запуска:

- UI: <http://localhost:5173>
- API: <http://localhost:8000>
- Swagger: <http://localhost:8000/docs>
- Postgres: `localhost:5432` (user `asphalt_postgres`, pass `1234`, db `asphalt_db`)

> На macOS используй именно `localhost` (или `127.0.0.1`). Curl с IPv6 (`::1`) Docker Desktop не пробрасывает — будет ложный 404.

## Управление контейнерами

```bash
# Статус
docker compose ps

# Логи (-f — следить в реальном времени)
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend

# Пауза / возобновление (контейнеры сохраняются)
docker compose stop
docker compose start

# Полное удаление контейнеров и сети (volume с БД остаётся)
docker compose down

# Удаление с volumes — БД пересоздастся из seed при следующем up
docker compose down -v

# Пересобрать один сервис после изменения Dockerfile
docker compose up -d --build backend

# Зайти внутрь
docker exec -it asphalt_backend bash
docker exec -it asphalt_postgres psql -U asphalt_postgres asphalt_db
```

## Переменные окружения

Опциональные ключи для дополнительных провайдеров погоды (по умолчанию работает только Open-Meteo, ключ ему не нужен):

```bash
# .env рядом с docker-compose.yml
OPENWEATHER_API_KEY=...
TOMORROW_IO_API_KEY=...
```

## Сброс демо-данных

В UI: кнопка «↺ Сброс» в панели управления укладкой. Или вручную:

```bash
curl -X POST http://localhost:8000/api/paving/reset-demo
```

Восстановит исходное состояние полос дорог и парк техники из JSON-сидов.

## Разработка без Docker

### Backend

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

По умолчанию используется SQLite в `./app.db` (создаётся автоматически).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend ожидает API на `http://localhost:8000` — переопределяется переменной `VITE_API_URL`.

## Структура проекта

```
backend/
  app/
    routers/      # API-эндпоинты (paving, weather, green_window, ...)
    services/     # бизнес-логика (dispatch, prep, green_window, ...)
    schemas/      # Pydantic-модели
    db/           # SQLAlchemy ORM + сидинг из JSON
    providers/    # погодные API (openmeteo, openweather, tomorrow_io)
    data/         # JSON-сиды (roads, plants, vehicles, parkings)
    core/         # константы (ГОСТ), геометрия
  Dockerfile
  requirements.txt

frontend/
  src/
    pages/        # MapPage и др.
    components/   # PanelRoad, GreenWindowPanel, MapTimeline, PavingOverlay, ...
    hooks/        # usePavingSimulation
    sim/          # SimClock, useForecast
    api/          # axios-клиенты
    types/        # TypeScript-интерфейсы
  Dockerfile
  package.json

docker-compose.yml
SUMMARY.md        # отчёт о готовности к хакатону
CLAUDE.md         # инструкции для AI-ассистента
```

## Документация

- [SUMMARY.md](SUMMARY.md) — карта покрытия задач кейса, конкурентные плюсы, что не сделано.
- [CLAUDE.md](CLAUDE.md) — правила для работы AI-ассистента над проектом.
