import random
import re
from pathlib import Path
from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

# Импортируем менеджер комнат из соседнего файла
from routers.router_socket import manager

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def validate_room_id(room_id: str) -> str:
    if not re.match(r"^[a-zA-Z0-9_-]{1,50}$", room_id):
        raise HTTPException(status_code=400, detail="Неверный ID комнаты. Используйте буквы, цифры, _ и -")
    return room_id


def extract_youtube_id(url: str) -> str:
    regExp = r"^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*"
    match = re.match(regExp, url)
    if match and len(match.group(2)) == 11:
        return match.group(2)
    return None


def extract_vk_id(url: str) -> str:
    # # 1. Формат "video-123456_789012" — обычная ссылка (vkvideo.ru / vk.com / vk.ru)
    # # 2. Формат "oid=...&id=...&hash=..." — если вставили код вставки/iframe
    # match = re.search(r"video(-?\d+)_(\d+)_?([a-f0-9]*)", url)
    # if match:
    #     if match.group(3):
    #         return f"{match.group(1)}_{match.group(2)}_{match.group(3)}"
    #     return f"{match.group(1)}_{match.group(2)}_fb4e68a595e78696"  # ← хардкод hash
    #
    # oid_match = re.search(r"oid=(-?\d+)", url)
    # id_match = re.search(r"id=(\d+)", url)
    # if oid_match and id_match:
    #     hash_match = re.search(r"hash=([a-f0-9]+)", url)
    #     if hash_match:
    #         return f"{oid_match.group(1)}_{id_match.group(1)}_{hash_match.group(1)}"
    #     return f"{oid_match.group(1)}_{id_match.group(1)}"
    #
    # return None

    return "test"  # Временно!


def extract_rutube_id(url: str) -> str:
    # Ищем 32-символьный hex ID (работает для /video/, /shorts/, /play/embed/)
    match = re.search(r"([a-f0-9]{32})", url)
    if match:
        return match.group(1)
    return None


@router.get("/", response_class=HTMLResponse)
async def home_page(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})


@router.post("/create_chat", response_class=HTMLResponse)
async def create_chat(
        request: Request,
        username: str = Form(...),
        room_id: str = Form(...),
        video_url: str = Form(...)
):
    validate_room_id(room_id)
    user_id = str(random.randint(100, 100000))

    if room_id in manager.active_connections:
        return templates.TemplateResponse("home.html", {
            "request": request,
            "error": "Комната с таким ID уже существует. Придумайте другой."
        })

    # 1. VK Видео
    video_id = extract_vk_id(video_url)
    platform = "vk"

    # 2. Rutube
    if not video_id:
        video_id = extract_rutube_id(video_url)
        platform = "rutube"

    # 3. YouTube
    if not video_id:
        video_id = extract_youtube_id(video_url)
        platform = "youtube"

    if not video_id:
        return templates.TemplateResponse("home.html", {
            "request": request,
            "error": "Не удалось распознать ссылку. Поддерживаются YouTube, VK Видео и Rutube."
        })

    return templates.TemplateResponse("index.html", {
        "request": request,
        "room_id": room_id,
        "username": username,
        "user_id": user_id,
        "initial_video_id": video_id,
        "platform": platform
    })


@router.post("/join_chat", response_class=HTMLResponse)
async def join_chat(
        request: Request,
        username: str = Form(...),
        room_id: str = Form(...)
):
    validate_room_id(room_id)

    if room_id not in manager.active_connections:
        return templates.TemplateResponse("home.html", {
            "request": request,
            "error": "Комната не найдена или все участники уже вышли."
        })

    user_id = str(random.randint(100, 100000))

    return templates.TemplateResponse("index.html", {
        "request": request,
        "room_id": room_id,
        "username": username,
        "user_id": user_id,
        "initial_video_id": None,
        "platform": None
    })