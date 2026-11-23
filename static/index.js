import { VKAdapter } from './player/VKAdapter.js';
import { YouTubeAdapter } from './player/YouTubeAdapter.js';
import { RutubeAdapter } from './player/RutubeAdapter.js';

// 1. Данные из HTML
const roomData = document.getElementById("room-data");
const roomId = roomData.getAttribute("data-room-id");
const username = roomData.getAttribute("data-username");
const userId = roomData.getAttribute("data-user-id");
const initialVideoId = roomData.getAttribute("data-initial-video-id");
let platform = roomData.getAttribute("data-platform") || 'youtube';

let player = null;
let ws = null;
let isRemoteAction = false;
let lastTime = 0;
let seekCheckInterval = null;
let remoteActionTimeout = null;
let pendingSyncState = null;

const SEEK_CHECK_MS = 500;
const SEEK_THRESHOLD = 1.5;

// 2. Фабрика плееров
function createPlayerAdapter(platformName, containerId) {
    console.log('Создаем адаптер:', platformName);
    if (platformName === 'vk') return new VKAdapter(containerId);
    if (platformName === 'rutube') return new RutubeAdapter(containerId);
    return new YouTubeAdapter(containerId);
}

// Смена платформы: уничтожаем старый адаптер, создаём новый, грузим видео
function recreatePlayer(newPlatform, videoId, time, playing) {
    console.log('Смена платформы на:', newPlatform);
    platform = newPlatform;

    if (player && typeof player.destroy === 'function') player.destroy();
    document.getElementById('player-container').innerHTML = '';
    player = createPlayerAdapter(platform, 'player-container');

    if (videoId) {
        player.loadVideoById(videoId, time || 0, playing);
    }

    player.onReady(() => {
        console.log('Новый плеер готов');
        if (time !== undefined && time !== null) player.seekTo(time);
        if (playing) player.play(); else player.pause();
        lastTime = time || 0;
    });
}

// 3. Инициализация
function initPlayer() {
    player = createPlayerAdapter(platform, 'player-container');

    let wsConnected = false;

    // Если мы создатель (передали videoId), грузим видео сразу
    if (initialVideoId) {
        console.log("index.js: Вызываем loadVideoById сразу");
        player.loadVideoById(initialVideoId, 0, false);
    }

    player.onReady(() => {
        console.log("index.js: onReady сработал!");

        // Применяем отложенное состояние, если есть
        if (pendingSyncState) {
            applySyncState(pendingSyncState);
            pendingSyncState = null;
        }

        if (!wsConnected) {
            wsConnected = true;
            connectWebSocket();
            startSeekDetection();
        }
    });

    player.onStateChange((event) => {
        if (isRemoteAction) return;
        const time = player.getCurrentTime();
        if (event.data === 1) {
            sendCommand({ action: 'play', time });
            lastTime = time;
        } else if (event.data === 2) {
            sendCommand({ action: 'pause', time });
            lastTime = time;
        }
    });
}

window.addEventListener('load', initPlayer);

// 4. WebSocket
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/${roomId}/${userId}?username=${encodeURIComponent(username)}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        document.getElementById('status').innerText = 'Подключено к комнате';
        if (initialVideoId) {
            sendCommand({ action: 'change_video', videoId: initialVideoId, platform: platform });
        }
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.action === 'chat') {
            renderMessage(msg);
            return;
        }

        if (msg.action === 'sync_state') {
            document.getElementById('messages').innerHTML = '';
            (msg.messages || []).forEach(renderMessage);

            // Если платформа изменилась (например, youtube -> rutube)
            if (msg.platform && msg.platform !== platform) {
                recreatePlayer(msg.platform, msg.videoId, msg.time, msg.playing);
                return;
            }

            // Если плеер ещё не готов — сохраняем состояние
            if (!player || !player.isReady) {
                pendingSyncState = msg;
                return;
            }

            applySyncState(msg);
            return;
        }

        if (msg.action === 'change_video') {
            isRemoteAction = true;
            clearTimeout(remoteActionTimeout);

            // ВАЖНО: смена платформы обрабатывается и здесь
            if (msg.platform && msg.platform !== platform) {
                recreatePlayer(msg.platform, msg.videoId, 0, false);
            } else {
                player.loadVideoById(msg.videoId, 0, false);
            }

            lastTime = 0;
            finishRemoteAction(1500);
            return;
        }

        isRemoteAction = true;
        clearTimeout(remoteActionTimeout);

        if (msg.action === 'play') {
            if (msg.time !== undefined) player.seekTo(msg.time);
            player.play();
        } else if (msg.action === 'pause') {
            if (msg.time !== undefined) player.seekTo(msg.time);
            player.pause();
        } else if (msg.action === 'seek') {
            if (msg.time !== undefined) player.seekTo(msg.time);
        }

        if (msg.time !== undefined) lastTime = msg.time;
        finishRemoteAction(1000);
    };

    ws.onclose = () => {
        document.getElementById('status').innerText = 'Отключено';
    };
}

function finishRemoteAction(delay) {
    remoteActionTimeout = setTimeout(() => {
        isRemoteAction = false;
        if (player && player.getCurrentTime) lastTime = player.getCurrentTime();
    }, delay);
}

function applySyncState(msg) {
    isRemoteAction = true;
    clearTimeout(remoteActionTimeout);

    if (msg.videoId) {
        player.loadVideoById(msg.videoId, msg.time || 0, msg.playing);
        if (msg.time !== undefined) player.seekTo(msg.time);
        if (msg.playing) player.play();
        else player.pause();
    }

    lastTime = msg.time || 0;
    finishRemoteAction(2000);
}

function sendCommand(cmd) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(cmd));
    }
}

function startSeekDetection() {
    if (seekCheckInterval) clearInterval(seekCheckInterval);
    lastTime = player.getCurrentTime();

    seekCheckInterval = setInterval(() => {
        if (!player || !player.getCurrentTime) return;
        const currentTime = player.getCurrentTime();

        if (isRemoteAction) { lastTime = currentTime; return; }

        if (player.getPlayerState() === 1) {
            sendCommand({ action: 'time_update', time: currentTime });
        }

        if (Math.abs(currentTime - lastTime) > SEEK_THRESHOLD) {
            sendCommand({ action: 'seek', time: currentTime });
        }
        lastTime = currentTime;
    }, SEEK_CHECK_MS);
}

function renderMessage(msg) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg ' + (msg.is_self ? 'self' : 'other');

    if (msg.user && msg.user !== 'Система') {
        const userSpan = document.createElement('span');
        userSpan.className = 'user';
        userSpan.textContent = msg.user;
        div.appendChild(userSpan);
    }
    if (msg.text) div.appendChild(document.createTextNode(msg.text));
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function sendChat() {
    const textInput = document.getElementById('textInput');
    const text = textInput.value.trim();
    if (!text) return;
    sendCommand({ action: 'chat', text: text });
    textInput.value = '';
}

document.getElementById('sendBtn').onclick = sendChat;
document.getElementById('textInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});

document.getElementById('changeVideoBtn').onclick = () => {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (!url) return;

    let videoId = null;
    let newPlatform = 'youtube';

    // 1. VK Видео: https://vkvideo.ru/video-193517678_456239716
    const vkMatch = url.match(/video(-?\d+)_(\d+)(?:_([a-f0-9]+))?/);
    if (vkMatch) {
        videoId = vkMatch[3]
            ? `${vkMatch[1]}_${vkMatch[2]}_${vkMatch[3]}`
            : `${vkMatch[1]}_${vkMatch[2]}`;
        newPlatform = 'vk';
    } else {
        // 2. Rutube: https://rutube.ru/video/7716bd3e665725c3c008ae7ab4ff02e2/
        const rtMatch = url.match(/([a-f0-9]{32})/);
        if (rtMatch) {
            videoId = rtMatch[1];
            newPlatform = 'rutube';
        } else {
            // 3. YouTube
            const ytMatch = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
            if (ytMatch && ytMatch[2].length === 11) {
                videoId = ytMatch[2];
                newPlatform = 'youtube';
            }
        }
    }

    if (!videoId) {
        alert('Неверная ссылка. Поддерживаются YouTube, VK Видео и Rutube.');
        return;
    }

    //sendCommand({ action: 'change_video', videoId: videoId, platform: newPlatform });
        // ЖЕСТКИЙ ТЕСТ: просто говорим адаптеру VK загрузиться
    sendCommand({ action: 'change_video', videoId: 'test', platform: 'vk' });
    document.getElementById('videoUrlInput').value = '';
};

// Обработчик оверлея
const unlockOverlay = document.getElementById('unlockOverlay');
if (unlockOverlay) {
    unlockOverlay.addEventListener('click', function() {
        this.style.display = 'none';
        if (player && typeof player.unmute === 'function') {
            player.unmute();
            if (pendingSyncState) {
                applySyncState(pendingSyncState);
                pendingSyncState = null;
            }
        }
    });
}

window.addEventListener('beforeunload', () => {
    if (seekCheckInterval) clearInterval(seekCheckInterval);
});