from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware  # <--- 1. Импорт
from pathlib import Path

from routers.router_page import router as router_page
from routers.router_socket import router as router_socket

app = FastAPI()

# 2. Добавление Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Разрешить всем (для теста). В продакшене лучше указать конкретные домены.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent

app.include_router(router_page)
app.include_router(router_socket)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")