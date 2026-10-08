// 밤마을 v1.1 — 바 밖의 작은 서울. 해 질 무렵의 성수 골목 · 광장 · 한강 산책로 · 궁궐 돌담길.
// 실제 서울 지도를 줄인 것이 아니라, 서울의 재료와 풍경을 짧은 산책 거리로 다시 짠 가상의 동네다.
// 모든 그림은 코드와 캔버스로 만든다. 건물 내부는 없다(외관과 '오픈 준비 중' 안내까지).
import * as T from './vendor/three.min.mjs?v=1791439165';

export const TOWN_X = 200;                 // 바 실내와 겹치지 않게 멀리 떨어진 곳에 둔다
export const TOWN = {minX: -21.5, maxX: 21.5, minZ: -12, maxZ: 8.6};
const W = x => x + TOWN_X;

// 시설: id는 이후 내부 장면을 붙일 때도 그대로 쓴다.
export const TOWN_SPOTS = [
  {id: 'barDoor', name: '밤마을 바', kind: 'door', x: -12.25, z: 2.75, label: '바에 들어가기', note: ''},
  {id: 'cafe', name: '노을다방', kind: 'soon', x: -6, z: 4.4, label: '노을다방 · 카페', note: '테라스에서 낮 모임과 취향 이야기를 나누는 카페가 될 거예요.'},
  {id: 'store', name: '밤편의점', kind: 'soon', x: -18.75, z: 2.9, label: '밤편의점', note: '간식과 작은 아이템, 생활 퀘스트를 준비하고 있어요.'},
  {id: 'hotel', name: '호텔 서울밤', kind: 'soon', x: 8.5, z: 3.5, label: '호텔 서울밤', note: '나만의 방을 꾸미고 추억을 모아두는 공간이 될 거예요.'},
  {id: 'palace', name: '돌담길 대문', kind: 'soon', x: 17, z: 2.9, label: '돌담길 대문', note: '계절 풍경과 마을 행사가 열릴 자리예요.'},
  {id: 'park', name: '밤마을 랜드', kind: 'soon', x: -19.6, z: -10, label: '밤마을 랜드 입구', note: '미니게임과 행사가 열릴 놀이공원이에요. 관람차는 미리 돌고 있어요.'},
  {id: 'board', name: '마을 게시판', kind: 'soon', x: -2.3, z: 2.6, label: '마을 게시판', note: '다음 판 예고와 테마 나이트 소식이 올라올 게시판이에요.'},
  {id: 'mailbox', name: '우체통', kind: 'soon', x: 4.0, z: 2.8, label: '우체통', note: '친구가 된 사람에게 쪽지를 남기는 우체통이에요. 지금은 열리지 않아요.'},
  {id: 'river', name: '한강 산책로', kind: 'view', x: 0.5, z: -10.6, label: '한강 바라보기', note: ''}
].map(s => ({...s, wx: W(s.x)}));
export const TOWN_SPAWN = {x: W(-12.25), z: 4.1}; // 바 문 앞(상호작용 지점과 떨어져 있다)

export function createTown({scene, critter, makeBubbleSprite, noNpc = false}) {
  const group = new T.Group(); group.position.x = TOWN_X; group.visible = false; scene.add(group);
  const grad = new T.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, T.RedFormat);
  grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true;
  const mcache = new Map();
  const toon = (color, extra = {}) => {
    if (extra.map || extra.own) { const {own, ...rest} = extra; return new T.MeshToonMaterial({color, gradientMap: grad, ...rest}); }
    const k = color + JSON.stringify(extra); if (!mcache.has(k)) mcache.set(k, new T.MeshToonMaterial({color, gradientMap: grad, ...extra})); return mcache.get(k);
  };
  const glow = (color, extra = {}) => new T.MeshBasicMaterial({color, toneMapped: false, ...extra});
  const gcache = new Map(); const geo = (k, f) => { if (!gcache.has(k)) gcache.set(k, f()); return gcache.get(k); };
  function mesh(g, m, x = 0, y = 0, z = 0, p = group) { const o = new T.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; }
  const box = (w, h, d, m, x, y, z, p) => mesh(geo(`b${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)), m, x, y, z, p);
  const cyl = (a, b, h, m, x, y, z, p, seg = 16) => mesh(geo(`c${a},${b},${h},${seg}`, () => new T.CylinderGeometry(a, b, h, seg)), m, x, y, z, p);
  const sphere = (r, m, x, y, z, p) => mesh(geo('s' + r, () => new T.SphereGeometry(r, 16, 12)), m, x, y, z, p);
  const cone = (r, h, m, x, y, z, p, seg = 12) => mesh(geo(`k${r},${h},${seg}`, () => new T.ConeGeometry(r, h, seg)), m, x, y, z, p);
  const plane = (w, h, m, x, y, z, p) => { const o = mesh(new T.PlaneGeometry(w, h), m, x, y, z, p); return o; };
  const flat = (w, d, m, x, y, z, p) => { const o = plane(w, d, m, x, y, z, p); o.rotation.x = -Math.PI / 2; return o; };
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  }
  const FONT = "'Jua', 'Gowun Dodum', sans-serif";
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  // ── 하늘 · 안개(해 질 무렵) ───────────────────────────
  const sky = canvasTex(4, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3b2c5c'); g.addColorStop(.45, '#7d5a86'); g.addColorStop(.72, '#d78c7a'); g.addColorStop(.86, '#f2b98a'); g.addColorStop(1, '#f7cf9c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const fog = new T.Fog('#8a6a8c', 50, 170);
  // 해 질 무렵 빛: 하늘은 보라, 서쪽에서 복숭아빛 해가 낮게 비춘다(그림자는 끔)
  group.add(new T.HemisphereLight('#ffd6c2', '#4b3d5c', 1.35));
  const sun = new T.DirectionalLight('#ffb184', 1.25); sun.position.set(-30, 22, 28); sun.target.position.set(0, 0, -4); group.add(sun, sun.target);
  const fill = new T.DirectionalLight('#9fb4ff', .35); fill.position.set(25, 15, -20); group.add(fill);

  // ── 바닥 ──────────────────────────────────────────────
  const pave = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#8f8379'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const off = y % 2 ? 32 : 0; c.fillStyle = ['#9a8e83', '#8b8077', '#a39589', '#948a80'][(x + y * 3) % 4];
      c.fillRect(x * 64 + off + 2, y * 32 + 2, 60, 28); if (off) c.fillRect(-32 + 2, y * 32 + 2, 60, 28);
    }
  }, [12, 6]);
  const plazaTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#b7a58f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#9d8b76'; c.lineWidth = 6;
    for (let r = 40; r < 360; r += 46) { c.beginPath(); c.arc(w / 2, h / 2, r, 0, Math.PI * 2); c.stroke(); }
    for (let a = 0; a < 24; a++) { c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a / 24 * Math.PI * 2) * 400, h / 2 + Math.sin(a / 24 * Math.PI * 2) * 400); c.lineWidth = 2; c.stroke(); }
  });
  const deck = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#9c7b5c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7d5f45'; c.lineWidth = 3; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } }, [24, 3]);
  const grassM = toon('#6f8f57');
  // 기본 바닥(길)
  flat(60, 40, toon('#ffffff', {map: pave}), 0, 0, -2);
  flat(9, 10, toon('#ffffff', {map: plazaTex}), .5, .012, -2.5);
  flat(45, 3.6, toon('#ffffff', {map: deck}), 0, .015, -10.3);           // 한강 데크
  for (const [x, z, w, d] of [[-14, -7.6, 8, 1.2], [13, -7.4, 9, 1.4], [-5.5, -8.2, 3, 1], [8, -8.4, 3, 1]]) flat(w, d, grassM, x, .02, z);
  // 땅의 가장자리(뒤로 강, 앞으로 낮은 화단)
  box(60, .5, .4, toon('#6e6259'), 0, -.2, 8.9);

  // ── 강 · 다리 · 건너편 · 남산 · 관람차 ───────────────
  const waterTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#4c5f78'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${200 + rnd() * 55},${170 + rnd() * 60},${150 + rnd() * 60},${.15 + rnd() * .25})`; c.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 20, 1.5); }
  }, [14, 10]);
  const water = flat(200, 60, new T.MeshBasicMaterial({map: waterTex, color: '#9fb1c8', fog: true}), 0, -.35, -42);
  box(46, .9, .5, toon('#5e5a58'), 0, -.2, -12.4); // 강둑
  // 난간
  const rail = toon('#2f3438');
  box(44, .06, .06, rail, 0, 1.0, -12.2); box(44, .05, .05, rail, 0, .55, -12.2);
  { const posts = new T.InstancedMesh(new T.CylinderGeometry(.04, .04, 1.05, 8), rail, 45); const m = new T.Matrix4();
    for (let i = 0; i < 45; i++) { m.makeTranslation(-22 + i, .52, -12.2); posts.setMatrixAt(i, m); } group.add(posts); }
  // 한강 다리: 아치 + 조명, 다리 양옆으로 무지개 분수(해 질 녘 쇼)
  const bridgeM = toon('#6d6a74');
  box(240, .9, 3.2, bridgeM, 0, 2.6, -40);
  box(240, .25, 3.4, toon('#8a8794'), 0, 3.15, -40);
  for (let i = -12; i <= 12; i++) cyl(.55, .7, 2.8, bridgeM, i * 10, 1.1, -40);
  { const bulbs = new T.InstancedMesh(new T.SphereGeometry(.16, 8, 6), glow('#bfe4ff'), 80); const m = new T.Matrix4();
    for (let i = 0; i < 80; i++) { m.makeTranslation(-120 + i * 3, 3.4, -38.3); bulbs.setMatrixAt(i, m); } group.add(bulbs); }
  // 무지개 분수: 다리 옆구리에서 강으로 떨어지는 물줄기(입자 색이 천천히 돈다)
  const JETS = 26, DROPS = 9, fountain = new T.InstancedMesh(new T.SphereGeometry(.16, 6, 5), new T.MeshBasicMaterial({toneMapped: false}), JETS * DROPS);
  fountain.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(fountain);
  const fColor = new T.Color(), fMat = new T.Matrix4();
  // 강 건너 하늘선(불 켜진 아파트·빌딩)
  const cityTex = canvasTex(1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 26 + rnd() * 60, bh = 40 + rnd() * 150; c.fillStyle = ['#4b3e5c', '#43385a', '#56456a', '#3d3552'][Math.floor(rnd() * 4)]; c.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 8; yy < h - 8; yy += 11) for (let xx = x + 5; xx < x + bw - 6; xx += 9) if (rnd() < .4) { c.fillStyle = rnd() < .8 ? '#ffcf86' : '#bfe0ff'; c.fillRect(xx, yy, 4, 5); }
      x += bw + 2;
    }
  });
  const city = plane(260, 26, new T.MeshBasicMaterial({map: cityTex, transparent: true, fog: false}), 0, 11, -60); city.renderOrder = -1;
  // ── 서울 랜드마크(원경) ─────────────────────────────
  const far = new T.Group(); group.add(far);
  // 남산 + 남산서울타워(정면 약간 오른쪽)
  const hill = mesh(new T.SphereGeometry(34, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), toon('#2f4a3e'), 6, -3, -96, far); hill.scale.set(1.7, .3, .7);
  const hill2 = mesh(new T.SphereGeometry(20, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon('#36503f'), 40, -3, -100, far); hill2.scale.set(1.6, .28, .7); hill2.position.x = 34;
  const tower = new T.Group(); tower.position.set(6, 8.5, -96); tower.scale.setScalar(.48); far.add(tower);
  cyl(2.2, 3.0, 3.4, toon('#d9d0c4'), 0, 1.7, 0, tower);                 // 기단
  cyl(1.0, 1.25, 20, toon('#f1ece4'), 0, 13, 0, tower);                   // 몸통
  cyl(3.4, 2.6, 3.2, toon('#e6dfd5'), 0, 24.5, 0, tower);                 // 전망대
  const ringLight = cyl(3.5, 3.5, .7, glow('#9fb6ff'), 0, 24.2, 0, tower);
  cyl(2.2, 3.2, 1.0, toon('#d8cfc4'), 0, 22.4, 0, tower);
  cyl(.5, .9, 4, toon('#eee8df'), 0, 28, 0, tower);
  cyl(.18, .35, 12, toon('#f6f2ea'), 0, 36, 0, tower);                    // 안테나
  const towerTip = sphere(.6, glow('#ff4d4d'), 0, 42.3, 0, tower);
  for (const y of [31, 34.5, 38]) cyl(.42, .42, .3, glow('#ff8a8a'), 0, y, 0, tower);
  // 롯데월드타워(오른쪽 멀리): 끝으로 갈수록 가늘어지는 유리 탑
  const lotte = new T.Group(); lotte.position.set(24, -1, -92); lotte.scale.setScalar(.36); far.add(lotte);
  const lt = mesh(new T.CylinderGeometry(.9, 5.2, 78, 4, 1), toon('#a9b8cf'), 0, 39, 0, lotte); lt.rotation.y = Math.PI / 4;
  const ltGlow = mesh(new T.CylinderGeometry(.92, 5.25, 78, 4, 1, true), new T.MeshBasicMaterial({color: '#dbe9ff', transparent: true, opacity: .18, toneMapped: false, wireframe: true}), 0, 39, 0, lotte); ltGlow.rotation.y = Math.PI / 4;
  for (let i = 0; i < 12; i++) { const k = i / 12; const r = 5.2 - 4.3 * k; const band = mesh(new T.CylinderGeometry(r * .99, r * 1.0, .25, 4, 1, true), glow(i % 3 ? '#ffe2a8' : '#ffffff'), 0, 4 + k * 70, 0, lotte); band.rotation.y = Math.PI / 4; }
  const lotteTip = sphere(.6, glow('#ffffff'), 0, 79, 0, lotte);
  // 63빌딩(왼쪽 멀리): 금빛 유리 빌딩
  const goldTex = canvasTex(64, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe7a3'); g.addColorStop(1, '#c98e2e'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(90,50,10,.35)'; for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1); });
  const b63 = mesh(new T.CylinderGeometry(3.2, 4.4, 34, 4, 1), new T.MeshBasicMaterial({map: goldTex, toneMapped: false}), -20, 9, -84, far); b63.rotation.y = Math.PI / 4; b63.scale.set(.6, .6, .33);
  // 강 건너 낮은 아파트 단지(입체 몇 동)
  for (let i = 0; i < 9; i++) { const x = -70 + i * 17 + rnd() * 6, h = 8 + rnd() * 10; const ap = box(5, h, 3, toon('#5c5070'), x, h / 2 - .4, -50 - rnd() * 4, far);
    const wt = canvasTex(32, 64, (c, w, hh) => { c.fillStyle = '#5c5070'; c.fillRect(0, 0, w, hh); for (let y = 2; y < hh; y += 5) for (let xx = 2; xx < w; xx += 5) if (rnd() < .5) { c.fillStyle = '#ffd08a'; c.fillRect(xx, y, 3, 3); } });
    plane(4.8, h - .5, new T.MeshBasicMaterial({map: wt, toneMapped: false}), x, h / 2 - .4, -48.4 + (ap.position.z + 50), far); }
  // 관람차
  const wheel = new T.Group(); wheel.position.set(-36, 11, -24); wheel.rotation.y = .5; group.add(wheel);
  const wheelM = toon('#f2e8dc');
  const ring = mesh(new T.TorusGeometry(9, .22, 8, 64), wheelM, 0, 0, 0, wheel);
  mesh(new T.TorusGeometry(1, .3, 8, 24), wheelM, 0, 0, 0, wheel);
  const cabins = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const sp = mesh(new T.CylinderGeometry(.08, .08, 9, 6), wheelM, Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0, wheel); sp.rotation.z = a - Math.PI / 2;
    const cab = new T.Group(); cab.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0); wheel.add(cab);
    box(1, 1.1, .9, toon(['#ff8f7a', '#ffd36b', '#8fd0c9', '#c9a2e8'][i % 4]), 0, -.7, 0, cab);
    box(.7, .45, .92, glow('#ffe7b0'), 0, -.6, 0, cab);
    cabins.push(cab);
  }
  { const bulbs = new T.InstancedMesh(new T.SphereGeometry(.16, 6, 6), glow('#fff0b8'), 48); const m = new T.Matrix4();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; m.makeTranslation(Math.cos(a) * 9.3, Math.sin(a) * 9.3, .2); bulbs.setMatrixAt(i, m); } wheel.add(bulbs); }
  for (const s of [-1, 1]) { const leg = box(.4, 12, .4, wheelM, s * 3, -5.5, 0, wheel); leg.rotation.z = s * .26; }

  // ── 건물 공통 ─────────────────────────────────────────
  const fadeables = []; // 카메라와 내 캐릭터 사이를 가리면 흐리게
  function building({x0, x1, z0, z1, h, color, tex, name}) {
    const g = new T.Group(); group.add(g);
    const mats = [];
    const own = (c, extra = {}) => { const m = toon(c, {own: true, ...extra}); mats.push(m); return m; };
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const body = box(w, h, d, own('#ffffff', tex ? {map: tex} : {}), cx, h / 2, cz, g); body.material.color.set(tex ? '#ffffff' : color);
    box(w + .16, .3, d + .16, own(color), cx, h + .1, cz, g); // 지붕 파라펫
    fadeables.push({g, mats, x0: x0 - .4, x1: x1 + .4, z0, z1, h, opacity: 1});
    return {g, own, cx, cz, w, d, h};
  }
  const brickTex = (base = '#9c4a35') => canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6e4a3c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) {
      const off = y % 2 ? 16 : 0; const t = rnd();
      c.fillStyle = t < .3 ? '#a8543c' : t < .6 ? base : t < .85 ? '#8f4231' : '#b46a4e'; c.fillRect(x * 32 + off + 1, y * 16 + 1, 30, 14);
    }
  }, [3, 2]);
  function windowGrid(b, {x0, x1, y0, y1, z, cols = 3, rows = 2, lit = '#ffc677', frame = '#262a2e'}) {
    const fm = b.own(frame), wm = glow(lit);
    const w = x1 - x0, hh = y1 - y0;
    plane(w, hh, wm, (x0 + x1) / 2, (y0 + y1) / 2, z + .01, b.g);
    for (let i = 0; i <= cols; i++) box(.06, hh, .06, fm, x0 + w * i / cols, (y0 + y1) / 2, z + .03, b.g);
    for (let j = 0; j <= rows; j++) box(w, .06, .06, fm, (x0 + x1) / 2, y0 + hh * j / rows, z + .03, b.g);
  }
  function sign(b, text, {x, y, z, w = 2.4, h = .6, bg = '#2a2320', fg = '#ffd59a', size = 64, glowy = true, vertical = false}) {
    const tex = canvasTex(vertical ? 128 : 512, vertical ? 512 : 128, (c, cw, ch) => {
      c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (glowy) { c.shadowColor = fg; c.shadowBlur = 16; }
      if (vertical) { c.font = `${size}px ${FONT}`; const chars = [...text]; chars.forEach((ch2, i) => c.fillText(ch2, cw / 2, ch / (chars.length + 1) * (i + 1))); }
      else { c.font = `${size}px ${FONT}`; const tw = c.measureText(text).width; const s = Math.min(size, size * (cw - 30) / tw); c.font = `${s}px ${FONT}`; c.fillText(text, cw / 2, ch / 2 + 4); }
    });
    return plane(w, h, glowy ? new T.MeshBasicMaterial({map: tex, toneMapped: false}) : toon('#ffffff', {map: tex}), x, y, z, b.g);
  }
  const planters = [];
  function planter(x, z, s = 1) { const g = new T.Group(); g.position.set(x, 0, z); group.add(g); box(.5 * s, .4 * s, .5 * s, toon('#8c8f8a'), 0, .2 * s, 0, g); const l = sphere(.36 * s, toon('#5f8a4a'), 0, .55 * s, 0, g); l.scale.y = .8; planters.push([W(x), z, .38 * s]); }
  function aSign(x, z, text) { // 입간판
    const g = new T.Group(); g.position.set(x, 0, z); group.add(g);
    const tex = canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#2b2a2c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c9a26b'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#f5ead6'; c.textAlign = 'center'; c.font = `26px ${FONT}`; text.split('\n').forEach((l, i) => c.fillText(l, w / 2, 44 + i * 34)); });
    for (const s of [-1, 1]) { const p = plane(.5, .7, toon('#ffffff', {map: tex, side: T.DoubleSide}), 0, .42, s * .12, g); p.rotation.x = s * -.18; if (s < 0) p.rotation.y = Math.PI; }
    planters.push([W(x), z, .32]);
  }
  const obstacles = []; // [x0,x1,z0,z1] 지역 좌표

  // ── 성수 골목: 편의점 · 밤마을 바 · 카페 ─────────────
  { // 밤편의점
    const b = building({x0: -21, x1: -16.6, z0: -4, z1: 2, h: 3.4, color: '#e8e6e0'});
    box(4.4, .7, .1, b.own('#2f6fb3'), -18.8, 3.0, 2.06, b.g);
    sign(b, '밤편의점 24', {x: -18.8, y: 3.0, z: 2.12, w: 4.2, h: .62, bg: '#2f6fb3', fg: '#ffffff', size: 70});
    plane(3.6, 1.9, glow('#e9f6ff'), -18.8, 1.3, 2.02, b.g);
    for (let i = 0; i < 4; i++) box(.05, 1.9, .05, b.own('#9aa4ad'), -20.5 + i * 1.15, 1.3, 2.05, b.g);
    for (let i = 0; i < 3; i++) box(.9, .08, .3, b.own('#ffffff'), -20 + i * 1.2, .9 + (i % 2) * .5, 1.86, b.g);
    // 자판기 · 벤치
    const vm = box(.8, 1.8, .6, toon('#c9433b'), -16.1, .9, 2.8); box(.6, 1.0, .02, glow('#fff3d8'), -16.1, 1.15, 3.11);
    obstacles.push([-16.5, -15.7, 2.5, 3.1]);
    box(1.6, .1, .45, toon('#7a5b45'), -20.2, .45, 3.4); for (const s of [-1, 1]) box(.08, .45, .4, toon('#3a3a3a'), -20.2 + s * .7, .22, 3.4);
    obstacles.push([-21.1, -19.3, 3.15, 3.65]);
    obstacles.push([-21, -16.6, -4, 2]);
  }
  { // 밤마을 바(실내와 이어지는 곳)
    const b = building({x0: -15.5, x1: -9, z0: -4.5, z1: 2, h: 4.6, color: '#7c3a2a', tex: brickTex()});
    windowGrid(b, {x0: -15, x1: -13.4, y0: .9, y1: 2.6, z: 2, cols: 2, rows: 3});
    windowGrid(b, {x0: -11.1, x1: -9.5, y0: .9, y1: 2.6, z: 2, cols: 2, rows: 3});
    windowGrid(b, {x0: -15, x1: -9.5, y0: 3.0, y1: 4.1, z: 2, cols: 6, rows: 1, lit: '#ffb35c'});
    // 문
    box(1.3, 2.3, .12, b.own('#2b201a'), -12.25, 1.15, 2.02, b.g);
    plane(.9, 1.7, glow('#ffb25a'), -12.25, 1.2, 2.1, b.g);
    box(1.8, .12, .9, b.own('#262a2e'), -12.25, 2.55, 2.45, b.g); // 문 위 철제 캐노피
    const lamp = sphere(.12, glow('#ffd59a'), -12.25, 2.4, 2.75, b.g);
    sign(b, '밤마을', {x: -12.25, y: 3.0 - .05, z: 2.13, w: 1.8, h: .5, bg: '#1f1714', fg: '#ffb56b', size: 80});
    // 돌출 세로 간판
    const vs = sign(b, '혼술바', {x: -9.05, y: 3.2, z: 2.4, w: .45, h: 1.6, bg: '#1f1714', fg: '#ff8f6b', size: 84, vertical: true}); vs.rotation.y = Math.PI / 2;
    box(.1, 1.7, .1, b.own('#262a2e'), -9.05, 3.2, 2.12, b.g);
    planter(-14.2, 2.6, .9); planter(-10.3, 2.6, .9); aSign(-11, 3.1, '오늘의 판\n열린 테이블\n있어요');
    const pl = new T.PointLight('#ffb36b', 6, 7, 1.6); pl.position.set(-12.25, 2.6, 3.4); group.add(pl);
    obstacles.push([-15.5, -9, -4.5, 2]);
  }
  { // 노을다방(카페) + 테라스
    const b = building({x0: -8, x1: -3.8, z0: -3.4, z1: 2, h: 5.2, color: '#c9c4bb'});
    plane(3.6, 2.1, glow('#ffd9a3'), -5.9, 1.25, 2.02, b.g);
    for (let i = 0; i < 4; i++) box(.05, 2.1, .05, b.own('#2a2e33'), -7.7 + i * 1.2, 1.25, 2.05, b.g);
    windowGrid(b, {x0: -7.5, x1: -4.3, y0: 2.9, y1: 4.5, z: 2, cols: 3, rows: 1, lit: '#ffcc8a'});
    sign(b, '노을다방', {x: -5.9, y: 2.6, z: 2.1, w: 2.2, h: .42, bg: '#efe6d6', fg: '#7a4b34', size: 72, glowy: false});
    box(4.3, .08, 1.6, b.own('#e7d9bf'), -5.9, 2.4, 2.8, b.g); // 차양
    for (const [px, pz] of [[-7.2, 3.6], [-4.6, 3.6]]) {
      const g = new T.Group(); g.position.set(px, 0, pz); group.add(g);
      cyl(.03, .03, 2.1, toon('#3b3b3b'), 0, 1.05, 0, g); cone(1.0, .5, toon('#d8664b'), 0, 2.2, 0, g, 8);
      cyl(.42, .42, .05, toon('#f1ece4'), 0, .74, 0, g); cyl(.05, .07, .72, toon('#3b3b3b'), 0, .36, 0, g);
      for (const a of [0, Math.PI]) { const ch = new T.Group(); ch.position.set(Math.cos(a) * .7, 0, Math.sin(a) * .7); g.add(ch); box(.38, .05, .38, toon('#8a5c3e'), 0, .45, 0, ch); box(.38, .45, .05, toon('#8a5c3e'), 0, .68, Math.cos(a) > 0 ? 0 : 0, ch).position.x = Math.cos(a) * .17; }
      obstacles.push([px - 1.0, px + 1.0, pz - .5, pz + .5]);
    }
    aSign(-3.4, 2.9, '오늘의 커피\n준비 중\n곧 만나요');
    obstacles.push([-8, -3.8, -3.4, 2]);
  }
  // ── 광장 ──────────────────────────────────────────────
  { // 큰 나무
    const g = new T.Group(); g.position.set(.5, 0, -2.6); group.add(g);
    cyl(.45, .55, .5, toon('#8d8a84'), 0, .25, 0, g, 20); // 화단 테두리
    cyl(.16, .24, 2.4, toon('#6b4a35'), 0, 1.2, 0, g);
    for (let i = 0; i < 7; i++) { const l = sphere(.9 + rnd() * .3, toon(['#5d7d47', '#6a8a4f', '#567340'][i % 3]), (rnd() - .5) * 1.6, 2.6 + rnd() * .9, (rnd() - .5) * 1.4, g); l.scale.y = .8; }
    obstacles.push([-.1, 1.1, -3.2, -2.0]);
    fadeables.push({g, mats: [], x0: -1.3, x1: 2.3, z0: -3.8, z1: -1.4, h: 4, opacity: 1});
    for (const [bx, bz, ry] of [[-1.6, -2.6, Math.PI / 2], [2.6, -2.6, -Math.PI / 2]]) {
      const bg = new T.Group(); bg.position.set(bx, 0, bz); bg.rotation.y = ry; group.add(bg);
      box(1.6, .08, .45, toon('#8e6a4c'), 0, .45, 0, bg); box(1.6, .4, .06, toon('#8e6a4c'), 0, .7, -.2, bg);
      for (const s of [-1, 1]) box(.07, .45, .4, toon('#353535'), s * .7, .22, 0, bg);
      obstacles.push([bx - .3, bx + .3, bz - .85, bz + .85]);
    }
  }
  { // 게시판 · 우체통
    const g = new T.Group(); g.position.set(-2.3, 0, 1.8); group.add(g);
    for (const s of [-1, 1]) cyl(.05, .05, 1.8, toon('#4a3a2e'), s * .7, .9, 0, g);
    const bt = canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#c99d6c'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a3d2b'; c.font = `34px ${FONT}`; c.textAlign = 'center'; c.fillText('마을 게시판', w / 2, 40);
      for (const [x, y, col] of [[30, 64, '#fff6dc'], [140, 70, '#ffe0e0'], [70, 108, '#e3f2ff']]) { c.fillStyle = col; c.fillRect(x, y, 86, 40); } });
    box(1.6, 1.0, .08, toon('#ffffff', {map: bt}), 0, 1.35, 0, g);
    box(1.8, .12, .3, toon('#5a3d2b'), 0, 1.92, 0, g);
    obstacles.push([-3.15, -1.45, 1.6, 2.0]);
    const mb = new T.Group(); mb.position.set(4.0, 0, 2.0); group.add(mb);
    box(.55, 1.0, .45, toon('#d2392f'), 0, .6, 0, mb); cyl(.28, .28, .55, toon('#d2392f'), 0, 1.1, 0, mb).rotation.z = Math.PI / 2;
    box(.4, .05, .02, toon('#2b2b2b'), 0, .85, .24, mb); box(.2, .12, .4, toon('#3a3a3a'), 0, .06, 0, mb);
    obstacles.push([3.65, 4.35, 1.7, 2.3]);
  }
  // ── 호텔 서울밤 ───────────────────────────────────────
  {
    const b = building({x0: 5.6, x1: 11.4, z0: -5.5, z1: 2, h: 8.2, color: '#2f3d38'});
    for (let fl = 0; fl < 3; fl++) windowGrid(b, {x0: 6, x1: 11, y0: 3.2 + fl * 1.65, y1: 4.4 + fl * 1.65, z: 2, cols: 5, rows: 1, lit: fl === 1 ? '#ffd89a' : '#ffc070', frame: '#b08a4a'});
    box(5.8, .12, .12, b.own('#b08a4a'), 8.5, 2.85, 2.04, b.g);
    plane(2.0, 2.2, glow('#ffd7a0'), 8.5, 1.1, 2.02, b.g);
    box(3.2, .14, 1.6, b.own('#1d2522'), 8.5, 2.55, 2.8, b.g); // 캐노피
    for (let i = 0; i < 7; i++) sphere(.06, glow('#fff1c8'), 7.1 + i * .47, 2.46, 3.58, b.g);
    for (const s of [-1, 1]) cyl(.04, .04, 2.5, b.own('#b08a4a'), 8.5 + s * 1.5, 1.25, 3.55, b.g);
    sign(b, '호텔 서울밤', {x: 8.5, y: 2.66, z: 3.62, w: 2.4, h: .26, bg: '#1d2522', fg: '#e8c68a', size: 70});
    const v = sign(b, 'HOTEL', {x: 11.45, y: 5.4, z: 1.6, w: .5, h: 2.2, bg: '#1d2522', fg: '#e8c68a', size: 72, vertical: true}); v.rotation.y = Math.PI / 2;
    planter(6.4, 2.6, 1.1); planter(10.6, 2.6, 1.1);
    obstacles.push([5.6, 11.4, -5.5, 2]); obstacles.push([6.9, 7.1, 3.4, 3.7]); obstacles.push([9.9, 10.1, 3.4, 3.7]);
    const pl = new T.PointLight('#ffd08a', 5, 7, 1.6); pl.position.set(8.5, 2.3, 3.6); group.add(pl);
  }
  // ── 궁궐 돌담길 ───────────────────────────────────────
  const stoneTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#7a756d'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 22) for (let x = -(y % 44 ? 20 : 0); x < w; x += 36 + rnd() * 18) {
      c.fillStyle = ['#a39d93', '#958f86', '#b1aba1', '#8a847b'][Math.floor(rnd() * 4)];
      c.beginPath(); c.roundRect(x + 2, y + 2, 32 + rnd() * 12, 18, 6); c.fill();
    }
  }, [6, 1]);
  { const g = new T.Group(); group.add(g);
    const wall = (x0, x1, z, h = 2.0) => {
      const w = x1 - x0; box(w, h, .7, toon('#ffffff', {map: stoneTex}), (x0 + x1) / 2, h / 2, z, g);
      box(w + .3, .18, 1.1, toon('#3b3d42'), (x0 + x1) / 2, h + .12, z, g);
      const roof = mesh(new T.CylinderGeometry(.5, .5, w + .3, 3, 1), toon('#444851'), (x0 + x1) / 2, h + .35, z, g); roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI; roof.scale.set(1, 1, .55);
      obstacles.push([x0, x1, z - .4, z + .4]);
    };
    wall(12.4, 15.6, 1.4); wall(18.4, 21.6, 1.4);
    // 대문
    const gate = new T.Group(); gate.position.set(17, 0, 1.4); g.add(gate);
    for (const s of [-1, 1]) cyl(.16, .18, 2.8, toon('#7b3a2c'), s * 1.25, 1.4, 0, gate);
    box(2.2, 2.3, .14, toon('#8b4a32'), 0, 1.15, 0, gate);
    box(.04, 2.3, .16, toon('#4a2618'), 0, 1.15, 0, gate);
    for (const s of [-1, 1]) sphere(.06, toon('#d4b04a'), s * .2, 1.2, .1, gate);
    // 단청 보
    const dc = canvasTex(256, 32, (c, w, h) => { const cols = ['#2f8a6b', '#c94a3a', '#2f5fa8', '#f0c04a', '#2f8a6b']; for (let i = 0; i < 16; i++) { c.fillStyle = cols[i % 5]; c.fillRect(i * 16, 0, 16, h); } });
    box(3.0, .32, .4, toon('#ffffff', {map: dc}), 0, 2.85, 0, gate);
    const groof = mesh(new T.CylinderGeometry(.9, .9, 3.6, 3, 1), toon('#3d4048'), 0, 3.35, 0, gate); groof.rotation.z = Math.PI / 2; groof.rotation.x = Math.PI; groof.scale.set(1, 1, .5);
    for (const s of [-1, 1]) { const tip = cone(.12, .5, toon('#3d4048'), s * 1.9, 3.35, 0, gate, 6); tip.rotation.z = s * -1.9; }
    obstacles.push([15.6, 18.4, 1.0, 1.8]);
    // 소나무 · 은은한 바닥 조명
    const pine = (x, z, s = 1) => { const p = new T.Group(); p.position.set(x, 0, z); g.add(p);
      const tr = cyl(.1 * s, .16 * s, 2.6 * s, toon('#6a4834'), .2 * s, 1.3 * s, 0, p); tr.rotation.z = -.15;
      for (const [dx, dy, r] of [[.5, 2.6, .7], [-.3, 2.2, .55], [.1, 3.0, .5], [.7, 2.2, .45]]) { const l = sphere(r * s, toon('#3e5c3c'), dx * s, dy * s, 0, p); l.scale.y = .45; }
      obstacles.push([x - .3, x + .5, z - .3, z + .3]); };
    pine(13.5, -.2, 1.1); pine(20.4, -.4, 1.2); pine(19.8, 6.8); pine(13.2, 7.0, .9);
    for (const x of [13.2, 15, 19, 20.8]) { box(.22, .3, .22, toon('#d8cfb8'), x, .15, 2.1, g); box(.14, .1, .02, glow('#ffd79a'), x, .18, 2.22, g); }
    // 강 쪽으로 이어지는 돌담길(뒤편)
    wall(12.4, 21.6, -6.2, 1.6);
    flat(9, 6.4, toon('#a69c8e'), 17, .014, -3);
  }
  // ── 한옥(돌담 안) ─────────────────────────────────────
  { const g = new T.Group(); g.position.set(17, 0, -3.4); group.add(g);
    box(6, .5, 2.8, toon('#b9ad98'), 0, .25, 0, g);                         // 기단
    box(5.4, 1.8, 2.2, toon('#f1e9d8'), 0, 1.4, 0, g);                       // 흰 벽
    for (let i = -2; i <= 2; i++) { box(.14, 1.9, .14, toon('#7b4a2c'), i * 1.3, 1.4, 1.12, g); }
    box(5.6, .14, .16, toon('#7b4a2c'), 0, 2.3, 1.12, g);
    for (let i = -1; i <= 1; i++) plane(.9, .9, glow('#ffd9a0'), i * 1.3 + .65, 1.35, 1.13, g); // 창호지 불빛
    const roof = mesh(new T.CylinderGeometry(1.7, 1.7, 7.4, 3, 1), toon('#3e424b'), 0, 3.05, 0, g); roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI; roof.scale.set(1, 1, .62);
    box(7.4, .12, .2, toon('#2e3138'), 0, 3.9, 0, g);                         // 용마루
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const e = cone(.16, .9, toon('#3e424b'), sx * 3.6, 2.45, sz * 1.25, g, 6); e.rotation.set(sz * .5, 0, sx * -1.6); }
    obstacles.push([13.8, 20.2, -5, -1.8]);
    fadeables.push({g, mats: [], x0: 13.6, x1: 20.4, z0: -5, z1: -1.8, h: 4, opacity: 1});
  }
  // ── 한강포차(강변) ───────────────────────────────────
  { const g = new T.Group(); g.position.set(6.5, 0, -10.2); group.add(g);
    const tarp = new T.MeshBasicMaterial({color: '#ff7a3a', transparent: true, opacity: .78, toneMapped: false});
    box(3.2, .06, 2.2, tarp, 0, 2.2, 0, g); for (const sx of [-1, 1]) { const w = box(.04, 2.1, 2.2, tarp, sx * 1.6, 1.1, 0, g); }
    box(3.2, 2.1, .04, tarp, 0, 1.1, -1.1, g);
    for (const [x, z] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) cyl(.04, .04, 2.2, toon('#3a3a3a'), x, 1.1, z, g);
    box(1.6, .06, .8, toon('#e8e2d6'), 0, .7, 0, g); cyl(.05, .05, .7, toon('#3a3a3a'), 0, .35, 0, g);
    for (const [x, z] of [[-.9, .6], [.9, .6], [-.9, -.6], [.9, -.6]]) cyl(.18, .18, .4, toon(['#2f6fb3', '#d2392f'][(x > 0) | 0]), x, .2, z, g);
    for (let i = 0; i < 3; i++) { cyl(.05, .05, .2, toon('#2f8a5f'), -.4 + i * .3, .83, 0, g); } // 초록 병
    const sg = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#2b1414'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff5a4a'; c.shadowColor = '#ff5a4a'; c.shadowBlur = 14; c.font = `44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('한강포차', w / 2, h / 2 + 3); });
    plane(1.8, .45, new T.MeshBasicMaterial({map: sg, toneMapped: false}), 0, 2.5, 1.12, g);
    for (let i = 0; i < 8; i++) sphere(.06, glow(['#ffe08a', '#ff9f8a', '#9fe0ff'][i % 3]), -1.5 + i * .43, 2.15 + Math.sin(i) * .06, 1.12, g);
    const pl = new T.PointLight('#ff9a5a', 4, 5, 1.6); pl.position.set(0, 1.8, 0); g.add(pl);
    obstacles.push([4.9, 8.1, -11.3, -9.1]);
  }
  // ── 횡단보도 · 세로 네온 간판 ────────────────────────
  for (let i = 0; i < 6; i++) flat(.45, 3.2, toon('#f3efe6'), -1.4 + i * .75, .02, 6.4);
  { const vsign = (text, x, y, z, bg, fg, ry = 0) => { const t = canvasTex(96, 384, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.shadowColor = fg; c.shadowBlur = 14; c.font = `72px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; [...text].forEach((ch, i, a) => c.fillText(ch, w / 2, h / (a.length + 1) * (i + 1))); });
      const p = plane(.42, 1.7, new T.MeshBasicMaterial({map: t, toneMapped: false, side: T.DoubleSide}), x, y, z); p.rotation.y = ry; };
    vsign('노래방', -16.5, 3.2, 1.2, '#2a1636', '#ff7ad9', Math.PI / 2);
    vsign('치킨', -21.05, 2.6, 1.2, '#2a1a10', '#ffd34a', Math.PI / 2);
    vsign('커피', -3.75, 3.6, 1.4, '#142a2a', '#7ff3e0', Math.PI / 2);
    vsign('호프', 5.55, 2.6, 1.4, '#2a1414', '#ff8a5a', Math.PI / 2);
  }
  // 낮은 앞쪽 화단(가장자리)
  for (let x = -20; x <= 20; x += 4) if (Math.abs(x) > 4) { const h = sphere(.6, toon('#587a45'), x, .3, 8.6); h.scale.set(2.6, .55, .7); }
  // ── 놀이공원 입구(강변 서쪽 끝) ──────────────────────
  { const g = new T.Group(); g.position.set(-20.6, 0, -10.2); g.rotation.y = Math.PI / 2; group.add(g);
    for (const s of [-1, 1]) { cyl(.18, .2, 3.6, toon('#f1e6d4'), s * 1.7, 1.8, 0, g); }
    const arch = mesh(new T.TorusGeometry(1.7, .16, 8, 24, Math.PI), toon('#e8584a'), 0, 3.6, 0, g);
    sign({g}, '밤마을 랜드', {x: 0, y: 4.25, z: .05, w: 2.6, h: .6, bg: '#2b1f3a', fg: '#ffe08a', size: 72});
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; sphere(.08, glow(i % 2 ? '#ffe08a' : '#ff9f8a'), Math.cos(a) * 1.7, 3.6 + Math.sin(a) * 1.7, .2, g); }
    const booth = new T.Group(); booth.position.set(2.6, 0, .6); g.add(booth);
    box(1.2, 1.9, 1.0, toon('#ffd36b'), 0, .95, 0, booth); cone(.95, .7, toon('#e8584a'), 0, 2.25, 0, booth, 4).rotation.y = Math.PI / 4;
    plane(.8, .5, glow('#fff1c8'), 0, 1.2, .51, booth);
    obstacles.push([-21.6, -19.2, -12, -8.4]);
    const chain = box(.04, .04, 3.2, toon('#c9433b'), -20.3, .7, -10.2); // 입장 줄(아직 닫힘)
  }
  // ── 가로등(인스턴싱) · 강변 벤치 ─────────────────────
  const lampPos = [[-17, 6.2], [-9, 6.2], [-1, 6.2], [6, 6.2], [12, 6.2], [19, 6.2], [-17, -8.6], [-8, -8.6], [-1, -8.6], [6, -8.6], [14, -8.6], [-3, -5.5], [4, -5.5]];
  { const poles = new T.InstancedMesh(new T.CylinderGeometry(.05, .07, 3.2, 8), toon('#26292c'), lampPos.length);
    const heads = new T.InstancedMesh(new T.SphereGeometry(.2, 10, 8), glow('#ffd9a0'), lampPos.length); const m = new T.Matrix4();
    lampPos.forEach(([x, z], i) => { m.makeTranslation(x, 1.6, z); poles.setMatrixAt(i, m); m.makeTranslation(x, 3.25, z); heads.setMatrixAt(i, m); obstacles.push([x - .15, x + .15, z - .15, z + .15]); });
    group.add(poles, heads); }
  const glowPool = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,210,150,.55)'); g.addColorStop(1, 'rgba(255,210,150,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  for (const [x, z] of lampPos) { const p = flat(3.2, 3.2, new T.MeshBasicMaterial({map: glowPool, transparent: true, depthWrite: false}), x, .03, z); p.renderOrder = 1; }
  for (const x of [-12, -5, 3, 10, 17]) {
    const bg = new T.Group(); bg.position.set(x, 0, -11.4); group.add(bg);
    box(1.6, .08, .45, toon('#8e6a4c'), 0, .45, 0, bg); box(1.6, .4, .06, toon('#8e6a4c'), 0, .7, .2, bg);
    for (const s of [-1, 1]) box(.07, .45, .4, toon('#353535'), s * .7, .22, 0, bg);
    obstacles.push([x - .85, x + .85, -11.7, -11.1]);
  }
  for (const [x, z] of [[-14, -7.6], [13, -7.4]]) planters.push([W(x), z, 0]); // 잔디는 걸을 수 있음(장식)

  // 흐려질 건물: 그 안의 재질을 모두 건물 전용으로 복제해 둔다
  for (const f of fadeables) { const seen = new Map(); f.mats = []; f.g.traverse(o => { if (!o.isMesh) return; if (!seen.has(o.material)) { const m = o.material.clone(); seen.set(o.material, m); f.mats.push(m); } o.material = seen.get(o.material); }); }

  // ── 마을 주민(데모) ───────────────────────────────────
  const townNpcs = [];
  function npc({species, fur, outfit, x, z, seated = false, heading = 0, route = null, line}) {
    const root = new T.Group(); root.position.set(x, 0, z); root.rotation.y = heading; group.add(root);
    const c = critter({species, fur, outfit, accent: '#fff3c4'}); root.add(c.rig);
    if (seated) { c.legs.forEach(l => l.rotation.x = -1.35); root.position.y = .08; }
    root.traverse(o => { if (o.isMesh) o.userData.ignorePick = true; });
    const n = {root, c, route, ri: 0, phase: rnd() * 6, line, seated, wait: 0}; townNpcs.push(n); return n;
  }
  if (!noNpc) {
  npc({species: 'bear', fur: '#a77a52', outfit: '#6f8fb8', x: -1.6, z: -2.6, seated: true, heading: Math.PI / 2, line: '좋은 저녁이에요'});
  npc({species: 'rabbit', fur: '#f4e8de', outfit: '#d98b6a', x: -5.2, z: 5.0, heading: Math.PI, line: '커피 언제 열려요?'});
  npc({species: 'cat', fur: '#7b6d65', outfit: '#8fb07a', x: 5, z: -10, route: [[5, -10], [-9, -10], [-9, -9.2], [12, -9.2], [12, -10]], line: '강바람 좋다'});
  npc({species: 'dog', fur: '#e1c194', outfit: '#c96a5a', x: 15, z: 4.8, route: [[15, 4.8], [20, 4.8], [20, 5.6], [13.5, 5.6]], line: '돌담길 예쁘죠?'});
  }

  // ── 길찾기 ────────────────────────────────────────────
  const STEP = .3, R = .32;
  function valid(x, z) { // 월드 좌표
    const lx = x - TOWN_X;
    if (lx < TOWN.minX || lx > TOWN.maxX || z < TOWN.minZ || z > TOWN.maxZ) return false;
    for (const [x0, x1, z0, z1] of obstacles) if (lx > x0 - R && lx < x1 + R && z > z0 - R && z < z1 + R) return false;
    for (const [px, pz, r] of planters) if (r && (x - px) ** 2 + (z - pz) ** 2 < (r + R) ** 2) return false;
    return true;
  }
  const cells = [], lookup = new Map();
  const NI = Math.round((TOWN.maxX - TOWN.minX) / STEP), NJ = Math.round((TOWN.maxZ - TOWN.minZ) / STEP);
  for (let i = 0; i <= NI; i++) for (let j = 0; j <= NJ; j++) {
    const x = W(TOWN.minX + i * STEP), z = TOWN.minZ + j * STEP;
    if (valid(x, z)) { const c = {i, j, x, z, key: i + ',' + j}; cells.push(c); lookup.set(c.key, c); }
  }
  function nearest(x, z) { let best = cells[0], d = Infinity; for (const c of cells) { const e = (c.x - x) ** 2 + (c.z - z) ** 2; if (e < d) { d = e; best = c; } } return best; }
  function lineClear(a, b) { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .08); for (let i = 0; i <= n; i++) { const k = n ? i / n : 0; if (!valid(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; } return true; }
  function route(from, to) {
    const s = nearest(from.x, from.z), g = nearest(to.x, to.z);
    const q = [s], par = new Map([[s.key, null]]); let found = false;
    for (let p = 0; p < q.length; p++) {
      const c = q[p]; if (c === g) { found = true; break; }
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const n = lookup.get((c.i + di) + ',' + (c.j + dj));
        if (!n || par.has(n.key)) continue;
        if (di && dj && (!lookup.has((c.i + di) + ',' + c.j) || !lookup.has(c.i + ',' + (c.j + dj)))) continue;
        par.set(n.key, c.key); q.push(n);
      }
    }
    if (!found) return [];
    const chain = []; for (let c = g; c; c = lookup.get(par.get(c.key))) chain.push({x: c.x, z: c.z}); chain.reverse();
    const out = []; let o = from, i = 0;
    while (i < chain.length) { let f = i; for (let j = i; j < Math.min(chain.length, i + 60); j++) if (lineClear(o, chain[j])) f = j; out.push({...chain[f], y: 0}); o = chain[f]; i = f + 1; }
    return out;
  }

  // ── 매 프레임 ─────────────────────────────────────────
  const tmp = new T.Vector3(), q = new T.Quaternion(), AX = new T.Vector3(0, 1, 0);
  function update(now, dt, actor) {
    wheel.rotation.z += dt * .05;
    for (const c of cabins) c.rotation.z = -wheel.rotation.z;
    waterTex.offset.x = (now * .00002) % 1; waterTex.offset.y = (now * .000012) % 1;
    towerTip.material.color.set(Math.sin(now * .003) > 0 ? '#ff4d4d' : '#7a2a2a');
    ringLight.material.color.setHSL(((now * .00005) % 1), .55, .72);
    lotteTip.material.color.set(Math.sin(now * .002) > 0 ? '#ffffff' : '#9ab0ff');
    // 무지개 분수: 다리 옆구리에서 포물선으로 떨어진다
    let k = 0;
    for (let j = 0; j < JETS; j++) {
      const x0 = -52 + j * 4;
      for (let d = 0; d < DROPS; d++) {
        const t = ((now * .00035 + d / DROPS + j * .07) % 1);
        fMat.makeTranslation(x0, 2.4 + 1.6 * Math.sin(Math.PI * t) - 2.6 * t, -38 + t * 6.5);
        fountain.setMatrixAt(k, fMat);
        fColor.setHSL(((j / JETS) + now * .00008) % 1, .85, .68); fountain.setColorAt(k, fColor); k++;
      }
    }
    fountain.instanceMatrix.needsUpdate = true; if (fountain.instanceColor) fountain.instanceColor.needsUpdate = true;
    // 카메라와 나 사이를 가리는 건물은 흐리게
    const ax = actor.position.x - TOWN_X, az = actor.position.z;
    for (const f of fadeables) {
      const block = ax > f.x0 && ax < f.x1 && az < f.z0 + .2 && az > f.z0 - 10;
      const target = block ? .14 : 1;
      if (Math.abs(f.opacity - target) > .01) {
        f.opacity += (target - f.opacity) * Math.min(1, dt * 12);
        for (const m of f.mats) { m.transparent = f.opacity < .99; m.opacity = f.opacity; m.depthWrite = f.opacity > .5; }
      }
    }
    for (const n of townNpcs) {
      const c = n.c;
      if (n.route) {
        if (now < n.wait) { c.legs.forEach(l => l.rotation.x *= .8); continue; }
        const [tx, tz] = n.route[n.ri];
        tmp.set(tx - n.root.position.x, 0, tz - n.root.position.z); const d = tmp.length();
        if (d < .05) { n.ri = (n.ri + 1) % n.route.length; if (n.ri === 0) n.wait = now + 2500; continue; }
        tmp.normalize(); n.root.position.addScaledVector(tmp, Math.min(d, dt * .7));
        q.setFromAxisAngle(AX, Math.atan2(tmp.x, tmp.z)); n.root.quaternion.slerp(q, 1 - Math.exp(-dt * 6));
        n.phase += dt * 8; c.legs[0].rotation.x = Math.sin(n.phase) * .4; c.legs[1].rotation.x = -Math.sin(n.phase) * .4;
        c.arms[0].rotation.x = -Math.sin(n.phase) * .3; c.arms[1].rotation.x = Math.sin(n.phase) * .3;
      } else if (!n.seated) c.rig.position.y = Math.sin(now * .002 + n.phase) * .01;
    }
  }
  function nearNpc(actor) {
    let best = null, bd = 1.3;
    for (const n of townNpcs) { const d = Math.hypot(actor.position.x - W(n.root.position.x), actor.position.z - n.root.position.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  const worldPos = (n, out) => out.set(W(n.root.position.x), n.root.position.y, n.root.position.z);

  return {group, sky, fog, valid, route, update, nearNpc, npcs: townNpcs, worldPos, fadeables};
}
