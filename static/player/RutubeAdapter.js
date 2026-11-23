import { BasePlayerAdapter } from './BasePlayerAdapter.js';

// Адаптер Rutube. Управление — через postMessage (официальный Player API).
// videoId — 32-символьный hex из ссылки rutube.ru/video/{id}.
export class RutubeAdapter extends BasePlayerAdapter {
    constructor(containerId) {
        super(containerId);
        this.iframe = null;
        this.videoId = null;
        this.isReady = true;
        this._currentTime = 0;
        this._playing = false;
        this._pending = null; // {startSeconds, shouldPlay}
        this._onMessage = this._onMessage.bind(this);
        window.addEventListener('message', this._onMessage);

        setTimeout(() => {
            if (this.onReadyCallback) this.onReadyCallback();
        }, 0);
    }

    destroy() {
        window.removeEventListener('message', this._onMessage);
    }

    _send(type, data = {}) {
        if (this.iframe && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage(JSON.stringify({ type, data }), '*');
        }
    }

    loadVideoById(videoId, startSeconds = 0, shouldPlay = false) {
        // То же видео — просто перематываем
        if (videoId === this.videoId && this.iframe) {
            this.seekTo(startSeconds);
            if (shouldPlay) this.play(); else this.pause();
            return;
        }

        this.videoId = videoId;
        this._pending = { startSeconds, shouldPlay };
        this._currentTime = 0;
        this._playing = false;

        // t= — стартовая позиция (секунды)
        const src = `https://rutube.ru/play/embed/${videoId}?t=${Math.floor(startSeconds)}`;

        this.container.innerHTML = `
            <iframe src="${src}" width="100%" height="100%" frameborder="0"
                    allow="clipboard-write; autoplay; encrypted-media; fullscreen"
                    webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>`;
        this.iframe = this.container.querySelector('iframe');
    }

    _onMessage(event) {
        // Слушаем только своё iframe
        if (!this.iframe || event.source !== this.iframe.contentWindow) return;

        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'player:ready': // плеер загружен и готов (приходит один раз)
                if (this._pending) {
                    const p = this._pending;
                    this._pending = null;
                    if (p.startSeconds > 0) this.seekTo(p.startSeconds);
                    if (p.shouldPlay) this.play(); else this.pause();
                }
                break;

            case 'player:currentTime': // регулярное обновление позиции
                if (msg.data && msg.data.time !== undefined) {
                    this._currentTime = msg.data.time;
                }
                break;

            case 'player:changeState': {
                const st = msg.data && msg.data.state;
                this._playing = (st === 'playing');
                // Коды как у YouTube: 1 — играет, 2 — пауза
                if (st === 'playing') this._emit(1);
                else if (st === 'pause' || st === 'paused') this._emit(2);
                break;
            }
        }
    }

    _emit(data) {
        if (this.onStateChangeCallback) this.onStateChangeCallback({ data });
    }

    unmute() { this._send('player:unMute'); }
    play()    { this._send('player:play'); }
    pause()   { this._send('player:pause'); }
    seekTo(seconds) { this._send('player:setCurrentTime', { time: Math.floor(seconds) }); }

    getCurrentTime() { return this._currentTime; }
    getPlayerState() { return this._playing ? 1 : 2; }
}