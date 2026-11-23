import re
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, HTTPException

router = APIRouter()

MAX_HISTORY = 100


def validate_room_id(room_id: str) -> str:
    if not re.match(r"^[a-zA-Z0-9_-]{1,50}$", room_id):
        raise HTTPException(status_code=400, detail="Invalid room_id")
    return room_id


class Room:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.video_id: Optional[str] = None
        self.playing = False
        self.time = 0.0
        self.messages: List[dict] = []
        self.platform: Optional[str] = None

    async def connect(self, ws: WebSocket, user_id: str):
        await ws.accept()
        self.connections[user_id] = ws
        await ws.send_json({
            "action": "sync_state",
            "videoId": self.video_id,
            "platform": self.platform,
            "playing": self.playing,
            "time": self.time,
            "messages": self.messages,
        })

    def disconnect(self, user_id: str):
        self.connections.pop(user_id, None)

    async def broadcast(self, message: dict, sender_id: Optional[str] = None):
        disconnected = []
        for uid, conn in self.connections.copy().items():
            if uid == sender_id:
                continue
            try:
                await conn.send_json(message)
            except Exception:
                disconnected.append(uid)
        for uid in disconnected:
            self.disconnect(uid)

    def update_state(self, message: dict):
        if message.get("videoId"):
            self.video_id = message["videoId"]
        if message.get("platform"):
            self.platform = message["platform"]
        if "time" in message:
            try:
                self.time = max(0.0, float(message["time"]))
            except (TypeError, ValueError):
                pass

        action = message.get("action")
        if action == "play":
            self.playing = True
        elif action == "pause":
            self.playing = False
        elif action == "time_update":
            self.playing = True

    def add_message(self, message: dict):
        self.messages.append(message)
        if len(self.messages) > MAX_HISTORY:
            self.messages = self.messages[-MAX_HISTORY:]


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    @property
    def active_connections(self) -> Dict[str, Room]:
        # Этот property нужен, чтобы router_page.py мог проверять наличие комнат
        return self.rooms

    def get_or_create(self, room_id: str) -> Room:
        if room_id not in self.rooms:
            self.rooms[room_id] = Room()
        return self.rooms[room_id]

    def cleanup(self, room_id: str):
        room = self.rooms.get(room_id)
        if room and not room.connections:
            del self.rooms[room_id]


manager = RoomManager()


@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    username = websocket.query_params.get("username", "Аноним")

    room = manager.get_or_create(room_id)
    await room.connect(websocket, user_id)

    join_msg = {
        "action": "chat",
        "user": "Система",
        "text": f"{username} присоединился к чату.",
        "is_self": False,
    }
    room.add_message(join_msg)
    await room.broadcast(join_msg, sender_id=user_id)
    await websocket.send_json(join_msg)

    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue

            action = data.get("action")

            # time_update — только для сервера, не рассылаем
            if action == "time_update":
                room.update_state(data)
                continue

            # Чат — сохраняем и рассылаем всем
            if action == "chat":
                msg = {
                    "action": "chat",
                    "user": username,
                    "text": data.get("text", ""),
                    "is_self": False,
                }
                room.add_message(msg)
                await room.broadcast(msg, sender_id=user_id)

                # ВАЖНО: отправителю шлем с is_self=True
                self_msg = {**msg, "is_self": True}
                await websocket.send_json(self_msg)
                continue

            # Смена видео
            if action == "change_video":
                video_id = data.get("videoId")
                platform = data.get("platform")
                if video_id:
                    room.video_id = video_id
                    room.platform = platform
                    room.time = 0.0
                    room.playing = False

                    # Рассылаем всем остальным
                    await room.broadcast(data, sender_id=user_id)
                    # Отправителю тоже подтверждаем
                    await websocket.send_json(data)
                continue

            # Синхронизация (play, pause, seek)
            room.update_state(data)
            await room.broadcast(data, sender_id=user_id)

    except WebSocketDisconnect:
        room.disconnect(user_id)
        leave_msg = {
            "action": "chat",
            "user": "Система",
            "text": f"{username} покинул чат.",
            "is_self": False,
        }
        room.add_message(leave_msg)
        await room.broadcast(leave_msg, sender_id=user_id)
        manager.cleanup(room_id)