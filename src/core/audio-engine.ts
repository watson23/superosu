// Web Audio API wrapper — AudioContext.currentTime is the sole timing authority

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private startedAt = 0; // AudioContext time when playback started
  private pausedAt = 0; // song position in seconds when paused
  private _playing = false;

  get playing(): boolean {
    return this._playing;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  // Must be called from a user gesture (tap/click)
  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async loadAudio(data: ArrayBuffer): Promise<void> {
    if (!this.ctx) throw new Error('AudioEngine not initialized');
    this.audioBuffer = await this.ctx.decodeAudioData(data.slice(0));
  }

  get outputLatency(): number {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency ?? 0) + (this.ctx.baseLatency ?? 0);
  }

  // Returns current song position in milliseconds
  getSongPosition(userOffsetMs = 0): number {
    if (!this.ctx || !this._playing) return this.pausedAt * 1000;
    const elapsed = this.ctx.currentTime - this.startedAt;
    return (elapsed + this.pausedAt) * 1000 - userOffsetMs;
  }

  play(fromMs = 0): void {
    if (!this.ctx || !this.audioBuffer || !this.gainNode) return;

    this.stop();

    const offset = fromMs / 1000;
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);

    this.pausedAt = 0;
    this.startedAt = this.ctx.currentTime - offset;
    this.sourceNode.start(0, Math.max(0, offset));
    this._playing = true;

    this.sourceNode.onended = () => {
      this._playing = false;
    };
  }

  pause(): void {
    if (!this.ctx || !this._playing) return;
    this.pausedAt = this.ctx.currentTime - this.startedAt;
    this.sourceNode?.stop();
    this.sourceNode = null;
    this._playing = false;
  }

  resume(): void {
    if (!this.ctx || !this.audioBuffer || this._playing) return;
    this.play(this.pausedAt * 1000);
  }

  stop(): void {
    try {
      this.sourceNode?.stop();
    } catch {
      // already stopped
    }
    this.sourceNode = null;
    this._playing = false;
    this.pausedAt = 0;
    this.startedAt = 0;
  }

  setVolume(value: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  get duration(): number {
    return this.audioBuffer ? this.audioBuffer.duration * 1000 : 0;
  }
}

export const audioEngine = new AudioEngine();
