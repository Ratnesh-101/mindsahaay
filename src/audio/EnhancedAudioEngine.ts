// Zero-dependency Native Web Audio API Soundscape Generator
export type SoundscapeType = "off" | "rain" | "bowl" | "solfeggio" | "delta";

export class EnhancedAudioEngine {
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;
  private timerTimeout: number | null = null;
  private currentTrack: SoundscapeType = "off";

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private setupMaster(volume = 0.7): GainNode {
    this.stop();
    const ctx = this.getContext();
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    this.masterGain.connect(ctx.destination);
    return this.masterGain;
  }

  // Backwards compatibility
  startRain() {
    this.playMonsoonRain();
  }

  startSingingBowl() {
    this.playTibetanBowl();
  }

  playMonsoonRain(volume = 0.7) {
    try {
      const master = this.setupMaster(volume);
      const ctx = this.ctx!;
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
        b6 = white * 0.115926;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(720, ctx.currentTime);

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(160, ctx.currentTime);
      lfo.connect(filter.frequency);
      lfo.start();

      noise.connect(filter);
      filter.connect(master);
      noise.start();

      this.nodes = [noise, filter, lfo, lfoGain];
      this.currentTrack = "rain";
    } catch {
      // AudioContext unavailable
    }
  }

  playTibetanBowl(volume = 0.7) {
    try {
      const master = this.setupMaster(volume * 0.8);
      const ctx = this.ctx!;

      const fund = ctx.createOscillator();
      fund.type = "sine";
      fund.frequency.setValueAtTime(432, ctx.currentTime);

      const detune = ctx.createOscillator();
      detune.type = "sine";
      detune.frequency.setValueAtTime(433.5, ctx.currentTime);

      const ot1 = ctx.createOscillator();
      ot1.type = "sine";
      ot1.frequency.setValueAtTime(864, ctx.currentTime);
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.22, ctx.currentTime);
      ot1.connect(g1);

      const ot2 = ctx.createOscillator();
      ot2.type = "sine";
      ot2.frequency.setValueAtTime(1296, ctx.currentTime);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.08, ctx.currentTime);
      ot2.connect(g2);

      fund.connect(master);
      detune.connect(master);
      g1.connect(master);
      g2.connect(master);

      fund.start();
      detune.start();
      ot1.start();
      ot2.start();

      this.nodes = [fund, detune, ot1, ot2, g1, g2];
      this.currentTrack = "bowl";
    } catch {
      // AudioContext unavailable
    }
  }

  playSolfeggio528(volume = 0.7) {
    try {
      const master = this.setupMaster(volume * 0.75);
      const ctx = this.ctx!;

      const osc528 = ctx.createOscillator();
      osc528.type = "sine";
      osc528.frequency.setValueAtTime(528, ctx.currentTime);

      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(264, ctx.currentTime);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.25, ctx.currentTime);
      sub.connect(subGain);

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(528, ctx.currentTime);
      bp.Q.setValueAtTime(3.8, ctx.currentTime);

      osc528.connect(bp);
      bp.connect(master);
      subGain.connect(master);

      osc528.start();
      sub.start();

      this.nodes = [osc528, sub, subGain, bp];
      this.currentTrack = "solfeggio";
    } catch {
      // AudioContext unavailable
    }
  }

  playDeltaBinaural(volume = 0.7) {
    try {
      const master = this.setupMaster(volume * 0.7);
      const ctx = this.ctx!;
      const merger = ctx.createChannelMerger(2);

      const left = ctx.createOscillator();
      left.type = "sine";
      left.frequency.setValueAtTime(200, ctx.currentTime);
      left.connect(merger, 0, 0);

      const right = ctx.createOscillator();
      right.type = "sine";
      right.frequency.setValueAtTime(202.5, ctx.currentTime);
      right.connect(merger, 0, 1);

      merger.connect(master);
      left.start();
      right.start();

      this.nodes = [left, right, merger];
      this.currentTrack = "delta";
    } catch {
      // AudioContext unavailable
    }
  }

  setVolume(level: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), this.ctx.currentTime, 0.05);
    }
  }

  setSleepTimer(minutes: number, onFadeComplete?: () => void) {
    if (this.timerTimeout) {
      window.clearTimeout(this.timerTimeout);
      this.timerTimeout = null;
    }
    if (minutes <= 0) return;

    this.timerTimeout = window.setTimeout(() => {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 3);
        setTimeout(() => {
          this.stop();
          onFadeComplete?.();
        }, 3100);
      } else {
        this.stop();
        onFadeComplete?.();
      }
    }, minutes * 60 * 1000);
  }

  stop() {
    if (this.timerTimeout) {
      window.clearTimeout(this.timerTimeout);
      this.timerTimeout = null;
    }
    this.nodes.forEach((n) => {
      try { (n as unknown as { stop?: () => void }).stop?.(); } catch {}
      try { n.disconnect(); } catch {}
    });
    this.nodes = [];
    if (this.ctx) {
      try { this.ctx.close(); } catch {}
      this.ctx = null;
    }
    this.masterGain = null;
    this.currentTrack = "off";
  }

  getCurrentTrack(): SoundscapeType {
    return this.currentTrack;
  }
}

export const enhancedAudio = new EnhancedAudioEngine();
export const audioEngine = enhancedAudio;
export default EnhancedAudioEngine;
