// 밤마을 BGM — 파일 없이 브라우저에서 바로 연주하는 오리지널 배경음악(Web Audio).
// 바 안: 느린 재즈 라운지(로즈 피아노 코드 · 콘트라베이스 · 브러시)
// 골목:  3/4 왈츠 마을 테마(오르골 멜로디 · 플루트 · 피치카토 베이스) — MMO 마을 같은 포근한 느낌
// 브라우저 정책상 첫 터치 이후에 시작한다. 화면이 꺼지면 멈추고, 켜면 이어서 연주한다.

const NOTE = n => 440 * 2 ** ((n - 69) / 12);
const KEY = 'bam-bgm';

const TRACKS = {
  bar: {
    bpm: 68, beats: 4, swing: .16,
    // Fmaj7 · Dm7 · Gm7 · C7(9) — 두 마디씩
    chords: [[53, 57, 60, 64], [50, 57, 60, 65], [55, 58, 62, 65], [48, 58, 62, 64]],
    bass: [41, 38, 43, 36],
    scale: [65, 67, 69, 72, 74, 76, 77, 79],
    lead: 'rhodes', drums: 'brush'
  },
  town: {
    bpm: 112, beats: 3, swing: 0,
    // C · Am · F · G — 왈츠, 한 마디씩
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    bass: [48, 45, 41, 43],
    scale: [72, 74, 76, 79, 81, 84, 86, 88],
    lead: 'musicbox', drums: 'none'
  }
};

export function createBgm() {
  let ctx = null, master = null, verb = null, timer = 0, scene = 'bar', on = true, step = 0, nextAt = 0, melodyIdx = 3;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch {}
  const listeners = new Set();
  const notify = () => listeners.forEach(f => f(on));

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // 작은 방 울림(직접 만든 잔향)
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = .28; verb.connect(wet); wet.connect(master);
  }
  const out = (node, dry = 1) => { const g = ctx.createGain(); g.gain.value = dry; node.connect(g); g.connect(master); node.connect(verb); };

  function tone(t, freq, dur, {type = 'sine', vol = .1, attack = .01, release = .4, detune = 0, vibrato = 0} = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    if (vibrato) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = vibrato; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + release); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(vol * .6, t + attack, dur * .5); g.gain.setTargetAtTime(0, t + dur, release / 3);
    o.connect(g); out(g); o.start(t); o.stop(t + dur + release + .1);
  }
  const rhodes = (t, n, dur, vol) => { tone(t, NOTE(n), dur, {vol, attack: .008, release: .9}); tone(t, NOTE(n) * 2, dur * .4, {vol: vol * .25, attack: .004, release: .3, detune: 4}); };
  const musicbox = (t, n, vol) => { tone(t, NOTE(n), .05, {vol, attack: .002, release: 1.2}); tone(t, NOTE(n) * 3, .03, {vol: vol * .18, attack: .002, release: .5}); };
  const flute = (t, n, dur, vol) => tone(t, NOTE(n), dur, {type: 'triangle', vol, attack: .08, release: .35, vibrato: 3});
  const bass = (t, n, dur, vol) => tone(t, NOTE(n), dur, {type: 'triangle', vol, attack: .006, release: .25});
  function brush(t, vol) {
    const len = .12, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = .8; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  // 반 박자 단위로 앞서 예약한다
  function schedule() {
    const T = TRACKS[scene], beat = 60 / T.bpm, half = beat / 2;
    const barsPerChord = scene === 'bar' ? 2 : 1, stepsPerBar = T.beats * 2;
    while (nextAt < ctx.currentTime + .25) {
      const s = step, inBar = s % stepsPerBar, bar = Math.floor(s / stepsPerBar), ci = Math.floor(bar / barsPerChord) % T.chords.length;
      const chord = T.chords[ci], swingOff = inBar % 2 ? half * T.swing : 0, t = nextAt + swingOff;
      if (scene === 'bar') {
        if (inBar === 0 && bar % barsPerChord === 0) chord.forEach((n, i) => rhodes(t + i * .018, n, beat * 3.2, .045));
        if (inBar === 5 && Math.random() < .5) chord.slice(1).forEach(n => rhodes(t, n, beat * .8, .028));
        if (inBar % 2 === 0) bass(t, T.bass[ci] + (inBar === 4 ? 7 : inBar === 6 ? (Math.random() < .5 ? 5 : 10) : 0), beat * .9, .12);
        if (inBar === 2 || inBar === 6) brush(t, .05); else if (inBar % 2 === 1) brush(t, .018);
        if (inBar % 2 === 0 && Math.random() < .32) { melodyIdx = Math.max(0, Math.min(T.scale.length - 1, melodyIdx + [-2, -1, 1, 2][Math.random() * 4 | 0])); rhodes(t, T.scale[melodyIdx], beat * 1.4, .035); }
      } else {
        if (inBar === 0) bass(t, T.bass[ci], beat * .7, .11);
        if (inBar === 2 || inBar === 4) chord.forEach(n => tone(t, NOTE(n), beat * .5, {type: 'triangle', vol: .022, attack: .01, release: .2}));
        if (inBar % 2 === 0 || Math.random() < .25) {
          melodyIdx = Math.max(0, Math.min(T.scale.length - 1, melodyIdx + [-1, 1, 1, -2, 2, 0][Math.random() * 6 | 0]));
          musicbox(t, T.scale[melodyIdx], .07);
        }
        if (bar % 8 >= 4 && inBar === 0) flute(t, chord[chord.length - 1] + 12, beat * 2.6, .03);
      }
      step++; nextAt += half;
    }
  }

  function fade(to, sec = 1.2) { if (!master) return; const g = master.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec); }
  function play() {
    if (!on || document.hidden) return;
    init(); if (!ctx) return;
    ctx.resume?.();
    if (!timer) { nextAt = ctx.currentTime + .1; timer = setInterval(schedule, 60); }
    fade(.55);
  }
  function stop(sec = .6) {
    if (!ctx) return; fade(0, sec);
    setTimeout(() => { if (!on || document.hidden) { clearInterval(timer); timer = 0; ctx.suspend?.(); } }, sec * 1000 + 50);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(.2); else if (started) play(); });
  let started = false;
  return {
    // 첫 터치에서 부른다(자동재생 막힘 회피)
    start() { started = true; play(); },
    setScene(s) {
      if (!TRACKS[s] || s === scene) return; scene = s;
      if (!ctx || !timer) return;
      fade(0, .5); setTimeout(() => { step = 0; melodyIdx = 3; nextAt = ctx.currentTime + .1; if (on) fade(.55, 1.5); }, 520);
    },
    toggle() { on = !on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {} if (on) { started = true; play(); } else stop(); notify(); return on; },
    get on() { return on; }, get started() { return started; },
    onChange(f) { listeners.add(f); f(on); }
  };
}
