// 밤마을 v1.0 팀 테스트 — 같은 링크를 연 팀원끼리 실시간으로 만난다.
// Claude 아티팩트 런타임(room · db · user)을 쓴다. 로그인하지 않았거나 이 기능이 없는 화면에서는
// 아무것도 하지 않고, 예전 1인 체험판이 그대로 동작한다.
//
// 입장: 호스트 화면(QR + 1분마다 바뀌는 4자리 코드) → 손님이 코드 입력 → 호스트 화면이 확인하고
// passes/<손님 id> 입장권을 쓴다. 입장권이 있는 사람만 마을에 들어오고, 서로의 화면에도 보인다.
import * as T from './vendor/three.min.mjs';
import {EMOTES, TABLES, SPOTS, PRAISE_TAGS, DRINKS} from './map-data.mjs';

const PASS_MS = 6 * 3600 * 1000, CODE_MS = 60000, SEND_MS = 110;
const NONCE_KEY = 'bam-net-nonce';
const AX = new T.Vector3(0, 1, 0);

function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
// 비밀 seed + 1분 단위 시간창 → 4자리. seed는 호스트만 읽을 수 있다(db 규칙).
export const gateCode = (seed, w) => String(hash53(seed + ':' + w) % 10000).padStart(4, '0');
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hhmm = t => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const $ = id => document.getElementById(id);

export function createOnline(G) {
  const esc = G.esc;
  const net = {status: 'pending', room: null, db: null, user: null, myId: null, isHost: false, hostMode: false, seed: null,
    passes: new Map(), praiseIn: {}, friendsIn: [], friendsOut: [], met: new Map()};
  const remotes = new Map(); // peer label → 원격 플레이어
  let settleReady; const settled = new Promise(r => settleReady = r);
  let lastSend = 0, lastPresence = '', sentKeys = [], lastSig = '', hadPass = false, leaving = false;
  let gateWait = null, pendingReq = null, reqTok = 0, hostTimer = 0, currentReq = null;
  const reqQueue = [], giftWaits = new Map(), giftAccepted = new Map(), attempts = new Map();

  const myNonce = () => { try { return localStorage.getItem(NONCE_KEY) || ''; } catch { return ''; } };
  const setNonce = v => { try { v ? localStorage.setItem(NONCE_KEY, v) : localStorage.removeItem(NONCE_KEY); } catch {} };
  const validPass = p => !!p && p.exp > Date.now();
  const passFor = id => net.passes.get(id);
  // 테스트판 기본값: QR 입장 확인 꺼짐(링크로 들어온 팀원은 바로 입장). 호스트가 켜면 코드 확인.
  function hasPass() { if (!net.gateOn) return true; const p = passFor(net.myId); return validPass(p) && !!p.nonce && p.nonce === myNonce(); }
  const admitted = id => !net.gateOn || validPass(passFor(id));
  // 이벤트 받는 사람은 계정(id)이 아니라 열린 화면(peer)으로 정한다 — 같은 계정으로 여러 기기에서 들어와도 따로 동작
  const myPeer = () => net.room?.peers().find(p => p.sameTab)?.peer ?? null;
  const emit = (topic, data) => net.room?.emit(topic, data).catch(() => {});

  // ── 연결 ────────────────────────────────────────────────
  async function start() {
    await 0;
    try {
      const use = window.__bamNet?.use ?? (window.claude?.use ? window.claude.use.bind(window.claude) : null);
      if (!use) throw 0;
      const [room, db, user] = await Promise.all(['room', 'db', 'user'].map(n => use(n).catch(() => null)));
      if (!room || !db || !user) throw 0;
      const myId = await user.id();
      if (!myId) throw 0;
      Object.assign(net, {room, db, user, myId, isHost: await user.canEdit()});
    } catch { net.status = 'off'; settleReady(); G.onChange(); return; }
    net.status = 'on'; net.gateOn = false;
    net.db.doc('live/config').onSnapshot(s => { net.configLoaded = true; const on = !!(s.exists && s.data().gateOn); if (on !== net.gateOn) { net.gateOn = on; syncPeers(); G.onChange(); } }, () => {});
    net.db.collection('passes').onSnapshot(snap => {
      net.passes = new Map(snap.docs.filter(d => d.exists).map(d => [d.id, d.data()]));
      const now = hasPass();
      if (gateWait && now) { const done = gateWait; gateWait = null; done(true); }
      if (hadPass && !now && !leaving && G.inVillage()) G.onPassLost();
      hadPass = now;
      syncPeers(); if (net.hostMode && G.dialogLabel() === 'HOST · 입장 관리') renderHost();
    }, () => {});
    net.db.doc('praise/' + net.myId).onSnapshot(s => { net.praiseIn = s.exists ? (s.data().counts ?? {}) : {}; }, () => {});
    net.db.collection('inbox').where('to', '==', net.myId).onSnapshot(s => onInbox(s.docs.map(d => ({id: d.id, ...d.data()}))), () => {});
    net.db.collection('friends').where('to', '==', net.myId).onSnapshot(s => { net.friendsIn = s.docs.map(d => ({id: d.id, ...d.data()})); G.onFriends?.(); }, () => {});
    net.db.collection('friends').where('from', '==', net.myId).onSnapshot(s => { net.friendsOut = s.docs.map(d => ({id: d.id, ...d.data()})); G.onFriends?.(); }, () => {});
    net.room.onPeers(() => syncPeers(), () => {});
    net.room.on('checkin', onCheckin, () => {});
    net.room.on('checkres', onCheckres, () => {});
    net.room.on('req', onReq, () => {});
    net.room.on('reqans', onReqAns, () => {});
    net.room.on('reqcancel', onReqCancel, () => {});
    net.room.on('wave', onWave, () => {});
    net.room.on('gift', onGift, () => {});
    net.room.on('giftans', onGiftAns, () => {});
    net.room.on('giftserved', onGiftServed, () => {});
    net.room.on('game', m => { const d = m.data || {}; if (m.sameTab || !d.tb || d.tb !== G.state.table || !d.p) return; const R = remotes.get(m.peer); G.onGame?.(d.p, R?.p.n || '팀원'); }, () => {});
    settleReady(); G.onChange();
  }

  // ── 입장(게이트) ───────────────────────────────────────
  async function gate() {
    await Promise.race([settled, sleep(10000)]);
    if (net.status !== 'on') return true; // 오프라인: 1인 체험판
    for (let i = 0; i < 30 && !net.configLoaded; i++) await sleep(100);
    if (net.isHost) { await ensureOwnPass(); return true; }
    if (hasPass()) return true;
    return new Promise(resolve => showGate(resolve));
  }
  async function ensureOwnPass() {
    if (hasPass()) return;
    const nonce = rand(8); setNonce(nonce);
    await net.db.doc('passes/' + net.myId).set({exp: Date.now() + PASS_MS, at: Date.now(), nonce, host: true}).catch(() => {});
  }
  function showGate(resolve) {
    G.show('QR CHECK-IN', `<h2>매장 QR로 들어왔나요?</h2>
      <p>카운터 호스트 화면의 QR로 이 페이지를 열고, 그 아래 <b>4자리 입장 코드</b>를 입력해요. 코드는 1분마다 바뀌어요.</p>
      <label class="field" for="gateCode"><span>입장 코드</span><input id="gateCode" class="code-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="0000"></label>
      <p class="warn" id="gateMsg" hidden></p>
      <button class="action" id="gateGo">입장 확인</button><button class="secondary" id="gateBack">돌아가기</button>
      <p class="note">팀 테스트 · 호스트 화면이 켜져 있을 때 확인돼요. 확인되면 오늘 밤 6시간 동안 다시 입력하지 않아요(퇴장하면 다시 입력).</p>`, {lock: true});
    const msg = t => { $('gateMsg').textContent = t; $('gateMsg').hidden = !t; };
    $('gateBack').onclick = () => { gateWait = null; G.closeDialog(); resolve(false); };
    $('gateCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
    $('gateGo').onclick = async () => {
      const code = $('gateCode').value;
      if (code.length !== 4) { msg('4자리 숫자를 넣어주세요'); return; }
      const nonce = rand(8); setNonce(nonce);
      $('gateGo').disabled = true; $('gateGo').textContent = '확인 중…'; msg('');
      const tok = Symbol();
      gateWait = ok => { G.closeDialog(); G.status('✅ 입장 확인! 오늘 밤 즐겁게 놀아요'); resolve(ok); };
      gateWait.tok = tok;
      emit('checkin', {code, nonce, n: G.state.profile.name || ''});
      await sleep(9000);
      if (gateWait?.tok === tok && $('gateGo')) { $('gateGo').disabled = false; $('gateGo').textContent = '입장 확인'; msg('호스트 화면에서 답이 없어요. 호스트 화면이 켜져 있는지 확인해 주세요.'); }
    };
  }
  function onCheckres(m) {
    const d = m.data || {}; if (d.to !== net.myId || !gateWait || !$('gateGo')) return;
    if (!d.ok) { const t = gateWait.tok; $('gateGo').disabled = false; $('gateGo').textContent = '입장 확인'; $('gateMsg').textContent = d.why || '코드가 맞지 않아요. 호스트 화면의 최신 코드를 확인해 주세요.'; $('gateMsg').hidden = false; gateWait.tok = t; }
  }
  // 호스트 화면이 켜진 탭이 코드를 확인하고 입장권을 쓴다. 보낸 사람 id는 플랫폼이 붙여서 위조할 수 없다.
  async function onCheckin(m) {
    if (!net.hostMode || !net.seed || !m.by) return;
    const d = m.data || {}, now = Date.now();
    const list = (attempts.get(m.by) ?? []).filter(t => now - t < 5 * 60000); list.push(now); attempts.set(m.by, list);
    if (list.length > 6) { emit('checkres', {to: m.by, ok: false, why: '시도가 너무 많아요. 5분 뒤에 다시 해주세요.'}); return; }
    const w = Math.floor(now / CODE_MS);
    const ok = typeof d.code === 'string' && [w, w - 1].some(x => gateCode(net.seed, x) === d.code) && typeof d.nonce === 'string' && /^[0-9a-f]{16}$/.test(d.nonce);
    if (!ok) { emit('checkres', {to: m.by, ok: false}); return; }
    await net.db.doc('passes/' + m.by).set({exp: now + PASS_MS, at: now, nonce: d.nonce, nick: String(d.n || '').slice(0, 12)}).catch(() => {});
    emit('checkres', {to: m.by, ok: true});
  }

  // ── 호스트 화면 ────────────────────────────────────────
  async function ensureSeed() {
    if (net.seed) return net.seed;
    const ref = net.db.doc('gate/secret');
    const s = await ref.get().catch(() => null);
    if (s?.exists && s.data().seed) net.seed = s.data().seed;
    else { net.seed = rand(16); await ref.set({seed: net.seed, at: Date.now()}).catch(() => {}); }
    return net.seed;
  }
  async function openHost() {
    if (!net.isHost) return;
    await ensureSeed();
    net.hostMode = true; await ensureOwnPass(); G.onChange();
    renderHost();
    clearInterval(hostTimer);
    hostTimer = setInterval(() => {
      if (G.dialogLabel() !== 'HOST · 입장 관리' || !$('gateNow')) return;
      const w = Math.floor(Date.now() / CODE_MS), left = CODE_MS - Date.now() % CODE_MS;
      $('gateNow').textContent = gateCode(net.seed, w);
      $('gateBar').style.width = (left / CODE_MS * 100).toFixed(1) + '%';
      $('gateLeft').textContent = Math.ceil(left / 1000) + '초 뒤 바뀜';
    }, 500);
  }
  function nickOf(id) {
    const peer = net.room?.peers().find(p => p.by === id && p.presence?.n);
    return peer?.presence.n || passFor(id)?.nick || '';
  }
  function renderHost() {
    const w = Math.floor(Date.now() / CODE_MS), left = CODE_MS - Date.now() % CODE_MS;
    const online = new Set(net.room.peers().filter(p => p.presence?.in).map(p => p.by));
    const list = [...net.passes.entries()].filter(([, p]) => validPass(p)).sort((a, b) => b[1].at - a[1].at);
    G.show('HOST · 입장 관리', `<div class="gate-host">
        <img src="${G.qrImg ?? 'qr.png'}" alt="밤마을 링크 QR" width="168" height="168">
        <div class="gate-code"><small>입장 코드</small><b id="gateNow">${gateCode(net.seed, w)}</b>
          <i class="gate-bar"><span id="gateBar" style="width:${(left / CODE_MS * 100).toFixed(1)}%"></span></i><small id="gateLeft">${Math.ceil(left / 1000)}초 뒤 바뀜</small></div>
      </div>
      <p class="note">팀원은 QR로 링크를 열고 이 4자리를 입력해요. 이 창을 닫아도 <b>이 탭이 열려 있는 동안</b> 호스트 모드가 입장을 확인해요. 호스트용 태블릿이나 노트북에 띄워두세요.</p>
      <h3>오늘 입장 ${list.length}명</h3>
      <ul class="pass-list">${list.map(([id, p]) => `<li><div><b>${esc(nickOf(id) || '(프로필 입력 중)')}</b><small>${hhmm(p.at)} 입장${online.has(id) ? ' · <i class="on">● 마을에 있음</i>' : ''}</small></div>
        ${id === net.myId ? '<em>호스트</em>' : `<button data-revoke="${esc(id)}">내보내기</button>`}</li>`).join('') || '<li class="empty">아직 아무도 없어요</li>'}</ul>
      <label class="toggle-row"><input type="checkbox" id="gateToggle" ${net.gateOn ? 'checked' : ''}> QR 입장 코드 확인 켜기 <small>${net.gateOn ? '켜짐 · 코드를 넣은 사람만 입장' : '꺼짐 · 링크로 들어오면 바로 입장(테스트 기본값)'}</small></label>
      <button class="secondary" id="hostOff">호스트 모드 끄기</button>`, {onClose: () => G.afterHost?.()});
    document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = () => { b.disabled = true; net.db.doc('passes/' + b.dataset.revoke).delete().catch(() => {}); });
    $('gateToggle').onchange = async e => { e.target.disabled = true; await net.db.doc('live/config').set({gateOn: e.target.checked}).catch(() => {}); net.gateOn = e.target.checked; renderHost(); };
    $('hostOff').onclick = () => { net.hostMode = false; clearInterval(hostTimer); G.closeDialog(); G.onChange(); G.status('호스트 모드를 껐어요. 새 입장 확인이 멈춰요.'); };
  }

  // ── 내 상태 보내기 ─────────────────────────────────────
  function sendPresence(now) {
    if (now - lastSend < SEND_MS) return; lastSend = now;
    const inV = G.inVillage() && hasPass();
    let p;
    if (inV) { p = G.me(); sentKeys = Object.keys(p); }
    else { p = {in: 0}; for (const k of sentKeys) if (k !== 'in') p[k] = null; }
    const s = JSON.stringify(p);
    if (s === lastPresence) return;
    lastPresence = s;
    net.room.presence(p).catch(() => {});
  }

  // ── 다른 사람 ──────────────────────────────────────────
  const lookKey = p => [p.c, p.sp, p.fu, p.ex, p.ac].join('|');
  function addRemote(peer) {
    const p = peer.presence;
    const root = new T.Group(); G.scene.add(root);
    root.position.set(+p.x || 0, +p.y || 0, +p.z || 0);
    const c = G.critter({species: p.sp || 'fox', fur: p.fu || '#f08a3c', outfit: p.c || '#cddc83', accent: '#f4b942', extra: p.ex || 'none'});
    root.add(c.rig);
    if (p.ac && p.ac !== 'none') G.addAccessory?.(c.head, p.ac);
    root.traverse(o => { if (o.isMesh) { o.userData.ignorePick = true; } });
    // 손가락으로 누르기 쉽게 몸 크기보다 조금 큰 투명 판정 기둥
    const hitbox = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.6, 10), new T.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
    hitbox.position.y = .8; hitbox.userData.ignorePick = true; root.add(hitbox);
    const tag = document.createElement('button'); tag.className = 'npc-tag player-tag'; tag.hidden = true;
    $('worldLabels').appendChild(tag);
    const R = {peer: peer.peer, by: peer.by, p, root, c, tag, color: lookKey(p), phase: 0, jy: 0, jv: 0, lastEa: p.ea, lastJa: p.ja, lastPa: p.pa, lastHt: p.ht, punchAt: -1e9, hitAt: -1e9, localHitAt: -1e9, q: new T.Quaternion(), pet: null};
    tag.onclick = () => openPlayer(R);
    remotes.set(peer.peer, R);
    return R;
  }
  function removeRemote(R) {
    G.scene.remove(R.root); R.tag.remove();
    if (R.pet) G.scene.remove(R.pet.group);
    remotes.delete(R.peer);
  }
  function syncPeers() {
    if (net.status !== 'on') return;
    const seen = new Set();
    // 유령 정리: '자리 비움'인데 같은 기기(by)나 같은 이름으로 지금 활동 중인 사람이 있으면(나 포함) 예전 화면이라 숨긴다.
    // 같은 기기의 자리 비움이 여러 개면 가장 최근 것 하나만 남긴다.
    const list = net.room.peers().filter(peer => !peer.sameTab && peer.kind === 'viewer' && peer.presence?.in && admitted(peer.by));
    const activeBy = new Set(list.filter(x => !x.presence.away).map(x => x.by)), activeName = new Set(list.filter(x => !x.presence.away).map(x => x.presence.n));
    if (G.inVillage()) { activeBy.add(net.myId); activeName.add(G.state.profile.name); }
    const newestAway = new Map();
    for (const x of list) if (x.presence.away) { const k = x.by || x.peer, o = newestAway.get(k); if (!o || (x.updatedAt ?? 0) > (o.updatedAt ?? 0)) newestAway.set(k, x); }
    for (const peer of list) {
      const p = peer.presence;
      if (p.away && (activeBy.has(peer.by) || activeName.has(p.n) || newestAway.get(peer.by || peer.peer) !== peer)) continue;
      seen.add(peer.peer);
      let R = remotes.get(peer.peer);
      if (R && R.color !== lookKey(p)) { removeRemote(R); R = null; }
      if (!R) R = addRemote(peer);
      R.p = p; R.by = peer.by;
      R.tag.innerHTML = `${p.t ? `<small class="ttl">〈${esc(p.t)}〉</small>` : ''}<b class="mood-dot ${esc(p.md || 'talk')}"></b>${esc(p.n || '손님')} <i>${G.genderMark(p.g)}</i>${p.pt ? '<span>🐾</span>' : ''}${p.away ? '<small class="away">💤 자리 비움</small>' : ''}`;
      // 폰이 잠들어도 캐릭터와 자리는 그대로. 이름표에 '자리 비움'만 붙인다.
      R.tag.classList.toggle('is-away', !!p.away);
    }
    for (const [k, R] of remotes) if (!seen.has(k)) removeRemote(R);
    // 방장이 연 판의 제목을 따라간다
    for (const t of TABLES) if (t.open && G.state.owned !== t.id) {
      const o = ownerOf(t.id), base = t.type === 'after' ? '빈 2인석' : '빈 테이블';
      const title = o ? (o.p.tt || base) : base;
      if (t.title !== title) { t.title = title; t.opener = o?.p.op || ''; const sp = SPOTS.find(s => s.id === t.id); if (sp) sp.title = title; }
    }
    // 방장이 떠났는데 내가 그 판에 앉아 있으면 내가 방장이 된다
    const mine = G.state.table && G.tableOf(G.state.table);
    if (mine?.open && G.state.owned !== mine.id && !ownerOf(mine.id)) G.becomeOwner(mine);
    const sig = [...remotes.values()].map(R => [R.peer, R.p.n, R.p.tb, R.p.s, R.p.own, R.p.tt, R.p.md, R.p.t].join('|')).sort().join(';');
    if (sig !== lastSig) { lastSig = sig; G.onChange(); }
  }
  const atTable = id => [...remotes.values()].filter(R => R.p.tb === id);
  const ownerOf = id => { const list = atTable(id); return list.find(R => R.p.own) ?? list[0] ?? null; };
  const takenSeats = id => new Set(atTable(id).map(R => R.p.s).filter(s => Number.isInteger(s) && s >= 0));
  const byId = id => [...remotes.values()].find(R => R.by === id);

  const petOff = new T.Vector3(), petTarget = new T.Vector3(), tmp = new T.Vector3(), q = new T.Quaternion();
  function animateRemote(R, now, dt) {
    const p = R.p, root = R.root, c = R.c;
    const tx = +p.x || 0, ty = +p.y || 0, tz = +p.z || 0;
    const dx = tx - root.position.x, dz = tz - root.position.z, dist = Math.hypot(dx, dz);
    if (dist > 3 || Math.abs(ty - root.position.y) > 1.5) root.position.set(tx, ty, tz);
    else { const k = 1 - Math.exp(-dt * 10); root.position.x += dx * k; root.position.z += dz * k; root.position.y += (ty - root.position.y) * k; }
    R.q.setFromAxisAngle(AX, +p.r || 0); root.quaternion.slerp(R.q, 1 - Math.exp(-dt * 12));
    if (p.tb) { c.legs.forEach(l => l.rotation.x = -1.35); c.rig.position.y = 0; }
    else if (p.w || dist > .06) {
      R.phase += dt * 12; const s = .48;
      c.legs[0].rotation.x = Math.sin(R.phase) * s; c.legs[1].rotation.x = -Math.sin(R.phase) * s;
      c.arms[0].rotation.x = -Math.sin(R.phase) * s * .8; c.arms[1].rotation.x = Math.sin(R.phase) * s * .8;
      c.rig.position.y = Math.abs(Math.sin(R.phase)) * .04;
    } else { for (const part of [...c.legs, ...c.arms]) part.rotation.x *= .85; c.rig.position.y = Math.sin(now * .002) * .009; }
    if (p.ja !== R.lastJa) { R.lastJa = p.ja; if (p.ja) { R.jv = 4.2; R.jy = .0001; } }
    if (R.jy > 0) { R.jv -= 12 * dt; R.jy += R.jv * dt; if (R.jy <= 0) { R.jy = 0; R.jv = 0; } c.rig.position.y += R.jy; c.arms[0].rotation.x = c.arms[1].rotation.x = -2.5; }
    if (p.pa !== R.lastPa) { // 때리기: 동작을 보여주고, 주먹이 뻗는 순간 바로 앞에 내가 있으면 맞는다(서 있을 때만 밀림)
      R.lastPa = p.pa; R.punchAt = now;
      if (p.pa && G.inVillage()) setTimeout(() => {
        const me = G.actor.position, dx = me.x - root.position.x, dz = me.z - root.position.z, d = Math.hypot(dx, dz), r = +R.p.r || 0;
        if (d < 1.35 && d > 0 && (dx * Math.sin(r) + dz * Math.cos(r)) / d > .35 && !G.state.table) G.onPunched?.(R);
      }, 60);
    }
    if (p.ht !== R.lastHt) { // 누가 맞았다: '> <' 표정 + 휘청. 내가 때려서 이미 보여준 거면 이펙트는 생략
      R.lastHt = p.ht;
      if (p.ht && now - R.localHitAt > 900) { G.hitFx?.(root.position); R.hitAt = now; }
    }
    const pt = now - R.punchAt;
    if (pt >= 0 && pt < 380) {
      const ext = pt < 90 ? -.35 * pt / 90 : Math.min(1, (pt - 90) / 50) * (1 - (pt - 90) / 290);
      c.arms[1].rotation.x = -1.6 * Math.max(0, ext) + .5 * Math.max(0, -ext); c.rig.rotation.y = -.35 * Math.max(0, ext);
      if (c.fist) c.fist.scale.setScalar(1 + 1.4 * Math.max(0, ext));
    } else { c.rig.rotation.y = 0; if (c.fist && c.fist.scale.x !== 1) c.fist.scale.setScalar(1); }
    const ht = now - R.hitAt, hurt = ht >= 0 && ht < 850;
    if (c.ouch && c.ouch.visible !== hurt) { c.ouch.visible = hurt; for (const o of c.ouch.userData.hide) o.visible = !hurt; }
    if (hurt && ht < 420) { const k = ht / 420; c.rig.rotation.x = -.35 * (1 - k); c.rig.rotation.z = Math.sin(k * 22) * .16 * (1 - k); }
    else if (c.rig.rotation.x || c.rig.rotation.z) { c.rig.rotation.x = 0; c.rig.rotation.z = 0; }
    if (p.ea !== R.lastEa) { R.lastEa = p.ea; const e = EMOTES.find(e => e.id === p.e); if (e && p.ea) G.bubbleOver(root, e.text, e.bg, 3000, 2.05); }
    if (p.pt && !R.pet) R.pet = G.makePet(p.pt, p.pf || '#f2b675');
    if (!p.pt && R.pet) { G.scene.remove(R.pet.group); R.pet = null; }
    if (R.pet) {
      const g = R.pet.group, seated = !!p.tb;
      petOff.set(seated ? .55 : .45, 0, seated ? .35 : -.45).applyQuaternion(root.quaternion);
      petTarget.set(root.position.x + petOff.x, seated ? (G.levelOf(p.tb)) : root.position.y, root.position.z + petOff.z);
      if (g.position.distanceTo(petTarget) > 4) g.position.copy(petTarget);
      const moving = g.position.distanceTo(petTarget) > .08;
      g.position.x += (petTarget.x - g.position.x) * (1 - Math.exp(-dt * 3.5)); g.position.z += (petTarget.z - g.position.z) * (1 - Math.exp(-dt * 3.5));
      if (moving) { tmp.set(petTarget.x - g.position.x, 0, petTarget.z - g.position.z); if (tmp.lengthSq() > 1e-4) { q.setFromAxisAngle(AX, Math.atan2(tmp.x, tmp.z)); g.quaternion.slerp(q, 1 - Math.exp(-dt * 8)); } }
      R.pet.phase += dt * (moving ? 14 : 2);
      R.pet.legs[0].rotation.x = moving ? Math.sin(R.pet.phase) * .6 : 0; R.pet.legs[1].rotation.x = moving ? -Math.sin(R.pet.phase) * .6 : 0;
      // 높이는 매 프레임 새로 정한다(더하면 점프할 때마다 쌓여서 펫이 날아다님)
      g.position.y = petTarget.y + R.jy * .8 + (moving ? Math.abs(Math.sin(R.pet.phase)) * .05 : 0);
    }
  }

  function tick(now, dt) {
    if (net.status !== 'on') return;
    sendPresence(now);
    for (const R of remotes.values()) animateRemote(R, now, dt);
    const tb = G.state.table;
    if (tb) for (const R of remotes.values()) if (R.p.tb === tb && R.by && !net.met.has(R.by)) net.met.set(R.by, {name: R.p.n || '손님', g: R.p.g, table: tb, by: R.by});
  }
  const v = new T.Vector3();
  function overlay() {
    const W = G.view.clientWidth, H = G.view.clientHeight;
    for (const R of remotes.values()) {
      v.copy(R.root.position); v.y += 1.62 + R.jy;
      const d = R.root.position.distanceTo(G.actor.position);
      v.project(G.camera);
      const vis = d < 9 && v.z > -1 && v.z < 1 && Math.abs(v.x) < .95 && Math.abs(v.y) < .92;
      R.tag.hidden = !vis;
      if (vis) { R.tag.style.left = (v.x + 1) / 2 * W + 'px'; R.tag.style.top = (-v.y + 1) / 2 * H + 'px'; }
    }
  }

  // ── 플레이어 카드 · 손 흔들기 · 한 잔 보내기 ─────────
  function openPlayer(R) {
    if (R.p.away) return openAway(R);
    const p = R.p, t = p.tb ? G.tableOf(p.tb) : null;
    const seatedWithMe = G.state.table && p.tb === G.state.table;
    G.show('TEAMMATE · 팀원', `${p.t ? `<p class="kicker">〈${esc(p.t)}〉</p>` : ''}<h2>${esc(p.n || '손님')} <i class="g">${G.genderMark(p.g)}</i> <em class="ok">QR 입장</em></h2>
      <p class="meta"><b class="mood-dot ${esc(p.md || 'talk')}"></b>${esc(G.moodShort(p.md))}${t ? ` · T${t.number} ${esc(t.title)}${p.own ? ' 👑' : ''}` : ' · 걷는 중'}</p>
      <details class="more"><summary>자세히 (나이 · 직업 · MBTI)</summary><p class="meta profile-line">${p.a ? esc(p.a) + '세 · ' : ''}${esc(p.j || '')}${p.m ? ' · ' + esc(p.m) : ''}</p></details>
      <button class="action" id="pWave">👋 손 흔들기</button>
      ${G.state.table ? '<button class="secondary" id="pGift">🍸 한 잔 보내기</button>' : ''}
      ${t && !seatedWithMe ? '<button class="secondary" id="pTable">이 테이블 살펴보기</button>' : ''}
      <p class="note">실제 팀원이에요. 🌙 현장에서는 연락처·친구 신청·칭찬을 부탁하지 않아요. 퇴장한 뒤 ‘오늘의 기억’에서 전해요.</p>`);
    $('pWave').onclick = () => { emit('wave', {to: R.peer}); G.wave(); G.closeDialog(); G.status(`${p.n}님에게 손을 흔들었어요`); };
    if ($('pGift')) $('pGift').onclick = () => G.openMenu({to: {name: p.n || '손님', remote: R, root: R.root}});
    if ($('pTable')) $('pTable').onclick = () => G.openTable(t);
  }
  // ── 자리 비운 사람에게 남기기: 돌아오면(폰을 다시 켜면) 바로 알림으로 뜬다 ──
  const NOTES = ['돌아오면 같이 한잔해요 🍻', '저 지금 바에 있어요', '테이블에 자리 맡아뒀어요', '먼저 가요, 다음에 봐요 👋', '아까 얘기 재밌었어요!'];
  function openAway(R) {
    const p = R.p, t = p.tb ? G.tableOf(p.tb) : null;
    G.show('TEAMMATE · 자리 비움', `<h2>${esc(p.n || '손님')} <i class="g">${G.genderMark(p.g)}</i> <em class="away-badge">💤 자리 비움</em></h2>
      <p class="meta">${t ? `T${t.number} ${esc(t.title)} 자리 그대로` : '잠깐 화면을 껐어요'}</p>
      <p>지금은 화면을 안 보고 있어요. 남겨두면 돌아왔을 때 바로 알려줘요.</p>
      <button class="action" id="aWave">👋 손 흔들어 두기</button>
      <button class="secondary" id="aNote">💬 한마디 남기기</button>
      <button class="secondary" id="aDrink">🍸 한 잔 맡겨두기</button>`);
    const done = msg => { G.closeDialog(); G.status(msg); };
    $('aWave').onclick = () => { leave(R, {kind: 'wave'}); done(`${p.n}님이 돌아오면 손 흔든 걸 알려줄게요`); };
    $('aNote').onclick = () => {
      G.show('💬 한마디 남기기', `<h2>${esc(p.n)}님에게 남길 말</h2><div class="note-pick">${NOTES.map((x, i) => `<button class="secondary" data-note="${i}">${esc(x)}</button>`).join('')}</div>
        <p class="note">현장 규칙대로 자유 채팅 대신 정해진 말만 남겨요.</p>`);
      $('modalContent').querySelectorAll('[data-note]').forEach(b => b.onclick = () => { leave(R, {kind: 'note', text: NOTES[+b.dataset.note]}); done('남겨뒀어요. 돌아오면 바로 보여요'); });
    };
    $('aDrink').onclick = () => {
      G.show('🍸 한 잔 맡겨두기', `<h2>${esc(p.n)}님에게 맡겨둘 한 잔</h2><div class="note-pick drinks">${DRINKS.slice(0, 12).map(d => `<button class="secondary" data-dr="${d.id}"><b style="color:${d.color}">●</b> ${esc(d.name)}</button>`).join('')}</div>
        <p class="note">돌아와서 받기를 누르면 그때 바에서 만들어 자리로 가져다줘요. 마음만 받으면 결제되지 않아요.</p>`);
      $('modalContent').querySelectorAll('[data-dr]').forEach(b => b.onclick = () => { const d = DRINKS.find(x => x.id === b.dataset.dr); leave(R, {kind: 'drink', drink: d.name, glass: d.glass, color: d.color}); done(`${G.eulreul(d.name)} 맡겨뒀어요 · 돌아오면 알려줘요`); });
    };
  }
  function leave(R, item) {
    if (net.status !== 'on' || !R.by) return;
    net.db.collection('inbox').doc().set({to: R.by, from: net.myId, fromNick: G.state.profile.name || '팀원', at: Date.now(), ...item}).catch(() => {});
  }
  // 받는 쪽: 화면이 꺼져 있으면 알림(가능한 기기에서) + 탭 제목 숫자, 화면을 보면 하나씩 띄운다
  let inbox = [], inboxBusy = false; const notified = new Set(), baseTitle = document.title;
  function onInbox(list) {
    inbox = list.filter(x => x.to === net.myId).sort((a, b) => a.at - b.at);
    document.title = inbox.length && document.hidden ? `(${inbox.length}) ${baseTitle}` : baseTitle;
    for (const x of inbox) if (!notified.has(x.id)) {
      notified.add(x.id);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('밤마을', {body: inboxText(x), tag: 'bam-' + x.id, icon: 'favicon.svg'}); } catch {}
      }
    }
    pumpInbox();
  }
  const inboxText = x => x.kind === 'wave' ? `👋 ${x.fromNick}님이 손을 흔들었어요` : x.kind === 'note' ? `💬 ${x.fromNick}: ${x.text}` : x.kind === 'thanks' ? `🥂 ${x.fromNick}님이 맡겨둔 ${G.eulreul(String(x.drink))} 받았어요` : `🍸 ${x.fromNick}님이 ${x.drink} 한 잔을 맡겨뒀어요`;
  function pumpInbox() {
    if (inboxBusy || !inbox.length || document.hidden || !G.inVillage()) return;
    if (G.dialogLabel()) { setTimeout(pumpInbox, 1500); return; }
    const x = inbox[0]; inboxBusy = true;
    const finish = msg => { net.db.doc('inbox/' + x.id).delete().catch(() => {}); inbox = inbox.filter(y => y.id !== x.id); inboxBusy = false; G.closeDialog(); if (msg) G.status(msg); setTimeout(pumpInbox, 500); };
    const back = remotes.size && [...remotes.values()].find(R => R.by === x.from);
    G.hideCalm?.();
    if (x.kind === 'drink') {
      G.show('🍸 자리 비운 사이에', `<h2>${esc(x.fromNick)}님이 ${esc(G.eulreul(String(x.drink)))} 맡겨뒀어요</h2><p>받으면 바에서 만들어 자리로 가져다드려요.</p>
        <button class="action" id="ibYes">고마워요, 받을게요</button><button class="secondary" id="ibNo">마음만 받을게요</button>`, {lock: true});
      $('ibYes').onclick = () => {
        net.db.collection('inbox').doc().set({to: x.from, from: net.myId, fromNick: G.state.profile.name || '팀원', at: Date.now(), kind: 'thanks', drink: x.drink}).catch(() => {});
        finish(`${x.fromNick}님에게 고맙다고 전했어요 · 곧 나와요`);
        setTimeout(() => { G.serveToMe(x.glass, x.color, x.drink); G.status(`🎁 ${x.fromNick}님이 맡겨둔 ${G.iga(String(x.drink))} 나왔어요!`); if (back) G.bubbleOver(back.root, '건배!', '#ffdbe8', 2200); }, 3500);
      };
      $('ibNo').onclick = () => finish('마음만 받았어요');
    } else {
      G.show(x.kind === 'thanks' ? '🥂 전해졌어요' : '💌 자리 비운 사이에', `<h2>${esc(inboxText(x))}</h2><p class="meta">${new Date(x.at).getHours()}:${String(new Date(x.at).getMinutes()).padStart(2, '0')}</p>
        ${x.kind !== 'thanks' && back ? '<button class="action" id="ibWave">👋 답인사</button>' : ''}<button class="${x.kind !== 'thanks' && back ? 'secondary' : 'action'}" id="ibOk">확인</button>`, {lock: true});
      if ($('ibWave')) $('ibWave').onclick = () => { emit('wave', {to: back.peer}); G.wave(); finish(`${x.fromNick}님에게 손을 흔들었어요`); };
      $('ibOk').onclick = () => finish('');
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { document.title = baseTitle; setTimeout(pumpInbox, 800); } });

  function onWave(m) {
    if (m.sameTab) return;
    const R = remotes.get(m.peer); if (!R) return;
    G.bubbleOver(R.root, '👋 안녕!', '#ffffff', 2200);
    if (m.data?.to === myPeer()) G.status(`👋 ${R.p.n}님이 나에게 손을 흔들어요`);
  }
  // 보내는 쪽: 상대가 받기를 눌러야 제조가 시작된다.
  function sendGift(o, R, cb) {
    giftWaits.set(o.id, {cb, R});
    emit('gift', {to: R.peer, oid: o.id, drink: o.drink});
    setTimeout(() => { const w = giftWaits.get(o.id); if (w) { giftWaits.delete(o.id); cb(false, 'timeout'); } }, 40000);
  }
  function onGiftAns(m) {
    const d = m.data || {}; if (d.to !== myPeer()) return;
    const w = giftWaits.get(d.oid); if (!w) return;
    giftWaits.delete(d.oid); w.cb(!!d.ok);
  }
  function giftServed(o, R) { emit('giftserved', {to: R.peer, oid: o.id, drink: o.drink, glass: o.glass, color: o.color}); }
  const giftQueue = [];
  function onGift(m) {
    const d = m.data || {}; if (d.to !== myPeer() || m.sameTab) return;
    if (G.state.profile.mood !== 'talk') { emit('giftans', {to: m.peer, oid: d.oid, ok: false}); return; }
    giftQueue.push({m, d}); pumpGift();
  }
  function pumpGift() {
    if (!giftQueue.length) return;
    if (G.dialogLabel()) { setTimeout(pumpGift, 1500); return; }
    const {m, d} = giftQueue.shift();
    const R = remotes.get(m.peer), name = R?.p.n || '팀원';
    G.hideCalm?.();
    G.show('🎁 한 잔 도착', `<h2>${esc(name)}님이 ${esc(G.eulreul(String(d.drink || '한 잔')))} 보내고 싶어해요</h2>
      <p>받으면 바에서 만들어 자리로 가져다드려요. 마음만 받아도 상대에게는 “마음만 받을게요”로만 전해지고, 결제되지 않아요.</p>
      <button class="action" id="gYes">고마워요, 받을게요</button><button class="secondary" id="gNo">마음만 받을게요</button>`);
    const answer = ok => { emit('giftans', {to: m.peer, oid: d.oid, ok}); if (ok) giftAccepted.set(m.peer + ':' + d.oid, true); G.closeDialog(); G.status(ok ? `${name}님에게 고맙다고 전했어요` : '마음만 받았어요'); setTimeout(pumpGift, 400); };
    $('gYes').onclick = () => answer(true); $('gNo').onclick = () => answer(false);
  }
  function onGiftServed(m) {
    const d = m.data || {}; if (d.to !== myPeer() || !giftAccepted.has(m.peer + ':' + d.oid)) return;
    giftAccepted.delete(m.peer + ':' + d.oid);
    const R = remotes.get(m.peer);
    G.serveToMe(d.glass, d.color, d.drink);
    G.status(`🎁 ${R?.p.n ?? '팀원'}님이 보낸 ${G.iga(String(d.drink))} 나왔어요!`);
    if (R) G.bubbleOver(R.root, '건배!', '#ffdbe8', 2200);
  }

  // ── 방장에게 같이 앉기 요청 ────────────────────────────
  function requestSeat(t) {
    const o = ownerOf(t.id); if (!o) return;
    try { G.session.request(t.id); } catch (e) { G.status(e.message); return; }
    const tok = ++reqTok; pendingReq = {t, by: o.by, peer: o.peer, tok};
    emit('req', {to: o.peer, tb: t.id});
    G.refresh();
    G.show('REQUEST · T' + t.number, `<h2>${esc(o.p.n || '방장')}님에게 물어보는 중이에요</h2>
      <p>방장이 수락하면 자리로 걸어가 앉아요. 패스하면 “지금은 자리가 어려워요”로만 전해져요.</p>
      <button class="secondary" id="rqCancel">요청 취소</button>`, {lock: true});
    $('rqCancel').onclick = () => { cancelReq(true); G.closeDialog(); G.status('요청을 취소했어요'); };
    setTimeout(() => {
      if (pendingReq?.tok !== tok) return;
      cancelReq(true);
      G.show('T' + t.number, '<h2>지금은 답이 없어요</h2><p>방장이 화면을 안 보고 있나 봐요. 조금 뒤에 다시 물어보거나 다른 판을 둘러봐요.</p><button class="action" id="rqOk">알겠어요</button>');
      $('rqOk').onclick = G.closeDialog;
    }, 45000);
  }
  function cancelReq(tell) {
    if (!pendingReq) return;
    if (tell) emit('reqcancel', {to: pendingReq.peer, tb: pendingReq.t.id});
    pendingReq = null; G.session.cancelRequest(); G.refresh();
  }
  function onReqAns(m) {
    const d = m.data || {}; if (d.to !== myPeer() || !pendingReq || d.tb !== pendingReq.t.id) return;
    const {t} = pendingReq; pendingReq = null;
    if (!d.ok) {
      G.session.declineRequest(); G.refresh();
      G.show('T' + t.number, '<h2>지금은 자리가 어려워요</h2><p>다른 판을 둘러볼까요? 누가 거절했는지는 알 수 없어요.</p><button class="action" id="rqOk">괜찮아요</button>');
      $('rqOk').onclick = G.closeDialog; return;
    }
    G.closeDialog(); G.status('수락됐어요! 자리로 가요');
    G.walkAndSit(t);
  }
  function onReq(m) {
    const d = m.data || {}; if (d.to !== myPeer() || m.sameTab) return;
    if (G.state.table !== d.tb) { emit('reqans', {to: m.peer, tb: d.tb, ok: false}); return; }
    reqQueue.push({by: m.by, peer: m.peer, tb: d.tb}); pumpReq();
  }
  function onReqCancel(m) {
    const d = m.data || {}; if (d.to !== myPeer()) return;
    const i = reqQueue.findIndex(r => r.peer === m.peer); if (i >= 0) reqQueue.splice(i, 1);
    if (currentReq?.peer === m.peer && G.dialogLabel()?.startsWith('JOIN REQUEST')) { currentReq = null; G.closeDialog(); G.status('상대가 요청을 취소했어요'); }
  }
  function pumpReq() {
    if (!reqQueue.length) return;
    if (G.dialogLabel()) { if (!reqQueue[0].nudged) { reqQueue[0].nudged = true; G.status('💌 같이 앉고 싶다는 요청이 와 있어요 · 지금 창을 닫으면 보여요'); } setTimeout(pumpReq, 1500); return; }
    const r = reqQueue.shift(), R = remotes.get(r.peer) ?? byId(r.by), t = G.tableOf(r.tb);
    if (!R || G.state.table !== r.tb) { emit('reqans', {to: r.peer, tb: r.tb, ok: false}); pumpReq(); return; }
    if (G.session.occupancy(t.id) >= t.seats.length) { emit('reqans', {to: r.peer, tb: r.tb, ok: false}); pumpReq(); return; }
    currentReq = r;
    const p = R.p;
    G.hideCalm?.();
    G.show('JOIN REQUEST · T' + t.number, `<h2>${esc(p.n || '팀원')} <i class="g">${G.genderMark(p.g)}</i>님이 같이 앉고 싶어해요</h2>
      <p class="meta">${p.t ? `〈${esc(p.t)}〉 · ` : ''}${p.a ? esc(p.a) + '세 · ' : ''}${esc(p.j || '')}${p.m ? ' · ' + esc(p.m) : ''}</p>
      <p class="note">실제 팀원의 요청이에요. 패스해도 상대에게는 “지금은 자리가 어려워요”로만 전해져요.</p>
      <button class="action" id="rqAccept">수락</button><button class="secondary" id="rqPass">이번엔 패스</button>`);
    const answer = ok => { currentReq = null; emit('reqans', {to: r.peer, tb: r.tb, ok}); G.closeDialog(); G.status(ok ? `${p.n}님을 수락했어요. 자리로 오는 중이에요` : `${p.n}님에게 정중히 전했어요`); if (ok) G.onAccepted?.(); setTimeout(pumpReq, 400); };
    $('rqAccept').onclick = () => answer(true); $('rqPass').onclick = () => answer(false);
  }

  // ── 오늘의 기억(퇴장 후): 칭찬 · 친구 신청 ────────────
  async function praise(toId, tagIdx) {
    const ref = net.db.doc('praise/' + toId), tag = PRAISE_TAGS[tagIdx];
    const s = await ref.get().catch(() => null);
    const counts = {...(s?.exists ? s.data().counts ?? {} : {})}; counts[tag] = (counts[tag] ?? 0) + 1;
    await ref.set({counts}).catch(() => {});
  }
  async function friendRequest(toId, toNick) {
    const existing = net.friendsOut.find(f => f.to === toId) ?? net.friendsIn.find(f => f.from === toId);
    if (existing) return existing.status;
    net.friendsOut.push({id: `${net.myId}__${toId}`, from: net.myId, to: toId, toNick, status: 'sent'});
    await net.db.doc(`friends/${net.myId}__${toId}`).set({from: net.myId, to: toId, fromNick: G.state.profile.name, toNick, status: 'sent', at: Date.now()}).catch(() => {});
    return 'sent';
  }
  async function acceptFriend(docId) { await net.db.doc('friends/' + docId).update({status: 'friend'}).catch(() => {}); }
  const friendStatus = id => (net.friendsOut.find(f => f.to === id) ?? net.friendsIn.find(f => f.from === id))?.status ?? null;

  function leaveVillage() {
    leaving = true; setNonce(''); hadPass = false;
    for (const R of [...remotes.values()]) removeRemote(R);
    if (net.status !== 'on') return;
    lastPresence = ''; sendPresence(performance.now() + SEND_MS);
    setTimeout(() => { leaving = false; }, 2000);
  }
  function metList() { const list = [...net.met.values()]; net.met.clear(); return list; }

  start();
  return {net, settled, gate, openHost, tick, overlay, atTable, ownerOf, takenSeats, requestSeat, sendGift, giftServed,
    shareGame: (tb, p) => emit('game', {tb, p}),
    openPlayer,
    pickRoots: () => [...remotes.values()].map(R => R.root),
    byRoot: root => [...remotes.values()].find(R => R.root === root) ?? null,
    praise, friendRequest, acceptFriend, friendStatus, leaveVillage, metList, hasPass,
    isHere: id => !!net.room?.peers().some(p => p.by === id && !p.sameTab && p.presence?.in),
    pumpInbox: () => setTimeout(pumpInbox, 6000),
    playHit: R => { const now = performance.now(); R.localHitAt = now; R.hitAt = now; },
    get count() { return remotes.size; }, players: () => [...remotes.values()]};
}
