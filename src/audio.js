// AudioManager: handles audio context, buffer loading, and sound playback
export class AudioManager {
  constructor(audioUrl = "assets/blob.wav") {
    this.audioContext = null;
    this.audioBuffer = null;
    this.audioBufferLoading = null;
    this.soundSourcePool = [];
    this.MAX_CONCURRENT_SOUNDS = 16;
    this.audioUrl = audioUrl;
    this.ensureAudioBufferLoaded();
  }

  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext
        .resume()
        .catch((err) => console.error("Failed to resume audio context:", err));
    }
    return this.audioContext;
  }

  ensureAudioBufferLoaded() {
    if (this.audioBufferLoading) return this.audioBufferLoading;
    this.audioBufferLoading = fetch(this.audioUrl)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        const ctx = this.initAudioContext();
        return ctx.decodeAudioData(arrayBuffer);
      })
      .then((buffer) => {
        this.audioBuffer = buffer;
        return buffer;
      })
      .catch((err) => {
        console.error("Failed to load audio buffer:", err);
        return null;
      });
    return this.audioBufferLoading;
  }

  playEatSoundSegment(volume = 1.0, pitch = 1.0) {
    if (!this.audioBuffer) {
      console.log("DEBUG: Audio buffer not ready yet");
      return;
    }
    const ctx = this.initAudioContext();
    try {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = this.audioBuffer;
      gainNode.gain.value = Math.min(volume, 1.0);
      source.playbackRate.value = pitch;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(ctx.currentTime, 2.1, 0.3);
      this.soundSourcePool.push(source);
      if (this.soundSourcePool.length > this.MAX_CONCURRENT_SOUNDS) {
        this.soundSourcePool.shift();
      }
    } catch (err) {
      console.error("Failed to play eat sound:", err);
    }
  }
}
