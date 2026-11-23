import { BasePlayerAdapter } from './BasePlayerAdapter.js';

export class YouTubeAdapter extends BasePlayerAdapter {
    constructor(containerId) {
        super(containerId);
        this.player = null;
        this.isReady = false;
        this.pendingVideoId = null;
        this.pendingTime = 0;
        this.pendingPlay = false;

        this.container.innerHTML = `<div id="yt-player-inner"></div>`;

        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);

            window.onYouTubeIframeAPIReady = () => {
                this._initPlayer();
            };
        } else {
            this._initPlayer();
        }
    }

    _initPlayer() {
        this.player = new YT.Player('yt-player-inner', {
            height: '100%',
            width: '100%',
            videoId: '', // Пусто, загрузим позже
            playerVars: {
                playsinline: 1,
                controls: 1,
                enablejsapi: 1,
                origin: window.location.origin
            },
            events: {
                onReady: (event) => {
                    this.isReady = true;

                    // Если видео запросили до готовности плеера — применяем сейчас
                    if (this.pendingVideoId) {
                        this._actuallyLoad(this.pendingVideoId, this.pendingTime, this.pendingPlay);
                    }

                    if (this.onReadyCallback) this.onReadyCallback();
                },
                onStateChange: (event) => {
                    if (this.onStateChangeCallback) {
                        this.onStateChangeCallback({ data: event.data });
                    }
                },
                onError: (e) => console.error('YT Error', e.data)
            }
        });
    }

    loadVideoById(videoId, startSeconds = 0, shouldPlay = true) {
        if (!this.isReady) {
            this.pendingVideoId = videoId;
            this.pendingTime = startSeconds;
            this.pendingPlay = shouldPlay;
            return;
        }
        this._actuallyLoad(videoId, startSeconds, shouldPlay);
    }

    _actuallyLoad(videoId, startSeconds, shouldPlay) {
        if (shouldPlay) {
            this.player.loadVideoById({ videoId: videoId, startSeconds: startSeconds });
        } else {
            // Строго как в старом коде: cueVideoById показывает кадр и ставит на паузу
            this.player.cueVideoById({ videoId: videoId, startSeconds: startSeconds });
        }
    }

    // Этот метод нужен для оверлея (как player.unMute() в старом коде)
    unmute() {
        if (this.isReady) this.player.unMute();
    }

    play() {
        if (this.isReady) this.player.playVideo();
    }

    pause() {
        if (this.isReady) this.player.pauseVideo();
    }

    seekTo(seconds) {
        if (this.isReady) this.player.seekTo(seconds, true);
    }

    getCurrentTime() {
        return this.isReady ? this.player.getCurrentTime() : 0;
    }

    getPlayerState() {
        return this.isReady ? this.player.getPlayerState() : -1;
    }

    getDuration() {
        return this.isReady ? this.player.getDuration() : 0;
    }
}