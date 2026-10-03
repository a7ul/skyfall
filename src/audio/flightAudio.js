const CLIPS = {
  cockpit: 'jet-cockpit.mp3',
  afterburner: 'jet-afterburner.mp3',
  cannon: 'cannon-burst.mp3',
  missile: 'missile-launch.wav',
  ignition: 'rocket-ignition.wav',
  explosion: 'explosions.mp3',
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class FlightAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = {};
    this.volume = .35;
    this.previousVolume = .35;
    this.active = false;
    this.gunFiring = false;
    this.gunVoice = null;
    this.throttle = .3;
    this.speed = 70;
    this.lastExplosion = -Infinity;
  }

  preload() {
    if (this.fetchPromise) return this.fetchPromise;
    this.fetchPromise = Promise.all(Object.entries(CLIPS).map(async ([name, file]) => {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/${file}`);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return [name, await response.arrayBuffer()];
    })).catch(error => {
      this.fetchPromise = null;
      throw error;
    });
    return this.fetchPromise;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.attack.value = .004;
    limiter.release.value = .18;
    this.master.connect(limiter).connect(this.ctx.destination);
    this.ambience = this.ctx.createGain();
    this.ambience.gain.value = 0;
    this.ambience.connect(this.master);
    this.loadPromise = this.preload().then(async clips => {
      await Promise.all(clips.map(async ([name, data]) => {
        this.buffers[name] = await this.ctx.decodeAudioData(data.slice(0));
      }));
      this.startEngines();
      if (this.gunFiring) this.startGun();
    }).catch(error => console.warn('Flight audio could not load:', error));
  }

  startEngines() {
    if (this.engine || !this.ctx) return;
    const makeLayer = (buffer, filterType, frequency, gain) => {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      const level = this.ctx.createGain();
      level.gain.value = gain;
      source.connect(filter).connect(level).connect(this.ambience);
      source.start();
      return {source, filter, level};
    };
    this.engine = makeLayer(this.buffers.cockpit, 'lowpass', 1900, .75);
    this.boost = makeLayer(this.buffers.afterburner, 'highpass', 150, 0);
    this.update(this.throttle, this.speed);
    this.setActive(this.active);
  }

  setActive(active) {
    this.active = active;
    if (!active) this.setGunFiring(false);
    if (!this.ctx || !this.ambience) return;
    this.ambience.gain.setTargetAtTime(active ? 1 : 0, this.ctx.currentTime, active ? .14 : .06);
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.volume > 0) this.previousVolume = this.volume;
    if (this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .03);
  }

  toggleMute() {
    this.setVolume(this.volume ? 0 : this.previousVolume);
    return this.volume;
  }

  update(throttle, speed, afterburner = true) {
    this.throttle = throttle;
    this.speed = speed;
    if (!this.engine) return;
    const now = this.ctx.currentTime;
    const boost = clamp((throttle - .72) / .28, 0, 1);
    this.engine.source.playbackRate.setTargetAtTime(.82 + throttle * .32, now, .16);
    this.engine.filter.frequency.setTargetAtTime(1250 + throttle * 1900 + speed * 3, now, .14);
    this.engine.level.gain.setTargetAtTime(.62 + throttle * .35, now, .14);
    this.boost.source.playbackRate.setTargetAtTime(.8 + throttle * .38, now, .18);
    this.boost.level.gain.setTargetAtTime(afterburner ? .08 + boost * .62 : 0, now, .15);
  }

  play(name, gain, options = {}) {
    if (!this.ctx || !this.buffers[name]) return;
    const now = this.ctx.currentTime + (options.delay || 0);
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[name];
    source.playbackRate.value = options.rate || 1;
    const level = this.ctx.createGain();
    level.gain.setValueAtTime(.0001, now);
    level.gain.exponentialRampToValueAtTime(gain, now + .008);
    source.connect(level).connect(this.master);
    const offset = options.offset || 0;
    const bufferDuration = options.duration || source.buffer.duration - offset;
    const end = now + bufferDuration / source.playbackRate.value;
    level.gain.setValueAtTime(gain, Math.max(now + .008, end - .12));
    level.gain.exponentialRampToValueAtTime(.0001, end);
    if (options.duration) source.start(now, offset, options.duration);
    else source.start(now, offset);
    source.onended = () => source.disconnect();
    return source;
  }

  startGun() {
    if (!this.active || this.gunVoice || !this.buffers.cannon || !this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers.cannon;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 6200;
    const level = this.ctx.createGain();
    const now = this.ctx.currentTime;
    level.gain.setValueAtTime(.0001, now);
    level.gain.exponentialRampToValueAtTime(.48, now + .025);
    source.connect(filter).connect(level).connect(this.master);
    source.start(now);
    source.onended = () => source.disconnect();
    this.gunVoice = {source, level};
  }

  setGunFiring(firing) {
    if (firing === this.gunFiring) return;
    this.gunFiring = firing;
    if (firing) { this.startGun(); return; }
    if (!this.gunVoice || !this.ctx) return;
    const {source, level} = this.gunVoice;
    const now = this.ctx.currentTime;
    level.gain.cancelScheduledValues(now);
    level.gain.setValueAtTime(Math.max(level.gain.value, .0001), now);
    level.gain.exponentialRampToValueAtTime(.0001, now + .055);
    source.stop(now + .065);
    this.gunVoice = null;
  }

  tone(freq, duration = .12, type = 'sine', gain = .15, endFreq = freq) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createOscillator();
    const level = this.ctx.createGain();
    source.type = type;
    source.frequency.setValueAtTime(freq, now);
    source.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
    level.gain.setValueAtTime(.0001, now);
    level.gain.exponentialRampToValueAtTime(gain, now + .012);
    level.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(level).connect(this.master);
    source.start(now);
    source.stop(now + duration + .02);
  }

  click() { this.tone(620, .055, 'sine', .045, 470); }
  lock() { this.tone(940, .11, 'sine', .08, 1190); }
  warning() { this.tone(620, .19, 'sine', .08, 550); }
  missile() {
    const rate = .94 + Math.random() * .1;
    this.play('missile', 2.9, {rate});
    this.play('ignition', 2.3, {rate, delay: .16});
  }
  drop() { this.tone(270, .11, 'triangle', .055, 130); }
  nuclear(distance=0) {
    const delay=Math.min(1.5,distance/340);
    this.play('explosion', .72, {offset: 12.15, duration: 5.8, rate: .62, delay});
    this.play('explosion', .48, {offset: 8, duration: 3.5, rate: .86, delay:delay+.08});
  }
  gun() { this.play('cannon', .22, {duration: .17, rate: .94 + Math.random() * .12}); }
  explosion() {
    if (!this.ctx || this.ctx.currentTime - this.lastExplosion < .06) return;
    this.lastExplosion = this.ctx.currentTime;
    const variants = [[0, 3], [4, 3], [8, 3.5], [12.15, 5.8]];
    const [offset, duration] = variants[Math.floor(Math.random() * variants.length)];
    this.play('explosion', .62, {offset, duration, rate: .9 + Math.random() * .17});
  }
}
