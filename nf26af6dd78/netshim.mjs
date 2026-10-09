// 밤마을 — Claude 밖(일반 웹 주소)에서 쓰는 실시간 연결.
// online.mjs가 쓰는 room · db · user 모양을 공개 MQTT 브로커(웹소켓) 위에 똑같이 만들어 준다.
// 테스트용: 공개 브로커라 같은 방 이름을 아는 사람은 메시지를 볼 수 있다. 실제 서비스에서는 전용 서버로 바꾼다.
import mqtt from './vendor/mqtt.esm.js';

// 차례대로 시도한다(모두 같은 순서라 같은 서버에서 만난다). shiftr는 443 포트라 회사·공용망에서도 잘 열린다.
const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://public:public@public.cloud.shiftr.io', 'wss://broker.emqx.io:8084/mqtt'];
const errors = [];
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const store = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }};

export function install({brokers = BROKERS} = {}) {
  const params = new URLSearchParams(location.search);
  // v2.8: 방 이름은 비밀번호에서 만든 키로만 정해진다(링크·코드만으로는 같은 방에 들어올 수 없다). 테스트 도구용 ?room은 ?broker와 함께일 때만.
  const testRoom = params.get('broker') && params.get('room');
  const ROOM = (testRoom || ('k' + (window.__bamKey || 'locked'))).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32);
  const P = `bamvillage/v1/${ROOM}`;
  const custom = params.get('broker'); if (custom && /^wss?:\/\//.test(custom)) brokers = [custom]; // 테스트용 브로커 지정
  let uid = store.get('bam-uid'); if (!uid) { uid = 'u_' + rand(10); store.set('bam-uid', uid); }
  if (params.has('host')) store.set('bam-host', '1');
  const isHost = store.get('bam-host') === '1';
  // 기기(브라우저) 하나 = 캐릭터 하나: peer 이름을 기기 번호에서 만든다. 탭을 여러 개 열거나 닫았다 열어도 같은 캐릭터다.
  const peerId = 'p_' + uid.replace(/^u_/, '').slice(0, 14);
  // 같은 기기에서 탭이 여러 개면 마지막에 연 탭만 조종한다. 나머지는 연결을 끊고 '다른 화면에서 열려 있어요'를 띄운다.
  const tabAt = Date.now() + Math.random();
  let passive = false;
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('bam-tab-' + ROOM) : null;
  bc?.addEventListener('message', e => {
    if (e.data?.t !== 'claim' || passive || e.data.at < tabAt) return;
    passive = true;
    try { client?.end(false); } catch {} // 정상 종료라 '자리 비움'(will)이 나가지 않는다
    dispatchEvent(new CustomEvent('bam-passive'));
  });
  bc?.postMessage({t: 'claim', at: tabAt});
  const AWAY_MS = 20 * 60000, STALE_MS = 40000; // 연결이 끊겨도 20분 동안은 '잠깐 자리 비움'으로 남아 있다

  // ── 연결: 브로커를 차례로 시도 ───────────────────────
  let client = null;
  const ready = (async () => {
    for (const url of brokers) {
      const ok = await new Promise(res => {
        const c = mqtt.connect(url, {clientId: 'bam_' + peerId + '_' + rand(2), clean: true, reconnectPeriod: 3000, connectTimeout: 7000, keepalive: 30,
          will: {topic: `${P}/w/${peerId}`, payload: '1', retain: true, qos: 0}}); // 갑자기 끊기면 '자리 비움' 표시만
        const fail = () => { c.end(true); res(null); };
        const timer = setTimeout(() => { errors.push(url.replace(/^wss:\/\/([^@]*@)?/, '').split(/[:/]/)[0] + ': 응답 없음'); fail(); }, 8000);
        c.once('connect', () => { clearTimeout(timer); res(c); });
        c.once('error', e => { clearTimeout(timer); errors.push(url.replace(/^wss:\/\/([^@]*@)?/, '').split(/[:/]/)[0] + ': ' + (e?.message || 'error').slice(0, 60)); fail(); });
      });
      if (ok && passive) { ok.end(false); return false; }
      if (ok) { client = ok; break; }
    }
    if (!client) return false;
    client.on('message', onMessage);
    await new Promise(r => client.subscribe([`${P}/p/+`, `${P}/w/+`, `${P}/e/+`, `${P}/db/#`], {qos: 0}, r));
    // 다시 연결되면(폰을 다시 켰을 때 등) 자리 비움 표시를 지우고 내 상태를 다시 알린다
    client.on('connect', () => { setAway(false); publishPresence(); });
    document.addEventListener('visibilitychange', () => {
      if (passive) return;
      if (document.hidden) setAway(true);
      else { if (!client.connected) client.reconnect(); setAway(false); publishPresence(); }
    });
    setTimeout(() => { dbReady = true; for (const f of dbWaiters.splice(0)) f(); notifyDb(); }, 1200);
    publishPresence();
    setInterval(publishPresence, 8000, true);
    setInterval(sweep, 5000);
    addEventListener('pagehide', () => { if (!passive) try { setAway(true); } catch {} });
    setAway(false);
    return true;
  })();

  // ── room ─────────────────────────────────────────────
  let myPresence = {}, presenceTimer = 0, connectedNow = false;
  const others = new Map(); // peer → {by, presence, seen}
  const peerL = new Set(), topicL = new Map();
  let snapshot = Object.freeze([]);
  const meRow = () => Object.freeze({peer: peerId, by: uid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({...myPresence}), updatedAt: Date.now()});
  function rebuild() {
    snapshot = Object.freeze([meRow(), ...[...others.entries()].map(([peer, o]) => Object.freeze({peer, by: o.by, isMe: o.by === uid, sameTab: false, kind: 'viewer', guest: false, presence: o.away ? Object.freeze({...o.presence, away: 1}) : o.presence, updatedAt: o.seen}))]);
    for (const h of peerL) { try { h({peers: snapshot, joined: [], left: [], updated: []}); } catch (e) { console.error(e); } }
  }
  function setAway(on) { try { client?.publish(`${P}/w/${peerId}`, on ? '1' : '', {retain: true, qos: 0}); } catch {} }
  function publishPresence() {
    if (!client) return;
    client.publish(`${P}/p/${peerId}`, JSON.stringify({by: uid, presence: myPresence, t: Date.now(), h: document.hidden ? 1 : 0}), {retain: true, qos: 0});
  }
  function sweep() {
    const now = Date.now(); let changed = false;
    for (const [k, o] of others) {
      if (now - o.seen > AWAY_MS) { others.delete(k); changed = true; }
      else if (now - o.seen > STALE_MS && !o.away) { o.away = true; changed = true; }
    }
    if (changed) rebuild();
  }
  // 같은 기기(같은 uid)에서 예전에 열었던 탭이 '자리 비움'으로 남아 있으면 지운다: 새 탭이 곧 그 사람이다
  function purgeGhost(peer) {
    const o = others.get(peer); if (!o || !o.away || o.by !== uid || peer === peerId) return false;
    others.delete(peer);
    client?.publish(`${P}/p/${peer}`, '', {retain: true}); client?.publish(`${P}/w/${peer}`, '', {retain: true});
    return true;
  }
  function onMessage(topic, buf) {
    const rest = topic.slice(P.length + 1), text = buf.toString();
    if (rest.startsWith('p/')) {
      const peer = rest.slice(2); if (peer === peerId) return;
      if (!text) { if (others.delete(peer)) rebuild(); return; }
      try { const m = JSON.parse(text); const age = Date.now() - (m.t || 0); if (age > AWAY_MS) return;
        const prev = others.get(peer);
        others.set(peer, {by: String(m.by || ''), presence: Object.freeze(m.presence || {}), seen: Date.now() - Math.max(0, Math.min(age, AWAY_MS)), away: !!m.h || (prev?.away && !('h' in m) && age > 1000) || age > STALE_MS}); purgeGhost(peer); rebuild(); } catch {}
    } else if (rest.startsWith('w/')) {
      const peer = rest.slice(2); if (peer === peerId) return;
      const o = others.get(peer); if (!o) return;
      const away = text === '1'; if (o.away !== away) { o.away = away; if (!away) o.seen = Date.now(); purgeGhost(peer); rebuild(); }
    } else if (rest.startsWith('e/')) {
      const t = rest.slice(2);
      try { const m = JSON.parse(text); const self = m.peer === peerId;
        for (const h of topicL.get(t) ?? []) h({peer: m.peer, by: m.by ?? null, isMe: m.by === uid, sameTab: self, kind: 'viewer', guest: false, topic: t, data: m.data}); } catch {}
    } else if (rest.startsWith('db/')) {
      const path = rest.slice(3);
      if (!text) cache.delete(path); else { try { cache.set(path, JSON.parse(text)); } catch {} }
      notifyDb();
    }
  }
  const room = Object.freeze({
    emit: async (topic, data) => { await ready; client?.publish(`${P}/e/${topic}`, JSON.stringify({peer: peerId, by: uid, data})); },
    on: (topic, h) => { if (!topicL.has(topic)) topicL.set(topic, new Set()); topicL.get(topic).add(h); return () => topicL.get(topic).delete(h); },
    presence: async patch => {
      const p = {...myPresence}; for (const [k, v] of Object.entries(patch)) { if (v === null) delete p[k]; else p[k] = v; } myPresence = p;
      clearTimeout(presenceTimer); presenceTimer = setTimeout(publishPresence, 90); rebuild();
    },
    peers: () => snapshot,
    onPeers: h => { peerL.add(h); setTimeout(() => h({peers: snapshot, joined: snapshot, left: [], updated: []}), 0); return () => peerL.delete(h); },
    connected: () => !!client?.connected,
    onConnection: h => { setTimeout(() => h(!!client?.connected), 0); return () => {}; },
    join: async () => { throw {code: 'not_permitted'}; }
  });

  // ── db(보존 메시지로 만든 아주 작은 공유 문서) ─────────
  const cache = new Map(); let dbReady = false; const dbWaiters = []; const dbSubs = new Set();
  const waitDb = () => dbReady ? Promise.resolve() : new Promise(r => dbWaiters.push(r));
  function notifyDb() { if (dbReady) for (const f of dbSubs) f(); }
  const snapDoc = path => { const d = cache.get(path); return {id: path.split('/').pop(), exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined, metadata: {fromCache: false, hasPendingWrites: false}}; };
  const write = (path, data) => { if (data) cache.set(path, data); else cache.delete(path); notifyDb(); return ready.then(() => client?.publish(`${P}/db/${path}`, data ? JSON.stringify(data) : '', {retain: true, qos: 1})); };
  function docRef(path) {
    return {id: path.split('/').pop(), path,
      get: async () => { await ready; await waitDb(); return snapDoc(path); },
      set: async data => write(path, data),
      update: async data => { await waitDb(); const cur = cache.get(path); if (!cur) throw {code: 'invalid_argument'}; return write(path, {...cur, ...data}); },
      delete: async () => write(path, null),
      onSnapshot(next) { let last; const f = () => { const s = JSON.stringify(cache.get(path) ?? null); if (s !== last) { last = s; next(snapDoc(path)); } }; dbSubs.add(f); waitDb().then(f); return () => dbSubs.delete(f); },
      collection: p => colRef(path + '/' + p)};
  }
  function query(path, filters) {
    const depth = path.split('/').length + 1;
    const run = () => { const docs = [...cache.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === depth)
      .filter(k => filters.every(([f, op, v]) => op === '==' ? cache.get(k)[f] === v : true)).sort().map(snapDoc);
      return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {fromCache: false, hasPendingWrites: false}}; };
    return {where: (f, op, v) => query(path, [...filters, [f, op, v]]), orderBy: () => query(path, filters), limit: () => query(path, filters),
      get: async () => { await ready; await waitDb(); return run(); },
      onSnapshot(next) { let last; const f = () => { const r = run(); const s = JSON.stringify(r.docs.map(x => [x.id, x.data()])); if (s !== last) { last = s; next(r); } }; dbSubs.add(f); waitDb().then(f); return () => dbSubs.delete(f); }};
  }
  function colRef(path) { return Object.assign(query(path, []), {path, doc: id => docRef(path + '/' + (id ?? rand(8))), add: async data => { const r = docRef(path + '/' + rand(8)); await r.set(data); return r; }}); }
  const db = Object.freeze({doc: docRef, collection: colRef});

  // ── user ─────────────────────────────────────────────
  const user = Object.freeze({id: async () => uid, isOwner: async () => isHost, canEdit: async () => isHost, can: async () => true,
    me: async () => ({id: uid, name: '', avatarUrl: '', color: '#888', email: null, isOwner: isHost, canEdit: isHost}),
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, {id: i, name: '', avatarUrl: '', color: '#888', email: null, isMe: i === uid, guest: false}]))});

  const caps = {room, db, user};
  // 모두가 같은 공개 실시간 방에서 만난다(Claude 링크든 GitHub 주소든, 로그인 여부와 상관없이).
  // 공개 서버에 못 붙으면(회사망·차단 등) Claude 로그인 사용자는 Claude 자체 실시간으로 대신 연결한다.
  const native = window.claude?.use ? window.claude.use.bind(window.claude) : null;
  window.__bamNet = {room: ROOM, ready, get broker() { return client?.options?.href ?? null; },
    use: name => ready.then(ok => ok ? (caps[name] ?? null) : (native ? native(name).catch(() => null) : null)),
    get via() { return client ? 'mqtt' : native ? 'claude' : 'off'; }, errors, get passive() { return passive; }};
  return ready;
}
