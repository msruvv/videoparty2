import { BasePlayerAdapter } from './BasePlayerAdapter.js';

export class VKAdapter extends BasePlayerAdapter {
    constructor(containerId) {
        super(containerId);
        this.iframe = null;
        this.isReady = true;

        // Сообщаем index.js, что мы "готовы" (чтобы он запустил WebSocket)
        setTimeout(() => {
            if (this.onReadyCallback) this.onReadyCallback();
        }, 0);
    }

    loadVideoById(videoId, startSeconds = 0, shouldPlay = false) {
        // ЖЕСТКИЙ ТЕСТ: Игнорируем videoId и вставляем точный HTML-код
        console.log("VKAdapter: Вставляем тестовый iframe");

        this.container.innerHTML = `
            <iframe src="https://vk.ru/video_ext.php?oid=-214524833&id=456248830&hash=cf2464d7a1e94abf&hd=4"
                    referrerpolicy="no-referrer"
                    width="100%" height="100%"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;"
                    frameborder="0" allowfullscreen>
            </iframe>`;
    }

    // Заглушки, чтобы index.js не падал с ошибками
    destroy() {}
    play() { console.log("VK: play (заглушка)"); }
    pause() { console.log("VK: pause (заглушка)"); }
    seekTo(s) { console.log("VK: seekTo (заглушка)"); }
    getCurrentTime() { return 0; }
    getPlayerState() { return -1; } // -1 означает, что плеер не управляется
    unmute() {}
}