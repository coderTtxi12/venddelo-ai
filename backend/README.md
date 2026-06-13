# venddelo-ai-backend

FastAPI backend for Vendelo AI (modular monolith, SOLID, microservices-ready).

## Setup

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8080
# health: http://localhost:8080/api/v1/health
```

## Quality

```bash
pytest
ruff check .
black --check .
mypy app
```
