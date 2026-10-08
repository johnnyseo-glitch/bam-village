// 밤마을 v0.7 — 앰버 조명의 미드센추리 바 디오라마와 2등신 동물 주민.
// 모든 그림은 코드와 캔버스로 직접 만든다(외부 이미지·모델 없음).
// 무드: 월넛 루버 · 러스트 벨벳 커튼 · 웜다크 콘크리트 · 돌기둥 링 바 · 버섯 램프 · 캐러멜 가죽 · 앰버 빛 웅덩이.
import * as T from './vendor/three.min.mjs?v=1791424785';
import {TABLES, WANDERERS, LOUNGERS, ENTRY, DOOR_Z, ROOM, RING, SOFA, MEZZ, MEZZ_Y, STAIRS, WELCOME_ZONE, PEOPLE} from './map-data.mjs?v=1791424785';

export const HOST_STEP = .32; // 링 바 안쪽 발판 높이: 호스트 얼굴이 카운터 위로 보이게
const SKY = '#211b17'; // v1.8 젠 하이엔드: 바깥은 깊은 웜 차콜
const OUTLINE_COLOR = '#2e1f17';
const AMBER = '#ff9a4d';

export function createWorld() {
  const scene = new T.Scene();
  scene.background = new T.Color(SKY);
  scene.fog = new T.Fog(SKY, 24, 44);

  // ── 공용 재질 ─────────────────────────────────────────
  const grad = new T.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, T.RedFormat);
  grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true;
  const cache = new Map();
  const toon = (color, extra = {}) => {
    if (extra.map) return new T.MeshToonMaterial({color, gradientMap: grad, ...extra});
    const key = color + JSON.stringify(extra);
    if (!cache.has(key)) cache.set(key, new T.MeshToonMaterial({color, gradientMap: grad, ...extra}));
    return cache.get(key);
  };
  const basic = (color, extra = {}) => new T.MeshBasicMaterial({color, ...extra});
  const glow = (color, extra = {}) => new T.MeshBasicMaterial({color, toneMapped: false, ...extra});
  const OUTLINE = new T.MeshBasicMaterial({color: OUTLINE_COLOR, side: T.BackSide});

  const geoCache = new Map();
  const geo = (key, fn) => { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); };
  function mesh(g, m, x = 0, y = 0, z = 0, parent = scene, shadow = true) {
    const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
  }
  const box = (w, h, d, m, x, y, z, p, s) => mesh(geo(`b${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)), m, x, y, z, p, s);
  const sphere = (r, m, x, y, z, p, s) => mesh(geo('s' + r, () => new T.SphereGeometry(r, 20, 14)), m, x, y, z, p, s);
  const cyl = (a, b, h, m, x, y, z, p, s, seg = 20) => mesh(geo(`c${a},${b},${h},${seg}`, () => new T.CylinderGeometry(a, b, h, seg)), m, x, y, z, p, s);
  const cone = (r, h, m, x, y, z, p, seg = 12) => mesh(geo(`k${r},${h},${seg}`, () => new T.ConeGeometry(r, h, seg)), m, x, y, z, p);
  const capsule = (r, l, m, x, y, z, p) => mesh(geo(`p${r},${l}`, () => new T.CapsuleGeometry(r, l, 6, 14)), m, x, y, z, p);
  const dome = (r, m, x, y, z, p, s = false) => mesh(geo('d' + r, () => new T.SphereGeometry(r, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m, x, y, z, p, s);
  function outline(o, size, th = .022) {
    const ol = new T.Mesh(o.geometry, OUTLINE); ol.scale.setScalar(1 + th / size);
    ol.castShadow = false; ol.receiveShadow = false; o.add(ol); return o;
  }
  const upV = new T.Vector3(0, 1, 0), tmpV = new T.Vector3();
  function rod(a, b, r, m, parent = scene) {
    tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = tmpV.length();
    const o = mesh(geo(`r${r},${len.toFixed(3)}`, () => new T.CylinderGeometry(r, r, len, 8)), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
    o.quaternion.setFromUnitVectors(upV, tmpV.normalize());
    return o;
  }
  // 위아래가 열린 호(arc) 모양 벽 — 링 바, 부스 소파에 쓴다. 각도는 cylinder 기준(0 = +z).
  const arcWall = (r, h, start, len, m, x, y, z, p) => mesh(new T.CylinderGeometry(r, r, h, 48, 1, true, start, len), m, x, y, z, p);
  // 평평한 호 판. 각도는 cylinder 기준과 같게 맞춘다.
  function arcTop(r0, r1, start, len, m, x, y, z, p) {
    const o = mesh(new T.RingGeometry(r0, r1, 48, 1, start - Math.PI / 2, len), m, x, y, z, p);
    o.rotation.x = -Math.PI / 2; return o;
  }
  const tag = (root, id) => root.traverse(o => { if (o.isMesh) o.userData.entity = id; });
  const entities = new Map(), npcs = [], lampShades = [], flagTexes = [], drawables = [];
  let rand = 11; const rnd = () => (rand = (rand * 16807) % 2147483647) / 2147483647;

  // ── 캔버스 텍스처 ─────────────────────────────────────
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat); }
    t.userData.redraw = font => { const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h, font); t.needsUpdate = true; };
    return t;
  }
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };

  // 트래버틴 석재 타일 바닥(따뜻한 그레이지 · 결 무늬 · 얇은 줄눈)
  const floorTex = canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = '#a8927b'; c.fillRect(0, 0, w, h);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 2; tx++) { c.fillStyle = ['#ab957e', '#a38d76', '#ae9983', '#a6907a'][(tx + ty * 3) % 4]; c.fillRect(tx * 512, ty * 256, 512, 256); }
    for (let y = 0; y < h; y += 3) { c.fillStyle = rnd() > .5 ? '#b8a48d' : '#98826c'; c.globalAlpha = .18; c.fillRect(0, y, w, 1 + rnd() * 2); }
    for (let i = 0; i < 900; i++) { c.fillStyle = rnd() > .5 ? '#c2ae96' : '#8f7a65'; c.globalAlpha = .22; c.beginPath(); c.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 14, 1 + rnd() * 3, 0, 0, 7); c.fill(); }
    c.globalAlpha = 1; c.fillStyle = '#7f6c5a';
    for (let i = 0; i <= 2; i++) c.fillRect(i * 512 - 1, 0, 2, h);
    for (let i = 0; i <= 4; i++) c.fillRect(0, i * 256 - 1, w, 2);
  }, [4.5, 3.75]);

  // 월넛 루버 벽
  const slatTex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#3a2c22'; c.fillRect(0, 0, w, h);
    const tones = ['#b08b64', '#b9946c', '#a8845e', '#bf9b72'];
    for (let x = 0, i = 0; x < w; x += 32, i++) {
      c.fillStyle = tones[i % tones.length]; c.fillRect(x + 6, 0, 22, h);
      c.fillStyle = '#ffffff1a'; c.fillRect(x + 6, 0, 4, h);
    }
  }, [14, 1]);

  // 러스트 벨벳 커튼(주름)
  const velvetTex = (base) => canvasTex(512, 512, (c, w, h) => {
    const col = new T.Color(base);
    for (let x = 0; x < w; x++) {
      const k = .62 + .38 * (.5 + .5 * Math.sin(x / 11)) * (.8 + .2 * Math.sin(x / 3.7));
      c.fillStyle = `rgb(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0})`; c.fillRect(x, 0, 1, h);
    }
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#00000055'); g.addColorStop(.45, '#00000000'); g.addColorStop(1, '#0000002a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const rustVelvet = velvetTex('#d8c4a6'); // 리넨(오트밀) 커튼

  // 트래버틴(결 있는 돌)과 거친 돌기둥
  const travertine = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#c7ab88'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { c.fillStyle = rnd() > .5 ? '#d4b996' : '#b69a78'; c.globalAlpha = .45; c.fillRect(0, y, w, 1 + rnd() * 3); }
    c.globalAlpha = .5; c.fillStyle = '#9e8466'; for (let i = 0; i < 160; i++) c.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 30, 2);
    c.globalAlpha = 1;
  }, [6, 1]);
  const roughStone = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#7d736a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { c.fillStyle = rnd() > .5 ? '#a4998b' : '#776d63'; c.globalAlpha = .5; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 10, 2 + rnd() * 8); }
    c.globalAlpha = 1;
  }, [2, 1]);

  // 벽 위쪽 앰버 백라이트 띠
  const bandTex = canvasTex(64, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff1d6'); g.addColorStop(.55, '#ffd9a6'); g.addColorStop(1, '#e9b77c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });

  // 추상 붓터치 그림
  const artTex = (bg, ink, seed) => canvasTex(256, 340, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = ink; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.lineWidth = 26 - i * 7; c.globalAlpha = .9 - i * .2;
      c.beginPath(); c.ellipse(w / 2 + i * 6 - seed * 4, h / 2 + i * 5, 72 - i * 10, 96 - i * 12, .25 + seed * .2, .3, Math.PI * 1.85); c.stroke();
    }
    c.globalAlpha = 1;
  });

  const neonTex = canvasTex(1024, 256, (c, w, h, font = 'sans-serif') => {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `120px ${font}`;
    for (const [blur, col] of [[30, '#ffe0b8'], [10, '#fff1dc'], [0, '#fffaf2']]) { c.shadowColor = '#ffd09a'; c.shadowBlur = blur; c.fillStyle = col; c.fillText('bam village ☾', w / 2, h / 2 + 6); }
  }); drawables.push(neonTex);

  const matTex = canvasTex(512, 256, (c, w, h, font = 'sans-serif') => {
    c.fillStyle = '#2b221d'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#6b5446'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = '#f1dcc0'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `74px ${font}`; c.fillText('WELCOME', w / 2, h / 2 - 16);
    c.font = `38px ${font}`; c.fillText('어서 와요, 밤마을', w / 2, h / 2 + 52);
  }); drawables.push(matTex);

  // ── 재질 팔레트 ───────────────────────────────────────
  const M = {
    // v1.8 젠 하이엔드 팔레트: 내추럴 오크 · 트래버틴 · 리넨 · 올리브 벨벳 · 블랙 스톤 · 브라스
    oak: toon('#d2ab7c'), oakDark: toon('#b48c62'), walnut: toon('#a07a55'), walnutDark: toon('#5c4535'),
    darkTop: toon('#2b2724'), boucle: toon('#f1e9dc'), tweed: toon('#b3a594'), tweedDark: toon('#9a8c7c'),
    leather: toon('#b07a4a'), leatherDark: toon('#8c5f38'), velvet: toon('#7f8a63'), velvetDark: toon('#5f6a48'),
    brownVelvet: toon('#9c6c48'), greenVelvet: toon('#566b4f'),
    chrome: toon('#d5d8da'), brass: toon('#d6a856'), stone: toon('#ece6dc'), rug: toon('#d8ccb8'), rug2: toon('#7c6a5c'),
    ceramic: toon('#e6ddcf'), black: toon('#231c18'), branch: toon('#8a6a45'), dryLeaf: toon('#c9995a'), olive: toon('#5f7350'),
    glass: toon('#f1e2c8', {transparent: true, opacity: .6})
  };
  const LAMP_GLOW = glow('#ffb46a'), LAMP_GLOW_HOT = glow('#ffd7a3');

  // ── 바닥 · 벽 (디오라마) ──────────────────────────────
  const CZ = ROOM.cz, DEPTH = ROOM.depth; // 앞쪽으로 넓힌 바닥(가운데 z = CZ)
  box(18.6, .7, DEPTH + .6, toon('#6b5a4c'), 0, -.36, CZ);
  box(18.8, .14, DEPTH + .8, M.walnutDark, 0, -.68, CZ);
  const floor = mesh(new T.PlaneGeometry(18, DEPTH), toon('#ffffff', {map: rep(floorTex, 4.5, 4.75)}), 0, .001, CZ, scene, false);
  floor.rotation.x = -Math.PI / 2;
  const WALL_H = 6.6;
  mesh(new T.PlaneGeometry(18.4, WALL_H), toon('#ffffff', {map: rep(slatTex, 14, 1.8)}), 0, WALL_H / 2, -7.5, scene, false);
  const left = mesh(new T.PlaneGeometry(DEPTH, WALL_H), toon('#ffffff', {map: rep(slatTex, 14, 1.8)}), -9.2, WALL_H / 2, CZ, scene, false); left.rotation.y = Math.PI / 2;
  box(18.4, .12, .12, M.walnutDark, 0, .06, -7.44); box(.12, .12, DEPTH, M.walnutDark, -9.14, .06, CZ);
  // 오른쪽 낮은 루버 칸막이
  box(.26, 1.0, DEPTH, toon('#ffffff', {map: rep(slatTex, 14, .3)}), 9.12, .5, CZ);
  box(.44, .07, DEPTH + .2, M.walnut, 9.12, 1.03, CZ);

  // 벽 위쪽 앰버 백라이트 띠 + 네온
  mesh(new T.PlaneGeometry(18.4, .5), glow('#ffffff', {map: bandTex}), 0, WALL_H - .3, -7.43, scene, false);
  { const lb = mesh(new T.PlaneGeometry(DEPTH, .5), glow('#ffffff', {map: bandTex}), -9.15, WALL_H - .3, CZ, scene, false); lb.rotation.y = Math.PI / 2; }
  const neon = mesh(new T.PlaneGeometry(2.8, .7), glow('#ffffff', {map: neonTex, transparent: true, depthWrite: false}), -1.2, 5.45, -7.4, scene, false);
  neon.userData.ignorePick = true;

  // 바 뒤 러스트 벨벳 커튼(가운데), 혼술 코너 쪽 커튼(왼쪽 벽)
  const curtainM = toon('#ffffff', {map: rustVelvet});
  mesh(new T.PlaneGeometry(7.6, 2.7), curtainM, 0, 1.35, -7.4, scene, false);
  { const lc = mesh(new T.PlaneGeometry(4.6, 3.2), toon('#ffffff', {map: rep(rustVelvet, 1.4, 1)}), -9.08, 1.6, 4.3, scene, false); lc.rotation.y = Math.PI / 2; }

  // 그림 액자(양옆 루버 벽)
  [[-6.0, '#efe3d0', '#2b2622', 0], [6.0, '#e9dcc8', '#8f3d1e', 1]].forEach(([x, bg, ink, seed]) => {
    box(.95, 1.25, .05, M.walnutDark, x, 2.3, -7.42);
    mesh(new T.PlaneGeometry(.85, 1.15), toon('#ffffff', {map: artTex(bg, ink, seed)}), x, 2.3, -7.39, scene, false);
  });
  {
    const p = mesh(new T.PlaneGeometry(.8, 1.05), toon('#ffffff', {map: artTex('#e9dcc8', '#6a4430', 2)}), -9.08, 2.3, .7, scene, false); p.rotation.y = Math.PI / 2;
    box(.04, 1.15, .9, M.walnutDark, -9.11, 2.3, .7);
  }

  // 벽시계(왼쪽 벽)
  const clock = new T.Group(); clock.position.set(-9.06, 4.6, -2.6); clock.rotation.y = Math.PI / 2; scene.add(clock);
  const faceM = cyl(.3, .3, .04, M.oak, 0, 0, 0, clock); faceM.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(.03, .07, .02, M.black, Math.sin(a) * .23, Math.cos(a) * .23, .03, clock).rotation.z = -a; }
  const hourHand = box(.035, .15, .015, M.black, 0, .06, .045, clock);
  const minHand = box(.025, .22, .015, M.black, 0, .09, .05, clock);

  // ── 소품 함수 ─────────────────────────────────────────
  // 버섯 램프(코드리스 테이블 램프): 갓 아래가 빛난다.
  function mushroom(x, y, z, s = 1, cap = '#e0703a', parent = scene) {
    rod([x, y, z], [x, y + .26 * s, z], .012 * s, M.black, parent);
    cyl(.05 * s, .06 * s, .015, M.black, x, y + .008, z, parent, false);
    const c = dome(.1 * s, glow(cap), x, y + .24 * s, z, parent);
    const under = mesh(geo('mu' + s, () => new T.CircleGeometry(.1 * s, 18)), LAMP_GLOW_HOT, x, y + .24 * s, z, parent, false); under.rotation.x = Math.PI / 2;
    return c;
  }
  // 앰버 테이블 램프(도자기 몸통 + 크림 갓)
  function tableLamp(x, y, z, s = 1) {
    const body = cyl(.08 * s, .11 * s, .22 * s, toon('#8a4a28'), x, y + .11 * s, z); outline(body, .1 * s, .01);
    rod([x, y + .22 * s, z], [x, y + .32 * s, z], .01, M.brass);
    cyl(.13 * s, .17 * s, .2 * s, glow('#ffd49a'), x, y + .4 * s, z, scene, false);
  }
  function driedVase(x, y, z, s = 1) {
    const v = cyl(.12 * s, .09 * s, .32 * s, M.ceramic, x, y + .16 * s, z); outline(v, .12 * s, .012);
    sphere(.11 * s, M.ceramic, x, y + .26 * s, z).scale.set(1, .6, 1);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + rnd(), len = (.5 + rnd() * .5) * s, tip = [x + Math.sin(a) * .35 * s, y + .3 * s + len, z + Math.cos(a) * .2 * s];
      rod([x, y + .3 * s, z], tip, .008 * s, M.branch);
      for (let k = 0; k < 4; k++) { const l = sphere(.035 * s, M.dryLeaf, tip[0] + (rnd() - .5) * .14 * s, tip[1] - rnd() * .2 * s, tip[2] + (rnd() - .5) * .1 * s, scene, false); l.scale.set(1, .5, .7); }
    }
  }
  // 브라스 돔 펜던트(안쪽이 빛난다). 카메라를 가리면 흐려진다.
  function pendant(x, z, y = 2.75, s = 1, lit = true) {
    const shadeMat = new T.MeshToonMaterial({color: '#b8873e', gradientMap: grad, side: T.DoubleSide, transparent: true});
    const inMat = new T.MeshBasicMaterial({color: '#ffcf8f', toneMapped: false, transparent: true});
    const cordMat = new T.MeshToonMaterial({color: '#231c18', gradientMap: grad, transparent: true});
    const cord = cyl(.014, .014, 3.9 - y, cordMat, x, (3.9 + y) / 2, z, scene, false);
    const shade = mesh(geo('pd' + s, () => new T.SphereGeometry(.24 * s, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.2)), shadeMat, x, y - .2 * s, z, scene, false);
    const inner = mesh(geo('pi' + s, () => new T.CircleGeometry(.2 * s, 20)), inMat, x, y - .14 * s, z, scene, false); inner.rotation.x = Math.PI / 2;
    for (const o of [cord, shade, inner]) o.userData.ignorePick = true;
    lampShades.push({x, z, mats: [shadeMat, inMat, cordMat], opacity: 1});
    if (lit) { const light = new T.PointLight('#ffb36b', 7, 6, 1.6); light.position.set(x, y - .6, z); scene.add(light); }
  }

  // ── 백월: 양옆 크롬 선반 + 크레덴자 ───────────────────
  const shelfY = [1.35, 1.85, 2.35];
  function chromeShelf(x0, x1, z) {
    for (const x of [x0, x1]) for (const dz of [-.18, .18]) rod([x, 0, z + dz], [x, 2.6, z + dz], .018, M.chrome);
    for (const y of [.1, ...shelfY, 2.6]) box(x1 - x0, .035, .4, y === shelfY[1] ? M.walnut : M.chrome, (x0 + x1) / 2, y, z, scene, false);
    rod([x0, 2.0, z - .2], [x1, 2.55, z - .2], .008, M.chrome); rod([x0, 2.55, z - .2], [x1, 2.0, z - .2], .008, M.chrome);
    box(x1 - x0 - .1, .6, .42, M.walnut, (x0 + x1) / 2, .42, z);
    box(x1 - x0 - .06, .03, .44, M.darkTop, (x0 + x1) / 2, .735, z, scene, false);
  }
  chromeShelf(-7.6, -5.6, -7.2); chromeShelf(5.6, 7.6, -7.2);
  const bottleColors = ['#c98a2e', '#4f6b4b', '#8e3a34', '#7c9fae', '#d8b46a', '#5c3a2a', '#efe8dc'].map(c => new T.Color(c));
  const m4 = new T.Matrix4();
  const nB = 96;
  const bodies = new T.InstancedMesh(new T.CylinderGeometry(.07, .075, 1, 14), toon('#ffffff'), nB);
  const necks = new T.InstancedMesh(new T.CylinderGeometry(.025, .032, 1, 10), toon('#ffffff'), nB);
  let bi = 0;
  const addBottle = (x, y, z, h) => {
    if (bi >= nB) return;
    const col = bottleColors[Math.floor(rnd() * bottleColors.length)];
    m4.makeScale(1, h, 1).setPosition(x, y + h / 2, z); bodies.setMatrixAt(bi, m4); bodies.setColorAt(bi, col);
    m4.makeScale(1, .09, 1).setPosition(x, y + h + .045, z); necks.setMatrixAt(bi, m4); necks.setColorAt(bi, col);
    bi++;
  };
  for (const x0 of [-7.5, 5.7]) for (const y of [shelfY[0], shelfY[2]]) for (let i = 0; i < 9; i++) addBottle(x0 + i * .21, y + .02, -7.2 + (rnd() - .5) * .1, .18 + rnd() * .12);
  for (const [i, x] of [-7.3, -7.2, -7.1, -7.0, -6.9].entries()) box(.08, .28 + i * .02, .22, toon(['#8b4430', '#efe8dc', '#5c6b52', '#2c2724', '#c98a3e'][i]), x, shelfY[1] + .16, -7.2);
  box(.36, .1, .3, M.black, 6.6, shelfY[1] + .07, -7.2); cyl(.13, .13, .01, M.black, 6.6, shelfY[1] + .125, -7.2, scene, false);
  mushroom(-6.2, shelfY[1] + .02, -7.2, 1.1); tableLamp(7.1, .75, -7.2, .9);
  driedVase(-5.9, .75, -7.15, .7);

  // ── 링 바: 트래버틴 몸통 · 어두운 유광 상판 · 가운데 돌기둥 병 선반 ──
  {
    const g = new T.Group(); g.position.set(RING.x, 0, RING.z); scene.add(g);
    const gapA = RING.gap, start = Math.PI + gapA / 2, len = Math.PI * 2 - gapA;
    arcWall(RING.outer, .98, start, len, toon('#ffffff', {map: travertine, side: T.DoubleSide}), 0, .53, 0, g);
    arcWall(RING.inner + .1, .98, start, len, toon('#4a3326', {side: T.DoubleSide}), 0, .53, 0, g);
    // 바닥에서 새어 나오는 앰버 띠
    arcWall(RING.outer - .03, .05, start, len, glow('#ffae5e'), 0, .045, 0, g);
    const floorGlow = arcTop(RING.outer, RING.outer + .55, start, len, glow(AMBER, {transparent: true, opacity: .28, depthWrite: false}), 0, .006, 0, g);
    floorGlow.castShadow = false;
    // 상판
    arcTop(RING.inner, RING.outer + .14, start, len, toon('#2a1e18', {side: T.DoubleSide}), 0, 1.06, 0, g);
    arcWall(RING.outer + .14, .06, start, len, M.brass, 0, 1.03, 0, g);
    for (const s of [-1, 1]) {
      const ang = Math.PI + s * gapA / 2, r = (RING.outer + RING.inner) / 2;
      const cap = box(.12, 1.06, RING.outer - RING.inner + .14, M.walnutDark, Math.sin(ang) * r, .53, Math.cos(ang) * r, g); cap.rotation.y = ang;
    }
    // 황동 발받침
    const railG = new T.Group(); railG.rotation.y = Math.PI / 2 - gapA / 2; g.add(railG);
    const rail = mesh(new T.TorusGeometry(RING.outer + .1, .022, 8, 64, len), M.brass, 0, .26, 0, railG, false); rail.rotation.x = Math.PI / 2;
    // 안쪽 발판
    cyl(RING.inner, RING.inner, HOST_STEP, M.walnutDark, 0, HOST_STEP / 2, 0, g);
    // 가운데 돌기둥 + 병 선반
    const col = cyl(RING.column, RING.column, 3.9, toon('#ffffff', {map: roughStone}), 0, 1.95, 0, g, true, 24); col.userData.ignorePick = false;
    cyl(.55, .55, .04, M.darkTop, 0, 1.18, 0, g, false, 32);
    cyl(.57, .57, .025, M.brass, 0, 1.2, 0, g, false, 32);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; addBottle(RING.x + Math.cos(a) * .44, 1.21, RING.z + Math.sin(a) * .44, .2 + rnd() * .1); }
    const colGlow = arcWall(.56, .06, 0, Math.PI * 2, glow('#ffbe78'), 0, 1.15, 0, g);
    // 카운터 위 버섯 램프와 잔
    for (const d of [-1.65, -.55, .55, 1.65]) { const a = Math.PI / 2 + d, r = RING.inner + .32; mushroom(RING.x + Math.cos(a) * r, 1.07, RING.z + Math.sin(a) * r, 1, '#ef7a3c'); }
    for (const d of [-2.1, -1.26, -.42, .42, 1.26, 2.1]) { const a = Math.PI / 2 + d, r = RING.outer - .12; cyl(.045, .038, .12, M.glass, Math.cos(a) * r, 1.13, Math.sin(a) * r, g, false); }
    for (const [i, c] of ['#c98a3e', '#8e3a34', '#4f6b4b'].entries()) {
      const a = -Math.PI / 2 + gapA / 2 + .3 + i * .2, r = RING.inner + .2;
      cyl(.03, .03, .28, M.brass, Math.cos(a) * r, 1.2, Math.sin(a) * r, g);
      outline(capsule(.032, .1, toon(c), Math.cos(a) * r, 1.42, Math.sin(a) * r, g), .035);
    }
    tag(g, 'table5');
    entities.set('table5', {anchor: new T.Vector3(RING.x - 1.15, 1.7, RING.z + 1.3)});
    entities.set('host', {anchor: new T.Vector3(RING.host.x, 2.25, RING.host.z)});
    const ringLight = new T.PointLight('#ffa860', 6, 7, 1.5); ringLight.position.set(RING.x, 2.3, RING.z + 1.2); scene.add(ringLight);
    // 원형 천장 조명 디스크(레퍼런스): 카메라를 가리면 흐려진다.
    const diskMat = new T.MeshBasicMaterial({color: '#ff9d4f', toneMapped: false, transparent: true, side: T.DoubleSide});
    const rimMat = new T.MeshToonMaterial({color: '#2a1d17', gradientMap: grad, transparent: true});
    const disk = mesh(new T.CircleGeometry(2.3, 48), diskMat, RING.x, 4.75, RING.z, scene, false); disk.rotation.x = Math.PI / 2;
    const rim = mesh(new T.CylinderGeometry(2.42, 2.42, .16, 48, 1, true), rimMat, RING.x, 4.78, RING.z, scene, false);
    for (let i = 0; i < 4; i++) { const b = box(4.6, .03, .05, rimMat, RING.x, 4.73, RING.z, scene, false); b.rotation.y = i * Math.PI / 4; }
    disk.userData.ignorePick = rim.userData.ignorePick = true;
    lampShades.push({x: RING.x, z: RING.z, r: 3.2, mats: [diskMat, rimMat], opacity: 1, upperOnly: true});
    // 돌기둥을 천장 디스크까지
    cyl(RING.column, RING.column, 1.0, toon('#ffffff', {map: roughStone}), RING.x, 4.4, RING.z, scene, true, 24);
    // 러스트 벨벳 바 스툴(외다리 + 발받침)
    for (const s of TABLES[0].seats) {
      const seat = cyl(.23, .21, .1, M.velvet, s.x, .8, s.z); outline(seat, .23); seat.scale.y = 1.2;
      cyl(.045, .05, .76, M.velvetDark, s.x, .4, s.z);
      const fr = mesh(geo('foot', () => new T.TorusGeometry(.15, .013, 6, 20)), M.velvetDark, s.x, .3, s.z, scene, false); fr.rotation.x = Math.PI / 2;
      cyl(.18, .2, .03, M.velvetDark, s.x, .015, s.z);
    }
  }

  // ── 의자 ──────────────────────────────────────────────
  // 의자 그룹의 +z가 앉은 사람이 바라보는 방향(=테이블 쪽), 등받이는 -z.
  function chair(seat, kind) {
    const g = new T.Group(); g.position.set(seat.x, 0, seat.z); g.rotation.y = seat.heading; scene.add(g);
    if (kind === 'tub') { // 트위드 쉘 체어
      outline(mesh(geo('tubSeat', () => new T.CylinderGeometry(.26, .24, .12, 22)), M.tweed, 0, .55, 0, g), .26);
      const shell = mesh(geo('tubShell', () => new T.CylinderGeometry(.28, .26, .38, 22, 1, true, Math.PI * .45, Math.PI * 1.1)), toon('#9b8b7d', {side: T.DoubleSide}), 0, .78, -.02, g);
      outline(shell, .28, .015);
      for (const [lx, lz] of [[-.17, .15], [.17, .15], [-.17, -.15], [.17, -.15]]) rod([lx * .8, .5, lz * .8], [lx * 1.15, 0, lz * 1.15], .014, M.black, g);
    } else { // 패브릭 다이닝 체어
      outline(box(.44, .08, .42, M.tweed, 0, .55, 0, g), .22, .015);
      const back = box(.42, .3, .07, M.tweed, 0, .82, -.22, g); back.rotation.x = -.12; outline(back, .2, .015);
      for (const [lx, lz] of [[-.18, .16], [.18, .16], [-.18, -.17], [.18, -.17]]) rod([lx, .51, lz], [lx * 1.12, 0, lz * 1.12], .013, M.black, g);
    }
    return g;
  }

  // ── 원형 테이블: 어두운 유광 상판 + 브라스 테이블 램프 ──
  function roundTable(t) {
    const g = new T.Group(); g.position.set(t.x, 0, t.z); scene.add(g);
    const rug = mesh(geo('rugR', () => new T.CircleGeometry(1.75, 48)), M.rug2, 0, .012, 0, g, false); rug.rotation.x = -Math.PI / 2;
    outline(cyl(.82, .82, .05, M.darkTop, 0, .8, 0, g, true, 36), .82, .02);
    cyl(.83, .83, .02, M.brass, 0, .775, 0, g, false, 36);
    cyl(.07, .07, .74, M.black, 0, .4, 0, g); cyl(.36, .4, .04, M.black, 0, .02, 0, g);
    // 코드리스 브라스 램프
    rod([.1, .83, -.1], [.1, 1.12, -.1], .012, M.brass, g);
    cyl(.07, .08, .02, M.brass, .1, .835, -.1, g, false);
    dome(.11, M.brass, .1, 1.1, -.1, g);
    const under = mesh(geo('ru', () => new T.CircleGeometry(.1, 18)), LAMP_GLOW_HOT, .1, 1.1, -.1, g, false); under.rotation.x = Math.PI / 2;
    cyl(.05, .04, .11, M.glass, -.25, .885, .15, g, false); cyl(.05, .04, .11, M.glass, -.05, .885, .3, g, false);
    tag(g, t.id);
    t.seats.forEach(s => tag(chair(s, 'tub'), t.id));
    const l = new T.PointLight('#ffb36b', 6, 5, 1.6); l.position.set(t.x + .1, 1.5, t.z); scene.add(l);
  }

  // ── 벨벳 부스: 테이블 뒤를 감싸는 반원 소파 ────────────
  function boothTable(t) {
    const g = new T.Group(); g.position.set(t.x, 0, t.z); scene.add(g);
    // 부스 호: 각도 -170°~-10° (수학 기준, z가 음수인 뒤쪽). cylinder 각도로 바꾸면 θ = π/2 - a.
    const a0 = -170 * Math.PI / 180, a1 = -10 * Math.PI / 180;
    const start = Math.PI / 2 - a1, len = a1 - a0;
    arcWall(1.32, .32, start, len, M.velvet, 0, .16, 0, g);
    arcWall(.9, .32, start, len, M.velvetDark, 0, .16, 0, g);
    arcTop(.9, 1.32, start, len, toon('#8e9a70', {side: T.DoubleSide}), 0, .33, 0, g);
    const back = arcWall(1.55, .72, start, len, toon('#7f8a63', {side: T.DoubleSide}), 0, .62, 0, g); outline(back, 1.55, .02);
    arcWall(1.38, .5, start, len, toon('#6f7a56', {side: T.DoubleSide}), 0, .62, 0, g);
    arcTop(1.38, 1.55, start, len, toon('#8e9a70', {side: T.DoubleSide}), 0, .98, 0, g);
    // 테이블
    outline(cyl(.62, .62, .05, M.darkTop, 0, .72, 0, g, true, 32), .62, .02);
    cyl(.63, .63, .02, M.brass, 0, .695, 0, g, false, 32);
    cyl(.18, .26, .68, M.walnutDark, 0, .35, 0, g);
    mushroom(0, .745, -.25, 1, '#f0a34a', g);
    cyl(.05, .04, .11, M.glass, .2, .8, .1, g, false); cyl(.05, .04, .11, M.glass, -.2, .8, .15, g, false);
    // 화분(야자수 느낌)
    cyl(.24, .2, .4, M.ceramic, 1.7, .2, -.9, g);
    for (let i = 0; i < 7; i++) { const a = i * .9; const leaf = sphere(.32, M.olive, 1.7 + Math.cos(a) * .3, .9 + (i % 3) * .2, -.9 + Math.sin(a) * .3, g); leaf.scale.set(1.2, .22, .45); leaf.rotation.set(.2, a, .5); }
    tag(g, t.id);
    const l = new T.PointLight('#ffa860', 6, 5, 1.6); l.position.set(t.x, 1.6, t.z + .2); scene.add(l);
  }

  // ── 긴 테이블(6인) ────────────────────────────────────
  function longTable(t) {
    const g = new T.Group(); g.position.set(t.x, 0, t.z); scene.add(g);
    outline(box(2.7, .07, 1.0, M.walnut, 0, .76, 0, g), .5, .015);
    for (const [lx, lz] of [[-1.2, -.4], [1.2, -.4], [-1.2, .4], [1.2, .4]]) box(.09, .72, .09, M.walnutDark, lx, .36, lz, g);
    const v = cyl(.1, .08, .26, M.ceramic, -.4, .92, 0, g); outline(v, .1, .01);
    for (let i = 0; i < 5; i++) { const tip = [-.4 + (rnd() - .5) * .5, 1.3 + rnd() * .3, (rnd() - .5) * .25]; rod([-.4, 1.02, 0], tip, .006, M.branch, g); const f = sphere(.05, M.dryLeaf, tip[0], tip[1], tip[2], g, false); f.scale.set(1, .6, 1); }
    mushroom(.5, .795, 0, .9, '#ef7a3c', g);
    tag(g, t.id);
    t.seats.forEach(s => tag(chair(s, s.kind), t.id));
    pendant(t.x - .7, t.z, 2.7, .9, true); pendant(t.x + .7, t.z, 2.7, .9, false);
  }

  // ── 마주 보는 하이 바 테이블(6인): 긴 상판 양쪽 스툴 ──
  function barTable(t) {
    const g = new T.Group(); g.position.set(t.x, 0, t.z); scene.add(g);
    const rug = mesh(new T.PlaneGeometry(3.9, 2.5), M.rug2, 0, .012, 0, g, false); rug.rotation.x = -Math.PI / 2;
    outline(box(3.2, .08, .86, M.walnut, 0, 1.04, 0, g), .5, .015);
    box(3.22, .03, .88, M.brass, 0, 1.0, 0, g, false);
    for (const lx of [-1.15, 1.15]) { box(.14, 1.0, .5, M.walnutDark, lx, .5, 0, g); box(.5, .04, .6, M.black, lx, .02, 0, g); }
    rod([-1.3, .32, .3], [1.3, .32, .3], .02, M.brass, g); rod([-1.3, .32, -.3], [1.3, .32, -.3], .02, M.brass, g);
    for (const dx of [-.9, .2, 1.0]) cyl(.05, .04, .12, M.glass, dx, 1.14, (rnd() - .5) * .3, g, false);
    mushroom(-.25, 1.08, 0, .9, '#f0a34a', g);
    tag(g, t.id);
    for (const s of t.seats) {
      const sg = new T.Group(); scene.add(sg);
      const seat = cyl(.22, .2, .1, M.velvet, s.x, .8, s.z, sg); outline(seat, .22); seat.scale.y = 1.2;
      cyl(.045, .05, .76, M.velvetDark, s.x, .4, s.z, sg);
      const fr = mesh(geo('foot', () => new T.TorusGeometry(.15, .013, 6, 20)), M.velvetDark, s.x, .3, s.z, sg, false); fr.rotation.x = Math.PI / 2;
      cyl(.18, .2, .03, M.velvetDark, s.x, .015, s.z, sg);
      tag(sg, t.id);
    }
    pendant(t.x - .8, t.z, 2.9, .9, true); pendant(t.x + .8, t.z, 2.9, .9, false);
  }

  // ── 소파 거실존: 브라운 벨벳 소파 · 캐러멜 가죽 라운지 체어 · 돔 플로어 램프 ──
  function loungeChair(seat, parent) {
    const lc = new T.Group(); lc.position.set(seat.x, 0, seat.z); lc.rotation.y = seat.heading; parent.add(lc);
    outline(box(.6, .14, .56, M.leather, 0, .36, .02, lc), .28, .015);
    const lback = box(.58, .64, .14, M.leather, 0, .68, -.3, lc); lback.rotation.x = -.35; outline(lback, .28, .015);
    capsule(.07, .42, M.leatherDark, 0, 1.0, -.38, lc).rotation.z = Math.PI / 2;
    // X자 다리(미드센추리 라운지 체어)
    for (const sx of [-.24, .24]) { rod([sx, .3, .05], [sx + .1, 0, .42], .02, M.walnutDark, lc); rod([sx, .3, -.05], [sx - .05, 0, -.45], .02, M.walnutDark, lc); }
    return lc;
  }
  function sofaLounge(t) {
    const g = new T.Group(); scene.add(g);
    const rug = mesh(geo('rugS', () => new T.CircleGeometry(1.95, 48)), M.rug, SOFA.coffee.x + .2, .012, SOFA.coffee.z, g, false); rug.rotation.x = -Math.PI / 2;
    outline(box(1.0, .26, 2.6, M.brownVelvet, SOFA.x + .05, .17, SOFA.z, g), .5, .02);
    for (const z of [1.1, 1.85, 2.6]) outline(box(.82, .16, .72, toon('#a87b55'), SOFA.x - .02, .38, z, g), .36, .015);
    const back = capsule(.2, 2.25, M.brownVelvet, SOFA.x + .42, .62, SOFA.z, g); back.rotation.x = Math.PI / 2; outline(back, .2);
    for (const z of [.55, 3.15]) outline(capsule(.15, .5, M.brownVelvet, SOFA.x + .1, .42, z, g), .15).rotation.z = Math.PI / 2;
    outline(box(.1, .34, .34, toon('#7f8a63'), SOFA.x + .25, .64, 2.85, g), .17).rotation.y = -.2;
    outline(box(.1, .32, .32, toon('#d8c3a4'), SOFA.x + .25, .62, 1.0, g), .16).rotation.y = .2;
    // 페데스탈 커피 테이블 2단(레퍼런스 2)
    outline(cyl(.52, .52, .04, M.darkTop, SOFA.coffee.x, .44, SOFA.coffee.z, g, true, 32), .52, .015);
    cyl(.2, .26, .42, M.walnut, SOFA.coffee.x, .21, SOFA.coffee.z, g);
    cyl(.36, .36, .03, M.darkTop, SOFA.coffee.x + .55, .6, SOFA.coffee.z - .7, g, false, 28); cyl(.04, .04, .6, M.walnutDark, SOFA.coffee.x + .55, .3, SOFA.coffee.z - .7, g);
    for (const [dx, dz] of [[-.15, .1], [.12, -.08]]) cyl(.04, .035, .09, M.glass, SOFA.coffee.x + dx, .51, SOFA.coffee.z + dz, g, false);
    const [, , , l1, l2] = t.seats;
    tag(loungeChair(l1, scene), t.id); tag(loungeChair(l2, scene), t.id);
    // 큰 돔 플로어 램프(주름 갓)
    const fx = SOFA.x + .45, fz = .45; // 소파 뒤 모서리: 앉은 시야를 가리지 않게
    cyl(.16, .18, .03, M.brass, fx, .015, fz, g); rod([fx, 0, fz], [fx, 1.75, fz], .015, M.brass, g);
    const domeMat = glow('#ffe1b8', {transparent: true}), ribMat = new T.MeshToonMaterial({color: '#f0d7b0', gradientMap: grad, transparent: true});
    const shade = dome(.48, domeMat, fx, 1.7, fz, g); shade.scale.y = .75; shade.userData.ignorePick = true;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; rod([fx + Math.cos(a) * .47, 1.71, fz + Math.sin(a) * .47], [fx + Math.cos(a) * .12, 2.05, fz + Math.sin(a) * .12], .006, ribMat, g); }
    lampShades.push({x: fx, z: fz, mats: [domeMat, ribMat], opacity: 1});
    const fl = new T.PointLight('#ffbf80', 8, 6, 1.5); fl.position.set(fx - .3, 1.4, fz - .3); scene.add(fl);
    tag(g, t.id);
  }

  for (const t of TABLES) {
    if (t.type === 'round') roundTable(t);
    else if (t.type === 'booth') boothTable(t);
    else if (t.type === 'long') longTable(t);
    else if (t.type === 'sofa') sofaLounge(t);
    else if (t.type === 'after') afterTable(t);
    else if (t.type === 'bar') barTable(t);
    const ly = t.level === 2 ? MEZZ_Y : 0;
    if (t.type !== 'ring') entities.set(t.id, {anchor: new T.Vector3(t.x, (t.type === 'sofa' ? 1.35 : t.type === 'after' ? 1.55 : 1.75) + ly, t.z)});
    const fTex = canvasTex(128, 128, (c, w, h, font = 'sans-serif') => {
      c.fillStyle = '#f7ead6'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill();
      c.strokeStyle = '#2e1f17'; c.lineWidth = 6; c.stroke();
      c.fillStyle = '#2e1f17'; c.font = `74px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(t.number), 64, 70);
    }); drawables.push(fTex);
    const fy = ly + (t.type === 'ring' ? 1.42 : t.type === 'sofa' ? .8 : t.type === 'long' ? 1.08 : t.type === 'booth' ? 1.0 : t.type === 'after' ? .9 : t.type === 'bar' ? 1.36 : 1.12);
    const fx = t.type === 'ring' ? t.x - .95 : t.x - .3, fz = t.type === 'ring' ? t.z + .85 : t.z + .25;
    rod([fx, fy - .3, fz], [fx, fy - .1, fz], .01, M.black);
    const flag = mesh(new T.CircleGeometry(.12, 24), basic('#ffffff', {map: fTex, side: T.DoubleSide}), fx, fy, fz, scene, false);
    flag.userData.ignorePick = true; flagTexes.push(flag);
  }

  // ── 복층(메자닌) ─────────────────────────────────────
  {
    const depth = MEZZ.front + 7.5, cz = (MEZZ.front - 7.5) / 2;
    const slab = box(16.8, .24, depth, M.walnutDark, .1, MEZZ_Y - .12, cz); slab.userData.level = 2;
    const top = mesh(new T.PlaneGeometry(16.8, depth), toon('#ffffff', {map: rep(floorTex, 4, .6)}), .1, MEZZ_Y + .005, cz, scene, false);
    top.rotation.x = -Math.PI / 2; top.userData.level = 2;
    box(16.8, .1, .05, glow('#ffb066'), .1, MEZZ_Y - .27, MEZZ.front + .02, scene, false); // 아래쪽 LED 띠
    // 난간: 황동 손잡이 + 유리
    const railStart = STAIRS.x + STAIRS.width / 2 + .05;
    const railLen = 8.45 - railStart, rx = (railStart + 8.45) / 2;
    box(railLen, .05, .06, M.brass, rx, MEZZ_Y + 1.0, MEZZ.front + .05, scene, false);
    mesh(new T.PlaneGeometry(railLen, .9), toon('#f1e2c8', {transparent: true, opacity: .14, side: T.DoubleSide}), rx, MEZZ_Y + .52, MEZZ.front + .05, scene, false).userData.ignorePick = true;
    for (let x = railStart; x <= 8.45; x += 1.2) cyl(.018, .018, 1.0, M.black, x, MEZZ_Y + .5, MEZZ.front + .05, scene, false);
    // 2층 뒤 벽: 큰 창(강변 야경) + 구리 아트 패널 + 선반
    const nightTex = canvasTex(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d2547'); g.addColorStop(.55, '#4b4475'); g.addColorStop(.7, '#c98a6a'); g.addColorStop(.72, '#1a1f33'); g.addColorStop(1, '#0f1424');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w;) { const bw = 30 + rnd() * 50, bh = 60 + rnd() * 150; c.fillStyle = '#151a30'; c.fillRect(x, h * .7 - bh, bw, bh);
        for (let yy = h * .7 - bh + 8; yy < h * .7 - 6; yy += 12) for (let xx = x + 5; xx < x + bw - 6; xx += 10) if (rnd() > .5) { c.fillStyle = rnd() > .3 ? '#ffd98f' : '#9fd2ff'; c.fillRect(xx, yy, 4, 6); }
        x += bw + 3; }
      for (let i = 0; i < 180; i++) { c.fillStyle = rnd() > .5 ? '#ffd98f88' : '#ffb06655'; c.fillRect(rnd() * w, h * .72 + rnd() * h * .28, 2 + rnd() * 26, 2); }
      c.fillStyle = '#0b0d14'; for (let i = 0; i < 4; i++) c.fillRect(i * w / 4, 0, 6, h);
    });
    mesh(new T.PlaneGeometry(7.2, 3.0), glow('#ffffff', {map: nightTex}), -4.8, MEZZ_Y + 1.85, -7.43, scene, false);
    for (const x of [-8.4, -6.0, -3.6, -1.2]) box(.08, 3.1, .08, M.black, x, MEZZ_Y + 1.85, -7.38, scene, false);
    box(7.3, .08, .08, M.black, -4.8, MEZZ_Y + .33, -7.38, scene, false); box(7.3, .08, .08, M.black, -4.8, MEZZ_Y + 3.38, -7.38, scene, false);
    const copperTex = canvasTex(256, 512, (c, w, h) => {
      const cols = ['#8c4a2a', '#2b211c', '#a8613a', '#3a2c22', '#6b3a22', '#2b211c'];
      for (let i = 0; i < 6; i++) { c.fillStyle = cols[i]; c.fillRect((i % 2) * w / 2, Math.floor(i / 2) * h / 3, w / 2, h / 3); }
      for (let i = 0; i < 900; i++) { c.fillStyle = rnd() > .5 ? '#d08a5a33' : '#00000033'; c.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 12, 2 + rnd() * 6); }
    });
    mesh(new T.PlaneGeometry(1.8, 3.2), toon('#ffffff', {map: copperTex}), 2.6, MEZZ_Y + 1.95, -7.42, scene, false);
    box(2.0, .04, .1, glow('#ffb066'), 2.6, MEZZ_Y + .3, -7.38, scene, false);
    // 2층 오른쪽: 조명 선반 + 병
    for (const y of [MEZZ_Y + .9, MEZZ_Y + 1.5, MEZZ_Y + 2.1]) { box(3.4, .05, .32, M.walnut, 6.4, y, -7.28, scene, false); box(3.3, .025, .03, glow('#ffd19a'), 6.4, y - .04, -7.13, scene, false);
      for (let i = 0; i < 12; i++) addBottle(4.85 + i * .27, y + .025, -7.28, .16 + rnd() * .12); }
    // 2층 화분
    for (const x of [-1.7, 3.0]) { outline(cyl(.22, .18, .36, M.ceramic, x, MEZZ_Y + .18, -6.9), .22, .012); for (let i = 0; i < 6; i++) { const l = sphere(.22, M.olive, x + (rnd() - .5) * .4, MEZZ_Y + .65 + rnd() * .35, -6.9 + (rnd() - .5) * .3); l.scale.set(1, .6, 1); } }
    const mezzLight = new T.PointLight('#ffb36b', 6, 9, 1.4); mezzLight.position.set(0, MEZZ_Y + 2.3, -6.0); scene.add(mezzLight);
    // 계단(왼쪽 벽을 따라)
    const steps = 12, rise = MEZZ_Y / steps, run = (STAIRS.bottomZ - STAIRS.topZ) / steps;
    for (let i = 0; i < steps; i++) {
      const st = box(STAIRS.width, .08, run + .02, M.walnut, STAIRS.x, rise * (i + 1) - .04, STAIRS.bottomZ - run * (i + .5));
      st.userData.entity = 'stairs';
      box(STAIRS.width, rise, .03, M.walnutDark, STAIRS.x, rise * (i + .5), STAIRS.bottomZ - run * i, scene, false).userData.entity = 'stairs';
    }
    const stringerLen = Math.hypot(MEZZ_Y, STAIRS.bottomZ - STAIRS.topZ);
    const sg = box(.06, .3, stringerLen, M.black, STAIRS.x + STAIRS.width / 2 + .03, MEZZ_Y / 2, (STAIRS.bottomZ + STAIRS.topZ) / 2);
    sg.rotation.x = Math.atan2(MEZZ_Y, STAIRS.bottomZ - STAIRS.topZ);
    const hr = box(.04, .04, stringerLen, M.brass, STAIRS.x + STAIRS.width / 2 + .03, MEZZ_Y / 2 + .95, (STAIRS.bottomZ + STAIRS.topZ) / 2, scene, false);
    hr.rotation.x = sg.rotation.x;
    for (let i = 0; i <= 4; i++) { const k = i / 4; cyl(.015, .015, .95, M.black, STAIRS.x + STAIRS.width / 2 + .03, MEZZ_Y * k + .47, STAIRS.bottomZ - (STAIRS.bottomZ - STAIRS.topZ) * k, scene, false); }
    entities.set('stairs', {anchor: new T.Vector3(STAIRS.ground.x, 1.5, STAIRS.ground.z)});
    entities.set('stairsDown', {anchor: new T.Vector3(STAIRS.upper.x, MEZZ_Y + 1.5, STAIRS.upper.z)});
  }

  // ── AFTER DRINK 2인 테이블(2층) ─────────────────────
  function afterTable(t) {
    const g = new T.Group(); g.position.set(t.x, MEZZ_Y, t.z); scene.add(g);
    const rug = mesh(geo('rugA', () => new T.CircleGeometry(1.0, 40)), M.rug2, 0, .012, 0, g, false); rug.rotation.x = -Math.PI / 2;
    outline(cyl(.32, .32, .04, M.darkTop, 0, .56, 0, g, true, 28), .32, .015); cyl(.1, .16, .54, M.brass, 0, .27, 0, g);
    mushroom(0, .58, -.12, .8, '#f0a34a', g);
    t.seats.forEach((s, i) => {
      const c = new T.Group(); c.position.set(s.x, MEZZ_Y, s.z); c.rotation.y = s.heading; scene.add(c);
      const m = i ? M.leather : M.greenVelvet;
      outline(box(.6, .16, .55, m, 0, .32, 0, c), .3, .015);
      const b = box(.6, .5, .14, m, 0, .62, -.27, c); b.rotation.x = -.18; outline(b, .3, .015);
      for (const sx of [-.32, .32]) outline(box(.1, .26, .52, m, sx, .44, 0, c), .13, .012);
      tag(c, t.id);
    });
    tag(g, t.id);
  }

  // ── Welcome Zone(입구 바닥 표시) ─────────────────────
  {
    const wzTex = canvasTex(512, 512, (c, w, h, font = 'sans-serif') => {
      c.strokeStyle = '#ffb066'; c.lineWidth = 10; c.setLineDash([26, 16]); c.beginPath(); c.arc(256, 256, 236, 0, 7); c.stroke();
      c.setLineDash([]); c.fillStyle = '#ffd9a8'; c.font = `46px ${font}`; c.textAlign = 'center'; c.fillText('WELCOME ZONE', 256, 60 + 40);
    }); drawables.push(wzTex);
    const wz = mesh(new T.PlaneGeometry(WELCOME_ZONE.r * 2, WELCOME_ZONE.r * 2), basic('#ffffff', {map: wzTex, transparent: true, depthWrite: false, toneMapped: false}), WELCOME_ZONE.x, .016, WELCOME_ZONE.z, scene, false);
    wz.rotation.x = -Math.PI / 2; wz.userData.ignorePick = true;
  }

  // 모서리: 뒤쪽 마른 가지 큰 화병, 앞쪽 올리브 나무
  driedVase(-7.9, 0, -6.4, 1.3); driedVase(7.9, 0, -6.4, 1.3);
  function olive(x, z) {
    outline(cyl(.3, .24, .45, M.ceramic, x, .225, z), .3, .015);
    rod([x, .4, z], [x + .05, 1.5, z], .03, M.branch);
    for (let i = 0; i < 9; i++) { const l = sphere(.22, M.olive, x + (rnd() - .5) * .6, 1.4 + rnd() * .5, z + (rnd() - .5) * .5); l.scale.set(1, .7, 1); }
  }
  olive(-8.0, 10.4); olive(8.0, 10.4);
  for (const z of [-5, -1.5, 4.8, 8.6]) { const v = cyl(.1, .08, .26, M.ceramic, 9.12, 1.2, z); outline(v, .1, .01); }

  bodies.count = necks.count = bi;
  for (const im of [bodies, necks]) { im.castShadow = false; im.userData.ignorePick = true; scene.add(im); }

  // 입구 매트
  const matM = mesh(new T.PlaneGeometry(2.4, 1.2), toon('#ffffff', {map: matTex}), ENTRY.x, .014, ENTRY.z + .15, scene, false); matM.rotation.x = -Math.PI / 2;
  entities.set('exit', {anchor: new T.Vector3(ENTRY.x, .9, DOOR_Z + .25)});
  // 문턱: 맨 앞 바닥에 빛나는 'OUT · 골목으로' 띠 + 작은 랜턴 두 개. 넘어가면 골목으로 나간다.
  {
    const outTex = canvasTex(512, 96, (c, w, h, font = 'sans-serif') => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffb06600'); gr.addColorStop(.5, '#ffb066cc'); gr.addColorStop(1, '#ffb06600');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff3df'; c.font = `44px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OUT · 골목으로 →', w / 2, h / 2 + 3);
    }); drawables.push(outTex);
    const strip = mesh(new T.PlaneGeometry(2.8, .52), basic('#ffffff', {map: outTex, transparent: true, depthWrite: false, toneMapped: false}), 0, .02, DOOR_Z + .2, scene, false);
    strip.rotation.x = -Math.PI / 2; strip.userData.ignorePick = true;
    for (const x of [-1.55, 1.55]) { cyl(.05, .06, 1.0, M.walnutDark, x, .5, DOOR_Z + .25); const lt = sphere(.13, LAMP_GLOW_HOT, x, 1.08, DOOR_Z + .25); lt.castShadow = false; }
    const doorLight = new T.PointLight('#ffbf80', 4, 4, 1.6); doorLight.position.set(0, 1.4, DOOR_Z); scene.add(doorLight);
  }

  // ── 조명: 낮은 전체광 + 따뜻한 빛 웅덩이 ─────────────
  scene.add(new T.HemisphereLight('#fff0dc', '#5a4636', 1.3));
  const sun = new T.DirectionalLight('#ffe4c2', 1.05);
  sun.position.set(5, 13, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -13, right: 13, top: 14, bottom: -14, near: .5, far: 45});
  sun.shadow.bias = -.0015; sun.shadow.normalBias = .05; scene.add(sun);
  const frontFill = new T.PointLight('#ffe0b8', 6, 10, 1.4); frontFill.position.set(0, 2.6, 3.8); scene.add(frontFill);
  const frontFill2 = new T.PointLight('#ffcf9a', 4, 9, 1.4); frontFill2.position.set(0, 2.6, 8.2); scene.add(frontFill2);
  const seatAngles = null;

  // ── 말풍선 텍스처 ─────────────────────────────────────
  function bubbleTex(text, bg, fg = '#3b2a22') {
    return canvasTex(160, 128, (c, w, h, font = 'sans-serif') => {
      c.fillStyle = bg; c.strokeStyle = OUTLINE_COLOR; c.lineWidth = 6;
      c.beginPath(); c.roundRect(8, 8, w - 16, 84, 34); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(w / 2 - 14, 89); c.lineTo(w / 2, 116); c.lineTo(w / 2 + 14, 89); c.fill(); c.stroke();
      c.fillStyle = bg; c.fillRect(w / 2 - 12, 82, 24, 10);
      c.font = `52px ${font}`; const tw = c.measureText(text).width; const fs = Math.min(52, 52 * (w - 40) / Math.max(tw, 1));
      c.fillStyle = fg; c.font = `${fs}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, 54);
    });
  }
  const restTex = bubbleTex('Zz', '#d9cff7'); drawables.push(restTex);
  const hostTex = bubbleTex('HOST', '#ffd36b'); drawables.push(hostTex);
  const emoteTextures = [['♪', '#fff3c4'], ['ㅋㅋ', '#ffffff'], ['!', '#ffd7d7'], ['?', '#d8f0ff'], ['♥', '#ffdbe8'], ['…', '#ffffff'], ['오!', '#e2f6d5']]
    .map(([t, bg]) => { const tex = bubbleTex(t, bg); drawables.push(tex); return tex; });

  // ── 2등신 동물 캐릭터 ─────────────────────────────────
  const DARK = toon('#2b2228'), WHITE = basic('#ffffff'), PINK = toon('#ff9fb0');
  const BLUSH = new T.MeshBasicMaterial({color: '#ff8fa3', transparent: true, opacity: .55});
  const lighter = c => '#' + new T.Color(c).lerp(new T.Color('#fff8ee'), .55).getHexString();
  const darker = c => '#' + new T.Color(c).lerp(new T.Color('#3b2a22'), .35).getHexString();

  // 종(species): 기본 동물 + 오리지널 인외(용·로봇·유령·외계인·개구리·펭귄). extra: 머리·등 장식.
  function critter({species = 'bear', fur = '#c08a5c', outfit = '#8ac26b', accent = '#f4b942', host = false, extra = 'none'}) {
    const rig = new T.Group();
    const noEars = ['robot', 'ghost', 'alien', 'frog', 'penguin', 'dokkaebi'].includes(species);
    const furM = toon(fur), fur2 = toon(species === 'panda' ? '#ffffff' : lighter(fur)), clothes = species === 'ghost' ? toon(fur) : toon(outfit);
    const parts = {legs: [], arms: [], eyes: []};
    // 몸
    const body = sphere(.22, clothes, 0, .5, 0, rig); body.scale.set(1, 1.08, .92); outline(body, .22);
    const belly = sphere(.12, species === 'ghost' ? fur2 : toon(lighter(outfit)), 0, .46, .15, rig, false); belly.scale.set(1, 1, .4);
    const collar = mesh(geo('collar', () => new T.TorusGeometry(.13, .04, 8, 20)), toon(accent), 0, .7, 0, rig); collar.rotation.x = Math.PI / 2;
    if (host) {
      const vest = sphere(.225, toon('#3b3646'), 0, .5, -.01, rig); vest.scale.set(1.02, 1.0, .9);
      sphere(.1, toon('#ffffff'), 0, .55, .17, rig, false).scale.set(.9, 1.4, .3);
      for (const s of [-1, 1]) { const b = cone(.05, .1, toon('#e65f5c'), s * .05, .68, .19, rig, 8); b.rotation.z = s * Math.PI / 2; }
    }
    // 다리
    for (const s of [-1, 1]) {
      const leg = new T.Group(); leg.position.set(s * .1, .3, 0); rig.add(leg);
      if (species !== 'ghost') {
        outline(cyl(.07, .075, .18, species === 'panda' ? DARK : furM, 0, -.08, 0, leg), .07);
        const foot = sphere(.09, species === 'panda' ? DARK : species === 'penguin' || species === 'frog' ? toon('#f39a3c') : fur2, 0, -.2, .03, leg); foot.scale.set(species === 'frog' ? 1.3 : .95, .6, 1.25); outline(foot, .09);
      }
      parts.legs.push(leg);
      const arm = new T.Group(); arm.position.set(s * .2, .62, 0); rig.add(arm);
      const sleeve = cyl(.06, .065, .16, clothes, 0, -.07, 0, arm); sleeve.rotation.z = s * .25; outline(sleeve, .06);
      const hand = sphere(.065, species === 'panda' ? DARK : furM, s * .04, -.17, 0, arm); outline(hand, .065);
      parts.arms.push(arm); (parts.fists ??= []).push(hand); if (s > 0) parts.fist = hand;
    }
    // 머리
    const head = new T.Group(); head.position.y = 1.0; rig.add(head);
    const skull = sphere(.37, furM, 0, 0, 0, head); skull.scale.set(1.06, .94, .96); outline(skull, .37, .026);
    if (species === 'penguin') { const face = sphere(.27, toon('#fbf6ee'), 0, -.05, .14, head); face.scale.set(1.05, .9, .8); const beak = cone(.07, .16, toon('#f39a3c'), 0, -.08, .42, head, 8); beak.rotation.x = Math.PI / 2; }
    else if (species === 'robot') { box(.36, .18, .08, toon('#2b2f36'), 0, -.12, .33, head); for (let i = 0; i < 3; i++) box(.24, .02, .02, glow('#7ff3ff'), 0, -.16 + i * .04, .375, head); for (const s of [-1, 1]) { const bolt = cyl(.07, .07, .08, toon('#9aa4ad'), s * .38, -.02, 0, head); bolt.rotation.z = Math.PI / 2; } }
    else if (species === 'frog' || species === 'alien' || species === 'ghost') { const mouth = mesh(geo('smile', () => new T.TorusGeometry(.07, .014, 6, 16, Math.PI)), DARK, 0, -.1, .34, head); mouth.rotation.z = Math.PI; }
    else { const muzzle = sphere(.15, fur2, 0, -.11, .29, head); muzzle.scale.set(1.25, .78, .7); outline(muzzle, .15, .014);
      sphere(.042, DARK, 0, -.06, .4, head); }
    for (const s of [-1, 1]) {
      if (species === 'panda') { const patch = sphere(.085, DARK, s * .14, .02, .3, head); patch.scale.set(1, 1.25, .5); patch.rotation.z = s * -.4; }
      if (species === 'frog') { const bump = sphere(.12, furM, s * .16, .28, .12, head); outline(bump, .12, .014); sphere(.075, WHITE, s * .16, .3, .2, head, false); }
      const ey = species === 'frog' ? .3 : .03, ez = species === 'frog' ? .27 : .335;
      const eye = sphere(.052, species === 'robot' ? glow('#7ff3ff') : DARK, s * (species === 'frog' ? .16 : .14), ey, ez, head); eye.scale.set(species === 'alien' ? 1.7 : 1, species === 'alien' ? 2.1 : 1.3, .5); if (species === 'alien') eye.rotation.z = s * .5; parts.eyes.push(eye);
      const hl = sphere(.017, WHITE, s * (species === 'frog' ? .16 : .14) + .016, ey + .04, ez + .025, head, false); hl.castShadow = false; (parts.hls ??= []).push(hl);
      const blush = sphere(.06, BLUSH, s * .24, -.09, .27, head, false); blush.scale.set(1, .55, .3);
      if (species === 'hamster') { const ch = sphere(.12, fur2, s * .22, -.12, .16, head); outline(ch, .12, .014); }
      if (species === 'raccoon') { const m = sphere(.1, DARK, s * .14, .03, .3, head); m.scale.set(1.3, .8, .4); }
      if (species === 'tiger') { const st = box(.03, .1, .02, DARK, s * .2, .2, .3, head); st.rotation.z = s * .5; }
    }
    // 귀
    for (const s of [-1, 1]) {
      if (noEars) {
        if (species === 'alien') { rod([s * .1, .3, 0], [s * .22, .62, -.02], .015, furM, head); sphere(.05, glow('#d7ff7a'), s * .22, .64, -.02, head); }
        if (species === 'robot' && s > 0) { cyl(.015, .015, .26, toon('#9aa4ad'), 0, .46, 0, head); sphere(.05, glow('#ff6b6b'), 0, .6, 0, head); }
      } else if (species === 'dragon') {
        const horn = cone(.06, .26, toon('#f4ead2'), s * .17, .38, -.04, head, 8); horn.rotation.set(-.35, 0, s * -.35); outline(horn, .06, .01);
        const fin = cone(.08, .16, toon(darker(fur)), s * .33, .1, -.02, head, 4); fin.rotation.z = s * -1.2;
      } else if (species === 'koala' || species === 'mouse') {
        const r = species === 'koala' ? .16 : .15;
        const ear = sphere(r, furM, s * .3, .24, -.04, head); ear.scale.z = .55; outline(ear, r, .014);
        sphere(r * .6, species === 'koala' ? fur2 : PINK, s * .3, .24, .02, head, false).scale.z = .3;
      } else if (species === 'sheep') {
        const ear = sphere(.1, toon(darker(fur)), s * .36, .02, -.02, head); ear.scale.set(1.3, .5, .5); ear.rotation.z = s * -.3; outline(ear, .1);
      } else if (species === 'cat' || species === 'fox' || species === 'tiger') {
        const big = species === 'fox' ? 1.25 : 1;
        const ear = cone(.12 * big, .22 * big, furM, s * .22, .3, -.02, head, 4); ear.rotation.set(0, Math.PI / 4, s * -.38); outline(ear, .1, .016);
        const inner = cone(.06 * big, .12 * big, species === 'fox' ? DARK : PINK, s * .215, .3, .05, head, 4); inner.rotation.set(0, Math.PI / 4, s * -.38);
      } else if (species === 'rabbit') {
        const ear = capsule(.07, .32, furM, s * .13, .5, -.02, head); ear.rotation.z = s * -.15; outline(ear, .07);
        const inner = capsule(.035, .26, PINK, s * .13, .5, .035, head); inner.rotation.z = s * -.15;
      } else if (species === 'dog') {
        const ear = sphere(.13, toon(darker(fur)), s * .35, .02, -.02, head); ear.scale.set(.55, 1.15, .45); ear.rotation.z = s * .35; outline(ear, .1);
      } else {
        const r = species === 'hamster' ? .075 : .1;
        const ear = sphere(r, species === 'panda' ? DARK : furM, s * .25, .27, -.02, head); ear.scale.z = .7; outline(ear, r);
        sphere(r * .55, species === 'panda' ? DARK : PINK, s * .25, .27, .04, head, false).scale.z = .4;
      }
    }
    if (species === 'tiger') for (let i = -1; i <= 1; i++) box(.03, .1, .02, DARK, i * .06, .27, .29, head);
    if (species === 'sheep') for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const w = sphere(.12, fur2, Math.cos(a) * .26, .22 + Math.sin(a) * .06, Math.sin(a) * .16 - .04, head); outline(w, .12, .012); }
    if (species === 'koala') { const n = sphere(.07, DARK, 0, -.04, .37, head); n.scale.set(1, 1.3, .7); }
    if (species === 'mouse') { /* 수염 */ for (const s of [-1, 1]) for (const dy of [-.02, .02]) rod([s * .08, -.07 + dy, .38], [s * .26, -.05 + dy * 2, .34], .006, DARK, head); }
    if (species === 'dokkaebi') {
      const horn = cone(.07, .22, toon('#ffd34a'), 0, .44, 0, head, 8); outline(horn, .07, .012);
      for (const s of [-1, 1]) { const tooth = cone(.02, .05, WHITE, s * .05, -.16, .34, head, 4); tooth.rotation.x = Math.PI; }
      const hair = sphere(.2, toon('#2b2228'), 0, .26, -.08, head); hair.scale.set(1.4, .5, 1);
    }
    if (host) { // 바텐더 모자
      outline(cyl(.24, .26, .05, toon('#3b3646'), 0, .32, 0, head), .26); outline(cyl(.16, .17, .16, toon('#3b3646'), 0, .42, 0, head), .17);
      cyl(.172, .172, .04, toon('#e65f5c'), 0, .37, 0, head);
    }
    // 꼬리
    if (species === 'fox') {
      const tail = sphere(.17, furM, 0, .38, -.3, rig); tail.scale.set(.85, .9, 1.7); tail.rotation.x = .5; outline(tail, .17);
      const tip = sphere(.11, fur2, 0, .48, -.5, rig); tip.scale.set(.85, .95, 1.2);
    } else if (species === 'tiger' || species === 'raccoon') {
      const tail = capsule(.05, .32, furM, 0, .45, -.27, rig); tail.rotation.x = -.8; outline(tail, .05);
      for (let i = 0; i < 2; i++) { const b = mesh(geo('tband', () => new T.TorusGeometry(.052, .018, 6, 14)), DARK, 0, .48 - i * .09, -.32 - i * .06, rig); b.rotation.x = .8; }
    } else if (species === 'mouse') {
      const tail = capsule(.015, .34, PINK, 0, .42, -.3, rig); tail.rotation.x = -1.0;
    } else if (species === 'rabbit' || species === 'bear' || species === 'panda' || species === 'hamster' || species === 'koala' || species === 'sheep') {
      outline(sphere(.07, species === 'panda' ? DARK : fur2, 0, .36, -.21, rig), .07);
    } else if (species === 'cat') {
      const tail = capsule(.04, .3, furM, 0, .45, -.25, rig); tail.rotation.x = -.7; outline(tail, .04);
    } else if (species === 'dog') {
      const tail = cone(.05, .2, furM, 0, .45, -.23, rig, 8); tail.rotation.x = -.9; outline(tail, .05);
    } else if (species === 'dragon') {
      const tail = cone(.12, .5, furM, 0, .32, -.38, rig, 10); tail.rotation.x = -1.9; outline(tail, .1);
      for (let i = 0; i < 3; i++) { const sp = cone(.05, .12, toon(darker(fur)), 0, .78 - i * .16, -.2 - i * .02, rig, 4); sp.rotation.x = -.5; }
    } else if (species === 'ghost') {
      const skirt = cone(.26, .3, clothes, 0, .2, 0, rig, 10); skirt.rotation.x = Math.PI; outline(skirt, .2);
    } else if (species === 'penguin') {
      sphere(.07, DARK, 0, .32, -.2, rig);
    }
    // 장식(extra)
    if (extra === 'gat') { const brim = cyl(.42, .42, .015, toon('#1f1c22', {transparent: true, opacity: .85}), 0, .3, 0, head, 32); cyl(.15, .17, .2, toon('#1f1c22', {transparent: true, opacity: .9}), 0, .41, 0, head); for (const s of [-1, 1]) rod([s * .3, .3, 0], [s * .2, -.2, .1], .008, toon('#e8d6a0'), head); brim.castShadow = false; }
    else if (extra === 'cap') { const c = dome(.36, toon('#e8584a'), 0, .14, -.02, head, false); c.scale.y = .8; outline(c, .36, .012); const v = cyl(.2, .2, .02, toon('#e8584a'), 0, .16, .32, head); v.scale.z = .7; }
    else if (extra === 'beanie') { const c = dome(.37, toon('#5f7fa8'), 0, .12, -.02, head, false); outline(c, .37, .012); cyl(.375, .375, .08, toon('#4a6890'), 0, .14, -.02, head, false, 24); sphere(.08, toon('#f6f1e6'), 0, .5, -.02, head); }
    else if (extra === 'headband') { const b = mesh(geo('hband', () => new T.TorusGeometry(.33, .025, 6, 28, Math.PI)), toon('#ff8fb1'), 0, .1, 0, head); b.rotation.y = Math.PI / 2; sphere(.05, toon('#ff6f9c'), .2, .33, .1, head); }
    else if (extra === 'glasses') { for (const s of [-1, 1]) { const r = mesh(geo('lens', () => new T.TorusGeometry(.075, .012, 6, 20)), toon('#2b2228'), s * .14, .03, .37, head); } box(.1, .015, .015, toon('#2b2228'), 0, .05, .38, head, false); }
    else if (extra === 'headset') { const b = mesh(geo('hset', () => new T.TorusGeometry(.38, .03, 6, 28, Math.PI)), toon('#2b2a2f'), 0, .02, 0, head); b.rotation.y = Math.PI / 2; for (const s of [-1, 1]) { const cup = cyl(.1, .1, .07, toon('#e8584a'), s * .38, .0, 0, head); cup.rotation.z = Math.PI / 2; } }
    else if (extra === 'scarf') { const sc = mesh(geo('scarf', () => new T.TorusGeometry(.16, .06, 8, 20)), toon('#d6383a'), 0, .7, 0, rig); sc.rotation.x = Math.PI / 2; const tail = box(.09, .22, .04, toon('#d6383a'), .1, .58, .16, rig); tail.rotation.z = .2; }
    else if (extra === 'halo') { const h = mesh(geo('halo', () => new T.TorusGeometry(.2, .03, 8, 28)), glow('#ffe58a'), 0, .62, -.02, head); h.rotation.x = Math.PI / 2; }
    else if (extra === 'devil') for (const s of [-1, 1]) { const d = cone(.05, .17, toon('#d6383a'), s * .16, .38, .05, head, 8); d.rotation.z = s * -.4; outline(d, .05, .01); }
    else if (extra === 'crown') { const c = cyl(.17, .15, .1, toon('#f2c14e'), 0, .38, 0, head); outline(c, .17, .012); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; cone(.035, .1, toon('#f2c14e'), Math.cos(a) * .15, .47, Math.sin(a) * .15, head, 6); } sphere(.03, toon('#e0475b'), 0, .39, .17, head); }
    else if (extra === 'flower') { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; sphere(.05, toon('#ff9fc0'), .24 + Math.cos(a) * .06, .3 + Math.sin(a) * .06, .12, head); } sphere(.04, toon('#ffd34a'), .24, .3, .15, head); }
    else if (extra === 'unicorn') { const u = cone(.05, .3, toon('#f6e7ff'), 0, .4, .2, head, 10); u.rotation.x = .4; outline(u, .05, .01); }
    else if (extra === 'wings' || extra === 'batwings') {
      const wm = extra === 'wings' ? toon('#ffffff') : toon('#3a2f45');
      for (const s of [-1, 1]) { const w = extra === 'wings' ? sphere(.2, wm, s * .22, .6, -.2, rig) : cone(.2, .4, wm, s * .26, .62, -.18, rig, 3); w.scale.set(extra === 'wings' ? .55 : 1, 1, .25); w.rotation.z = s * (extra === 'wings' ? -.5 : -1.1); outline(w, .2, .012); }
    }
    // 맞았을 때 표정 '> <': 눈 자리에 꺾쇠 두 개(평소엔 숨김)
    const ouch = new T.Group(); ouch.visible = false; head.add(ouch); ouch.userData.hide = [...parts.eyes, ...(parts.hls ?? [])];
    for (const s of [-1, 1]) {
      const ey = species === 'frog' ? .3 : .04, ez = species === 'frog' ? .32 : .372, x = s * (species === 'frog' ? .16 : .14);
      for (const k of [-1, 1]) { const bar = box(.085, .028, .03, DARK, x, ey + k * .022, ez, ouch, false); bar.rotation.z = s * k * .55; }
    }
    return {rig, head, legs: parts.legs, arms: parts.arms, eyes: parts.eyes, collar, clothes, fist: parts.fist, fists: parts.fists, ouch};
  }

  // ── 주민 배치 ─────────────────────────────────────────
  function resident({id, name, color, x, z, seated = false, heading = 0, host = false, mood = 'talk', species, fur, y}) {
    const root = new T.Group();
    root.position.set(x, y ?? 0, z); root.rotation.y = heading; scene.add(root);
    const c = critter({species, fur, outfit: color, accent: host ? '#ffffff' : lighter(color), host});
    root.add(c.rig);
    if (seated) for (const leg of c.legs) leg.rotation.x = -1.35;
    let badge = null;
    if (mood === 'rest') { badge = new T.Sprite(new T.SpriteMaterial({map: restTex, depthWrite: false})); badge.scale.set(.5, .4, 1); badge.position.y = 1.75; root.add(badge); }
    if (host) { // 호스트 전용: HOST 배지 + 셰이커
      const hb = new T.Sprite(new T.SpriteMaterial({map: hostTex, depthWrite: false})); hb.scale.set(.62, .5, 1); hb.position.y = 2.05; root.add(hb);
      const shaker = new T.Group(); c.arms[0].add(shaker); shaker.position.set(-.03, -.2, .08);
      outline(cyl(.05, .045, .16, M.chrome, 0, .06, 0, shaker, false), .05, .01); cone(.04, .07, M.chrome, 0, .17, 0, shaker, 10);
    }
    // 선물 받은 잔(평소엔 숨김)
    const giftGlass = new T.Group(); c.arms[1].add(giftGlass); giftGlass.position.set(.03, -.2, .08); giftGlass.visible = false;
    const giftLiquid = new T.MeshToonMaterial({color: '#e0a640', gradientMap: grad});
    cyl(.05, .045, .13, M.glass, 0, .06, 0, giftGlass, false); cyl(.042, .04, .09, giftLiquid, 0, .045, 0, giftGlass, false);
    tag(root, id);
    const npc = {id, name, root, head: c.head, legs: c.legs, arms: c.arms, seated, host, mood, badge, giftGlass, giftLiquid, phase: npcs.length * .8, baseY: root.position.y, path: []};
    npcs.push(npc); return npc;
  }
  for (const t of TABLES) t.members.forEach((name, i) => {
    const s = t.seats[t.memberSeats[i]];
    resident({id: t.id + '-' + name, name, color: t.colors[i], x: s.x, z: s.z, y: s.y, seated: true, heading: s.heading, species: t.species[i], fur: t.furs[i]});
  });
  resident({id: 'host', name: 'JAY', color: '#ffffff', x: RING.host.x, z: RING.host.z, host: true, species: 'bear', fur: '#b98356', y: HOST_STEP});
  for (const n of WANDERERS) resident(n);
  for (const n of LOUNGERS) resident({...n, seated: true});

  // ── 펫: 단골의 상징. 작은 동물이 주인을 따라다닌다 ──
  // ── 펫(v1.9): 사람 캐릭터 축소판이 아니라 네 발로 아장아장 기어다니는 꼬마 동물 ──
  // 종류는 적게: 강아지 · 고양이 · 토끼 · 아기 돼지 · 고슴도치. 예전 펫 이름은 가까운 종류로 바꿔 보여준다.
  const PET_ALIAS = {dog: 'puppy', fox: 'puppy', sheep: 'puppy', koala: 'puppy', raccoon: 'puppy', tiger: 'kitty', cat: 'kitty', panda: 'kitty', rabbit: 'bunny', mouse: 'bunny', hamster: 'piglet', frog: 'piglet', penguin: 'hedgehog', dragon: 'hedgehog', ghost: 'bunny', robot: 'puppy', dokkaebi: 'piglet'};
  const PET_FUR = {puppy: '#e8bd85', kitty: '#f2b675', bunny: '#fbf3ea', piglet: '#f6b6b0', hedgehog: '#c9a27c'};
  function makePet(species, fur) {
    const kind = PET_FUR[species] ? species : PET_ALIAS[species] ?? 'puppy';
    const g = new T.Group(); scene.add(g);
    const base = fur && PET_FUR[species] ? fur : PET_FUR[kind];
    const furM = toon(base), lightM = toon(lighter(base)), darkM = toon(darker(base)), pinkM = toon('#ff9fb0');
    const body = new T.Group(); body.scale.setScalar(1.3); g.add(body);
    // 몸통(앞뒤로 긴 콩 모양) + 배
    const torso = sphere(.13, kind === 'hedgehog' ? toon('#f3dcc0') : furM, 0, .19, 0, body); torso.scale.set(1.0, .82, 1.32); outline(torso, .13, .014);
    if (kind !== 'hedgehog') { const belly = sphere(.09, lightM, 0, .15, .03, body, false); belly.scale.set(.9, .6, 1.2); }
    // 머리
    const hy = kind === 'bunny' ? .31 : .29, hz = .17;
    const head = new T.Group(); head.position.set(0, hy, hz); body.add(head);
    const skull = sphere(.11, kind === 'hedgehog' ? toon('#f3dcc0') : furM, 0, 0, 0, head); skull.scale.set(1.05, .95, .95); outline(skull, .11, .014);
    for (const sx of [-1, 1]) {
      const eye = sphere(.02, DARK, sx * .045, .015, .095, head); eye.scale.set(1, 1.25, .6);
      sphere(.007, WHITE, sx * .045 + .006, .025, .108, head, false);
      const bl = sphere(.022, BLUSH, sx * .075, -.025, .08, head, false); bl.scale.set(1, .55, .35);
    }
    if (kind === 'piglet') { const sn = cyl(.042, .045, .03, pinkM, 0, -.02, .105, head); sn.rotation.x = Math.PI / 2; for (const sx of [-1, 1]) sphere(.009, DARK, sx * .015, -.02, .122, head, false); }
    else if (kind === 'hedgehog') { const sn = cone(.035, .07, lightM, 0, -.02, .12, head, 10); sn.rotation.x = Math.PI / 2; sphere(.014, DARK, 0, -.02, .155, head, false); }
    else { const mz = sphere(.045, lightM, 0, -.03, .085, head, false); mz.scale.set(1.2, .8, .8); sphere(.014, kind === 'puppy' ? DARK : pinkM, 0, -.012, .13, head, false); }
    // 귀
    for (const sx of [-1, 1]) {
      if (kind === 'puppy') { const e = sphere(.05, darkM, sx * .1, .02, -.01, head); e.scale.set(.45, 1.1, .8); e.rotation.z = sx * .35; }
      else if (kind === 'kitty') { const e = cone(.04, .07, furM, sx * .065, .1, 0, head, 4); e.rotation.z = sx * -.25; const ei = cone(.022, .04, pinkM, sx * .065, .095, .012, head, 4); ei.rotation.z = sx * -.25; }
      else if (kind === 'bunny') { const e = capsule(.026, .14, furM, sx * .04, .17, -.02, head); e.rotation.z = sx * -.15; const ei = capsule(.013, .11, pinkM, sx * .04, .17, -.004, head); ei.rotation.z = sx * -.15; }
      else if (kind === 'piglet') { const e = cone(.035, .05, furM, sx * .07, .085, .01, head, 4); e.rotation.set(.6, 0, sx * -.4); }
      else { const e = sphere(.022, toon('#f3dcc0'), sx * .07, .07, 0, head); e.scale.set(1, 1, .5); }
    }
    // 고슴도치 가시
    if (kind === 'hedgehog') {
      const spikeM = toon(base === PET_FUR.hedgehog ? '#7a5a3e' : darker(base));
      const up = new T.Vector3(0, 1, 0), dir = new T.Vector3();
      for (let i = 0; i < 30; i++) {
        const u = i / 30, a = u * Math.PI * 2 * 4.3, ph = .25 + u * 1.25; // 등 위쪽 반구에 나선형으로
        const x = Math.cos(a) * Math.sin(ph) * .13, y = .19 + Math.cos(ph) * .11 + .02, z = -.04 + Math.sin(a) * Math.sin(ph) * .16 - u * .06;
        if (z > .1) continue;
        const sp = cone(.026, .085, spikeM, x, y, z, body, 5);
        dir.set(x, y - .17, z + .02).normalize(); sp.quaternion.setFromUnitVectors(up, dir);
      }
    }
    // 네 다리(짧고 통통) — 대각선끼리 같이 움직여 기어다니는 느낌
    const legs4 = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = new T.Group(); leg.position.set(sx * .075, .12, sz * .1); body.add(leg);
      cyl(.034, .03, .09, furM, 0, -.045, 0, leg);
      const paw = sphere(.036, lightM, 0, -.095, .012, leg); paw.scale.set(1, .6, 1.2);
      legs4.push(leg);
    }
    // 꼬리
    let tail = new T.Group(); tail.position.set(0, .22, -.17); body.add(tail);
    if (kind === 'puppy') { const t = capsule(.022, .07, darkM, 0, .04, -.02, tail); t.rotation.x = -.7; }
    else if (kind === 'kitty') { const t1 = capsule(.016, .1, furM, 0, .06, -.02, tail); t1.rotation.x = -.35; const t2 = capsule(.016, .06, darkM, 0, .14, .0, tail); t2.rotation.x = .3; }
    else if (kind === 'bunny') sphere(.04, toon('#ffffff'), 0, 0, -.01, tail);
    else if (kind === 'piglet') { const t = mesh(geo('pigtail', () => new T.TorusGeometry(.025, .007, 6, 14, Math.PI * 1.6)), pinkM, 0, .01, -.02, tail); t.rotation.y = Math.PI / 2; }
    g.traverse(o => { if (o.isMesh) { o.userData.ignorePick = true; o.castShadow = false; } });
    const pair = (a, b) => ({rotation: {set x(v) { a.rotation.x = v; b.rotation.x = v; }, get x() { return a.rotation.x; }}});
    return {group: g, body, legs: [pair(legs4[0], legs4[3]), pair(legs4[1], legs4[2])], tail, kind, hop: kind === 'bunny', phase: Math.random() * 6};
  }
  const npcPets = [];
  for (const n of npcs) { const info = PEOPLE[n.name]; if (info?.pet) npcPets.push({...makePet(info.pet.species, info.pet.fur), owner: n}); }

  // ── 방문자: 여우 ──────────────────────────────────────
  const actor = new T.Group(); scene.add(actor); actor.position.set(ENTRY.x, 0, ENTRY.z);
  // 바깥 rig는 고정(걷기·점프 애니메이션이 여기에 걸린다), 안쪽 캐릭터는 꾸미기에 따라 다시 만든다.
  const rig = new T.Group(); actor.add(rig);
  const ownJacket = new T.MeshToonMaterial({color: '#cddc83', gradientMap: grad});
  const fox = {legs: [], arms: [], eyes: [], head: null, rig: null};

  const shadow = mesh(new T.CircleGeometry(.3, 32), new T.MeshBasicMaterial({color: '#3b2a22', transparent: true, opacity: .22, depthWrite: false}), ENTRY.x, .02, ENTRY.z, scene, false);
  shadow.rotation.x = -Math.PI / 2;
  const marker = mesh(new T.RingGeometry(.2, .26, 40), new T.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: .95, side: T.DoubleSide, depthWrite: false}), ENTRY.x, .03, ENTRY.z, scene, false);
  marker.rotation.x = -Math.PI / 2; marker.visible = false;
  actor.traverse(o => { if (o.isMesh) o.userData.ignorePick = true; });
  shadow.userData.ignorePick = true; marker.userData.ignorePick = true;

  // 손에 드는 잔: 술 종류마다 모양이 다르고, 마실수록 술이 줄어든다.
  const glassGroup = new T.Group(); glassGroup.position.set(.04, -.2, .08);
  const liquidMat = new T.MeshToonMaterial({color: '#d9a045', gradientMap: grad});
  const glassMat = new T.MeshToonMaterial({color: '#f4ead8', gradientMap: grad, transparent: true, opacity: .45});
  const glasses = {};
  { // 하이볼·소다: 긴 텀블러
    const g = new T.Group(); glassGroup.add(g);
    outline(cyl(.055, .05, .2, glassMat, 0, .08, 0, g, false), .055, .01);
    const liq = cyl(.048, .045, .16, liquidMat, 0, .065, 0, g, false); liq.geometry.translate(0, 0, 0);
    cyl(.012, .012, .26, toon('#ffffff'), .03, .14, 0, g, false).rotation.z = .2; // 빨대
    glasses.tall = {group: g, liquid: liq, base: .065, h: .16};
  }
  { // 와인: 볼 + 스템
    const g = new T.Group(); glassGroup.add(g);
    cyl(.04, .04, .01, glassMat, 0, -.04, 0, g, false); cyl(.008, .008, .1, glassMat, 0, .01, 0, g, false);
    const bowl = sphere(.07, glassMat, 0, .12, 0, g, false); bowl.scale.y = 1.15; outline(bowl, .07, .008);
    const liq = sphere(.06, liquidMat, 0, .1, 0, g, false); liq.scale.y = .7;
    glasses.wine = {group: g, liquid: liq, base: .1, h: .06, sphere: true};
  }
  { // 네그로니: 쿠프 잔
    const g = new T.Group(); glassGroup.add(g);
    cyl(.04, .04, .01, glassMat, 0, -.04, 0, g, false); cyl(.008, .008, .1, glassMat, 0, .01, 0, g, false);
    outline(cyl(.085, .02, .06, glassMat, 0, .09, 0, g, false), .085, .008);
    const liq = cyl(.075, .025, .04, liquidMat, 0, .085, 0, g, false);
    sphere(.018, toon('#ff8a3d'), .06, .12, 0, g, false); // 오렌지 껍질
    glasses.coupe = {group: g, liquid: liq, base: .085, h: .04};
  }
  { // 위스키: 락 잔
    const g = new T.Group(); glassGroup.add(g);
    outline(cyl(.065, .06, .09, glassMat, 0, .03, 0, g, false), .065, .01);
    const liq = cyl(.058, .055, .06, liquidMat, 0, .02, 0, g, false);
    box(.04, .04, .04, toon('#f0f6f6', {transparent: true, opacity: .7}), 0, .045, 0, g, false);
    glasses.rocks = {group: g, liquid: liq, base: .02, h: .06};
  }
  glassGroup.visible = false; glassGroup.traverse(o => { o.userData.ignorePick = true; });
  function setGlass(kind, color) {
    for (const [k, g] of Object.entries(glasses)) g.group.visible = k === kind;
    liquidMat.color.set(color); glassGroup.visible = true; setFill(1);
  }
  function setFill(f) { // 0~1, 남은 양
    const g = Object.values(glasses).find(g => g.group.visible); if (!g) return;
    const k = Math.max(.08, f);
    if (g.sphere) { g.liquid.scale.set(k ** .3, .7 * k, k ** .3); g.liquid.position.y = g.base - (1 - k) * .03; }
    else { g.liquid.scale.y = k; g.liquid.position.y = g.base - (1 - k) * g.h / 2; }
  }

  // 액세서리(상점) — 다른 사람 캐릭터에도 같은 모양을 붙일 수 있게 만드는 함수로 둔다.
  const ACC = {
    beret: g => { const b = sphere(.3, toon('#b5532c'), .04, .3, -.02, g); b.scale.set(1.05, .32, 1); b.rotation.z = -.18; outline(b, .3, .016); cyl(.015, .02, .06, toon('#8f3d1e'), .06, .41, -.02, g); },
    shades: g => { for (const sx of [-.14, .14]) { const l = cyl(.08, .08, .02, toon('#1f1a18'), sx, .04, .35, g, false); l.rotation.x = Math.PI / 2; outline(l, .08, .01); } box(.12, .02, .02, toon('#1f1a18'), 0, .06, .36, g, false); },
    tophat: g => { const b = cyl(.3, .3, .03, toon('#26232a'), 0, .3, -.02, g, false, 24); outline(b, .3, .01); const c = cyl(.17, .18, .3, toon('#26232a'), 0, .46, -.02, g); outline(c, .18, .012); cyl(.182, .182, .06, toon('#c9433b'), 0, .35, -.02, g, false, 24); },
    bucket: g => { const c = dome(.36, toon('#e8d6a0'), 0, .16, -.02, g, false); c.scale.y = .75; outline(c, .36, .012); cyl(.44, .5, .05, toon('#d8c48a'), 0, .17, -.02, g, false, 24); },
    party: g => { const c = cone(.14, .38, toon('#ff8fb1'), .08, .5, -.02, g, 16); c.rotation.z = -.2; outline(c, .14, .012); sphere(.05, toon('#ffd34a'), .12, .7, -.02, g); for (let i = 0; i < 3; i++) sphere(.025, toon(['#7fc8e8', '#ffd34a', '#9ad37a'][i]), .03 + i * .04, .38 + i * .1, .11, g, false); },
    chef: g => { cyl(.24, .26, .16, toon('#ffffff'), 0, .32, -.02, g); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; outline(sphere(.13, toon('#ffffff'), Math.cos(a) * .12, .47, Math.sin(a) * .12 - .02, g), .13, .01); } },
    flowercrown: g => { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; sphere(.05, toon(['#ff9fc0', '#ffd34a', '#ffffff', '#c9a2e8'][i % 4]), Math.cos(a) * .3, .26, Math.sin(a) * .28 - .02, g); } const r = mesh(geo('fcring', () => new T.TorusGeometry(.3, .02, 6, 24)), toon('#6f9a52'), 0, .25, -.02, g); r.rotation.x = Math.PI / 2; },
    bandana: g => { const b = dome(.375, toon('#d6383a'), 0, .1, -.03, g, false); b.scale.y = .62; outline(b, .37, .01); for (let i = 0; i < 6; i++) sphere(.025, toon('#ffffff'), Math.cos(i) * .25, .22, Math.sin(i) * .2, g, false); const k = cone(.06, .14, toon('#d6383a'), 0, .05, -.38, g, 4); k.rotation.x = -1.8; },
    bowtie: g => { for (const s of [-1, 1]) { const w = cone(.06, .1, toon('#c9433b'), s * .06, -.32, .2, g, 4); w.rotation.z = s * Math.PI / 2; } sphere(.03, toon('#a8322b'), 0, -.32, .21, g); },
    heartglasses: g => { for (const s of [-1, 1]) { const h = new T.Group(); h.position.set(s * .14, .04, .37); g.add(h); for (const d of [-1, 1]) sphere(.045, toon('#ff4f7a'), d * .03, .015, 0, h, false).scale.z = .4; const tip = cone(.06, .07, toon('#ff4f7a'), 0, -.03, 0, h, 4); tip.rotation.z = Math.PI; tip.scale.z = .4; } box(.1, .015, .015, toon('#ff4f7a'), 0, .06, .37, g, false); },
    mask: g => { const m = box(.42, .13, .04, toon('#2b2228'), 0, .04, .35, g, false); for (const s of [-1, 1]) { sphere(.035, toon('#f2c14e'), s * .23, .1, .36, g, false); } },
    starpin: g => { const st = cone(.07, .02, toon('#ffd34a'), .22, .26, .14, g, 5); st.rotation.x = Math.PI / 2; outline(st, .07, .01); },
    earmuff: g => { const b = mesh(geo('muffband', () => new T.TorusGeometry(.37, .025, 6, 24, Math.PI)), toon('#c9a2e8'), 0, .05, -.02, g); b.rotation.y = Math.PI / 2; for (const s of [-1, 1]) outline(sphere(.12, toon('#fbf3ea'), s * .37, .03, -.02, g), .12, .01); },
    sakura: g => { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; sphere(.035, toon('#ffc4d6'), -.22 + Math.cos(a) * .04, .28 + Math.sin(a) * .04, .13, g, false); } sphere(.02, toon('#ff8fb1'), -.22, .28, .15, g, false); },
    ribbon: g => { for (const sx of [-1, 1]) { const w = cone(.08, .14, toon('#ff8fb1'), .2 + sx * .07, .3, .1, g, 12); w.rotation.z = sx * Math.PI / 2; outline(w, .07, .012); } sphere(.04, toon('#ff6f9c'), .2, .3, .1, g); }
  };
  function addAccessory(head, id) { if (!ACC[id]) return null; const g = new T.Group(); head.add(g); ACC[id](g); g.traverse(o => { if (o.isMesh) o.userData.ignorePick = true; }); return g; }
  const acc = {};
  for (const id of Object.keys(ACC)) { acc[id] = new T.Group(); ACC[id](acc[id]); }
  let accId = 'none';
  function setAccessory(id) { accId = id; for (const [k, g] of Object.entries(acc)) g.visible = k === id; }
  // 내 캐릭터 꾸미기: 종·털 색·장식
  let look = null;
  function setLook({species = 'fox', fur = '#f08a3c', extra = 'none'} = {}) {
    const key = species + fur + extra; if (look === key) return; look = key;
    if (fox.rig) rig.remove(fox.rig);
    const c = critter({species, fur, outfit: '#cddc83', accent: '#f4b942', extra});
    c.rig.traverse(o => { if (!o.isMesh) return; if (species !== 'ghost' && o.material === c.clothes) o.material = ownJacket; o.userData.ignorePick = true; });
    rig.add(c.rig);
    fox.rig = c.rig; fox.head = c.head; fox.fist = c.fist; fox.fists = c.fists; fox.ouch = c.ouch;
    fox.legs.length = 0; fox.legs.push(...c.legs); fox.arms.length = 0; fox.arms.push(...c.arms); fox.eyes.length = 0; fox.eyes.push(...c.eyes);
    c.arms[1].add(glassGroup);
    for (const g of Object.values(acc)) c.head.add(g);
    setAccessory(accId);
  }
  setLook();
  setAccessory('none');
  actor.traverse(o => { if (o.isMesh) o.userData.ignorePick = true; });

  // 머리 위 말풍선 텍스처를 그때그때 만든다(같은 글자는 재사용).
  const bubbleCache = new Map();
  function makeBubble(text, bg = '#ffffff') {
    const key = text + bg;
    if (!bubbleCache.has(key)) { const t = bubbleTex(text, bg); drawables.push(t); if (currentFont) t.userData.redraw(currentFont); bubbleCache.set(key, t); }
    return bubbleCache.get(key);
  }
  let currentFont = null;

  function drawSign(font) { currentFont = font; for (const t of drawables) t.userData.redraw(font); }
  drawSign('sans-serif');

  return {get fist() { return fox.fist; }, get fists() { return fox.fists; }, get ouch() { return fox.ouch; }, critter, setLook, addAccessory, makePet, npcPets, scene, actor, rig, legs: fox.legs, arms: fox.arms, eyes: fox.eyes, shadow, marker, entities, npcs, glassGroup, setGlass, setFill, setAccessory, makeBubble,
    seatAngles, jacket: ownJacket, drawSign, lampShades, emoteTextures, flags: flagTexes, clock: {hourHand, minHand}};
}
