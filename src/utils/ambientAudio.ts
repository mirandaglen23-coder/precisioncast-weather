/**
 * PrecisionCast Procedural Atmospheric Web Audio Engine
 * Zero-asset, fully synthesized high-fidelity ambient soundscapes
 */

export type SoundscapeType = 'rain' | 'wind' | 'thunder' | 'night' | 'clear';

class AtmosphericAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private currentType: SoundscapeType = 'clear';
  private masterGain: GainNode | null = null;
  private activeNodes: (AudioNode | number)[] = [];
  private volume: number = 0.35;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentType(): SoundscapeType {
    return this.currentType;
  }

  public stop() {
    this.isPlaying = false;
    this.cleanupNodes();
  }

  private cleanupNodes() {
    this.activeNodes.forEach((node) => {
      if (typeof node === 'number') {
        window.clearInterval(node);
      } else {
        try {
          if ('stop' in node && typeof (node as any).stop === 'function') {
            (node as any).stop();
          }
          node.disconnect();
        } catch {
          // ignore cleanup errors
        }
      }
    });
    this.activeNodes = [];
  }

  public play(type: SoundscapeType) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    this.cleanupNodes();
    this.isPlaying = true;
    this.currentType = type;

    switch (type) {
      case 'rain':
      case 'thunder':
        this.createRainSound(type === 'thunder');
        break;
      case 'wind':
        this.createWindSound();
        break;
      case 'night':
        this.createNightCricketsSound();
        break;
      case 'clear':
      default:
        this.createBreezeSound();
        break;
    }
  }

  private createNoiseBuffer(durationSeconds = 5): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * durationSeconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    // Pink noise generation
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      const pink = (lastOut + 0.02 * white) / 1.02;
      lastOut = pink;
      data[i] = pink * 3.5;
    }
    return buffer;
  }

  private createRainSound(withThunder = false) {
    if (!this.ctx || !this.masterGain) return;

    const noiseBuffer = this.createNoiseBuffer(5);
    if (!noiseBuffer) return;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Dual-band filter for rain texture
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filter.Q.setValueAtTime(0.8, this.ctx.currentTime);

    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(0.4, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(this.masterGain);

    noiseSource.start();
    this.activeNodes.push(noiseSource, filter, rainGain);

    // Occasional thunder rumbling
    if (withThunder) {
      const triggerThunder = () => {
        if (!this.ctx || !this.masterGain || !this.isPlaying) return;
        const thunderNoise = this.createNoiseBuffer(4);
        if (!thunderNoise) return;

        const tSource = this.ctx.createBufferSource();
        tSource.buffer = thunderNoise;

        const tFilter = this.ctx.createBiquadFilter();
        tFilter.type = 'lowpass';
        tFilter.frequency.setValueAtTime(180, this.ctx.currentTime);

        const tGain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        tGain.gain.setValueAtTime(0.01, now);
        tGain.gain.linearRampToValueAtTime(0.6, now + 0.4);
        tGain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        tSource.connect(tFilter);
        tFilter.connect(tGain);
        tGain.connect(this.masterGain);

        tSource.start(now);
        tSource.stop(now + 4);
      };

      const thunderInterval = window.setInterval(() => {
        if (Math.random() < 0.6) {
          triggerThunder();
        }
      }, 12000);
      this.activeNodes.push(thunderInterval);
      // Trigger one initial soft rumble
      setTimeout(triggerThunder, 2000);
    }
  }

  private createWindSound() {
    if (!this.ctx || !this.masterGain) return;

    const noiseBuffer = this.createNoiseBuffer(6);
    if (!noiseBuffer) return;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    // LFO for slow atmospheric gust modulation
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(220, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(windGain);
    windGain.connect(this.masterGain);

    noiseSource.start();
    lfo.start();
    this.activeNodes.push(noiseSource, filter, lfo, lfoGain, windGain);
  }

  private createBreezeSound() {
    if (!this.ctx || !this.masterGain) return;

    const noiseBuffer = this.createNoiseBuffer(6);
    if (!noiseBuffer) return;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, this.ctx.currentTime);

    const breezeGain = this.ctx.createGain();
    breezeGain.gain.setValueAtTime(0.2, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(breezeGain);
    breezeGain.connect(this.masterGain);

    noiseSource.start();
    this.activeNodes.push(noiseSource, filter, breezeGain);
  }

  private createNightCricketsSound() {
    if (!this.ctx || !this.masterGain) return;
    this.createBreezeSound();

    // High frequency soft chirp
    const chirpOsc = this.ctx.createOscillator();
    chirpOsc.type = 'sine';
    chirpOsc.frequency.setValueAtTime(4500, this.ctx.currentTime);

    const chirpMod = this.ctx.createOscillator();
    chirpMod.type = 'square';
    chirpMod.frequency.setValueAtTime(14, this.ctx.currentTime);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

    const cricketGain = this.ctx.createGain();
    cricketGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

    chirpMod.connect(modGain.gain);
    chirpOsc.connect(cricketGain);
    cricketGain.connect(this.masterGain);

    chirpOsc.start();
    chirpMod.start();
    this.activeNodes.push(chirpOsc, chirpMod, modGain, cricketGain);
  }
}

export const ambientAudio = new AtmosphericAudioEngine();
