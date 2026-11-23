export class BasePlayerAdapter {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.onReadyCallback = null;
        this.onStateChangeCallback = null;
    }

    // Вызывается перед удалением адаптера со страницы (смена платформы)
    destroy() {}

    play() { throw new Error("Not implemented"); }
    pause() { throw new Error("Not implemented"); }
    seekTo(seconds) { throw new Error("Not implemented"); }
    getCurrentTime() { throw new Error("Not implemented"); }
    getPlayerState() { throw new Error("Not implemented"); }
    loadVideoById(videoId) { throw new Error("Not implemented"); }

    onReady(cb) { this.onReadyCallback = cb; }
    onStateChange(cb) { this.onStateChangeCallback = cb; }
}