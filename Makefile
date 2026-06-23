.PHONY: install backend frontend backend-tests frontend-tests test

install:
	cd backend && uv sync
	cd frontend && npm install

backend:
	cd backend && uv run python main.py

frontend:
	cd frontend && npm run dev

backend-tests:
	cd backend && uv run python -m unittest discover -s tests -v

frontend-tests:
	cd frontend && npm test

test: backend-tests frontend-tests