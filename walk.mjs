// 밤마을 v0.7 — 카메라, 입력, 군중, 상호작용, 다이얼로그.
import * as T from './vendor/three.min.mjs';
import {createWorld, HOST_STEP} from './world.mjs';
import {route, valid, navs, levelRoute, levelY} from './navigation.mjs';
import {TABLES, SPOTS, WANDERERS, LOUNGERS, DRINKS, ENTRY, ROOM, MOODS, JACKETS, ACCESSORIES, DRINK_MINUTES, PROFILE_TAGS, ROUND_MINUTES, NEXT_TOPICS, VILLAGES, RESIDENT_COUNT, RING, OBSTACLES,
  MEZZ_Y, MEZZ, STAIRS, WELCOME_ZONE, PEOPLE, PRAISE_TAGS, COIN_RULES, SHOP, DEMO_WALLET, OPEN_TOPICS, STAMP_GOAL, VILLAGE_RULES, EMOTES, TITLES, CHAR_SPECIES, CHAR_FURS, CHAR_EXTRAS, CHAR_DEFAULT, SPECIES_FUR, BASIC_SPECIES, TEST_MODE} from './map-data.mjs';
import {createSession} from './session.mjs';
import {createOnline} from './online.mjs';
import {createTown, TOWN_SPOTS, TOWN_SPAWN, TOWN_X} from './town.mjs';
import {createGames} from './games.mjs';

const $ = id => document.getElementById(id);
const view = $('viewport'), dialog = $('villageDialog'), calm = $('calm');
const session = createSession(), state = session.state;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const won = n => n.toLocaleString('ko-KR') + '원';
const batchim = w => { const c = w.charCodeAt(w.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
const ro = w => { const c = w.charCodeAt(w.length - 1); const j = (c - 0xAC00) % 28; return w + (batchim(w) && j !== 8 ? '으로' : '로'); };
const iga = w => w + (batchim(w) ? '이' : '가');
const eulreul = w => w + (batchim(w) ? '을' : '를');
const tableOf = id => TABLES.find(t => t.id === id);
// 방문일은 한국 시간 달력 날짜(임시 기준: 자정에서 날짜가 바뀐다)
const kstDate = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const PET_UNLOCK_DAYS = 3; // 임시: 서로 다른 날 3번 방문하면 펫 입양 가능(운영 결정 필요)

// ── 렌더러와 카메라 (v0.4에서 승인된 가까운 시점 유지) ─────────
const renderer = new T.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
view.appendChild(renderer.domElement);

const world = createWorld();
const {makePet, npcPets, scene, actor, rig, legs, arms, eyes, shadow, marker, entities, npcs, glassGroup, setGlass, setFill, setAccessory, makeBubble, jacket, lampShades, emoteTextures, flags, clock} = world;
const host = npcs.find(n => n.host);
const indoorObjs = scene.children.filter(o => o !== actor && o !== world.shadow && o !== world.marker);
const indoorSky = {bg: scene.background, fog: scene.fog};

const camera = new T.PerspectiveCamera(36, 1, .1, 80);
const cameraOffset = new T.Vector3(.8, 4.5, 8.5);
// 마을 전경 보기: 잠깐 뒤로 물러나 남산·한강·관람차를 보여준 뒤 원래 시점으로 돌아온다.
const camOff = cameraOffset.clone(), WIDE = new T.Vector3(1.5, 12, 27), lookAt = new T.Vector3();
let wideUntil = 0;
const followPoint = new T.Vector3(actor.position.x, .6, actor.position.z - .75), desiredFocus = new T.Vector3();
camera.position.copy(followPoint).add(cameraOffset); camera.lookAt(followPoint); camera.updateMatrixWorld();

let path = [], arrival = '', onArrival = null, phase = 0, last = 0, frameId = 0, walking = false, failed = false;
let flowToken = 0, escorting = false, nearestEntity = null, lastNear = '', onDialogClose = null, toastTimer = 0, orderGen = 0;
let place = 'bar', town = null, townLabels = [], games = null, fadeT = 0;
let online = null, inVillage = false, netEmote = {id: null, at: 0}, netJumpAt = 0;
let hostTask = null, drink = null, giftDemoDone = false, praiseDemoDone = false, level = 1, tutorial = null, myPet = null;
const npcLevel = n => n.root.position.y > 2 ? 2 : 1;
const genderMark = g => g === 'F' ? '♀' : g === 'M' ? '♂' : '';
const bubbles = [];
let jumpY = 0, jumpV = 0, landAt = -1e9;
const JUMP_SPEED = 4.2, GRAVITY = 12;
const keys = new Set(), speed = 2.3, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const raycaster = new T.Raycaster(), ndc = new T.Vector2(), floor = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3(), projected = new T.Vector3();
const right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
const up = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), right).normalize();
const direction = new T.Vector3(), targetQ = new T.Quaternion(), axis = new T.Vector3(0, 1, 0), temp = new T.Vector3();
const roaming = WANDERERS.map((data, i) => ({data, npc: npcs.find(n => n.id === data.id), index: i % data.route.length, path: [], waitUntil: i * 1400, pauseUntil: 0}));
const residentInfo = id => WANDERERS.find(d => d.id === id) || LOUNGERS.find(d => d.id === id);

// ── 지갑(코인·상점): 방문과 주문으로만 쌓인다. 이 브라우저에만 저장(체험) ──
const wallet = Object.assign({coins: DEMO_WALLET.coins, visits: DEMO_WALLET.visits, owned: [], equipped: {jacket: 'lime', accessory: 'none', pet: null},
  stamps: 0, coupons: 0, titles: [], title: null, praiseIn: {}, movieJoins: 0, movieVisits: [], visitDays: [], look: {...CHAR_DEFAULT}, memories: [], friends: [], rulesSeen: false},
  (() => { try { return JSON.parse(localStorage.getItem('bam-wallet-v2') || 'null'); } catch { return null; } })() ?? {});
for (const f of wallet.friends) f.key ??= 'npc:' + f.name; // v0.9 친구 기록 → 사람 키
// 테스트판: 이전 지갑에도 시작 코인 1,000을 한 번 채워 준다
if (!wallet.bonus1000) { if (wallet.visits > 0) wallet.coins += 1000; wallet.bonus1000 = true; }

// ── 해금: 행동하면서 자연스럽게 열리는 밤마을 ─────────────
// 배우기 위한 해금(LEARN)은 MY의 '전체 기능 보기'로 먼저 열 수 있고, 보상(펫·칭호)은 조건을 채워야 한다.
const LEARN = ['order', 'emote', 'stamps', 'openRoom', 'games', 'postcards', 'titles', 'coins', 'shop', 'charFull', 'town'];
const UNLOCK_TEXT = {order: '🍸 자리에서 한 잔 주문할 수 있어요', emote: '😊 표현 버튼이 생겼어요', stamps: '🎟 스탬프 카드가 생겼어요 · MY에서 볼 수 있어요',
  openRoom: '👑 이제 빈 테이블에서 직접 판을 열 수 있어요', games: '🎲 다음에 앉으면 술게임을 할 수 있어요', postcards: '💌 오늘 밤이 엽서로 남았어요',
  titles: '🏷 칭호가 생겼어요', coins: '🪙 코인', shop: '👕 상점', charFull: '✨ 캐릭터 꾸미기', town: '🌆 마을 산책'};
wallet.unlocked ??= wallet.visits > 0 ? [...LEARN] : []; // 이미 놀아본 사람은 다 열린 상태로 시작
const has = f => wallet.unlocked.includes(f) || (wallet.allFeatures && LEARN.includes(f));
const toastQueue = []; let toastBusy = false;
function quietToast(text) { toastQueue.push(text); if (!toastBusy) nextToast(); }
function nextToast() { const t = toastQueue.shift(); if (!t) { toastBusy = false; return; } toastBusy = true; status(t); setTimeout(nextToast, 3700); }
function unlock(f, {quiet = false} = {}) {
  if (wallet.unlocked.includes(f)) return false;
  wallet.unlocked.push(f); wallet.newDot = true; saveWallet(); applyUnlocks();
  if (!quiet && UNLOCK_TEXT[f]) quietToast(UNLOCK_TEXT[f]);
  return true;
}
function applyUnlocks() {
  $('coinButton').hidden = !has('coins');
  $('emoteBtn').hidden = !has('emote'); if (!has('emote')) $('emotePanel').hidden = true;
  $('journalButton').classList.toggle('dot', !!wallet.newDot);
}
function saveWallet() { try { localStorage.setItem('bam-wallet-v2', JSON.stringify(wallet)); } catch {} }
const titleName = id => TITLES.find(t => t.id === id)?.name;
function grantTitle(id) {
  if (wallet.titles.includes(id)) return;
  wallet.titles.push(id); if (!wallet.title) wallet.title = id; saveWallet(); refresh();
  if (has('titles')) quietToast(`🏷 칭호를 얻었어요 · 〈${titleName(id)}〉`); session.record('칭호 획득 · ' + titleName(id));
}
function titleProgress(t) {
  if (!t.goal) return null;
  const v = t.key === 'visitDays' ? wallet.visitDays.length : t.key === 'movieVisits' ? wallet.movieVisits.length
    : t.key === 'praiseTotal' ? Object.values(wallet.praiseIn).reduce((a, b) => a + b, 0) : (wallet.praiseIn[t.key.split(':')[1]] ?? 0);
  return Math.min(v, t.goal);
}
function checkTitles() { for (const t of TITLES) if (t.goal && titleProgress(t) >= t.goal) grantTitle(t.id); }
function addCoins(n, why) {
  wallet.coins += n; saveWallet(); renderCoins();
  if (!has('coins')) { session.record(`코인 +${n} · ${why}`); return; }
  const f = document.createElement('span'); f.className = 'coin-float'; f.textContent = `+${n}`; $('coinButton').appendChild(f); setTimeout(() => f.remove(), 1400);
  session.record(`코인 +${n} · ${why}`);
}
const coinText = () => TEST_MODE.infiniteCoins ? '∞' : wallet.coins.toLocaleString('ko-KR');
function renderCoins() { $('coinAmount').textContent = coinText(); }

// ── 월드 라벨 ─────────────────────────────────────────────
const labels = SPOTS.map(s => {
  const b = document.createElement('button');
  b.className = 'world-label' + (s.kind === 'table' ? ' is-table' : '') + (s.kind === 'exit' ? ' is-exit' : '');
  b.onclick = () => selectEntity(s.id); b.dataset.entity = s.id;
  $('worldLabels').appendChild(b);
  return {spot: s, button: b, anchor: entities.get(s.id).anchor};
});

// ── 판 타이머: 남은 시간이 끝나면 새로운 판(주제)이 열린다 ──
const rounds = Object.fromEntries(TABLES.map(t => [t.id, {ends: Date.now() + (ROUND_MINUTES[t.id] ?? 20) * 60000, next: 0}]));
const minsLeft = t => Math.max(1, Math.ceil((rounds[t.id].ends - Date.now()) / 60000));
function newRound(t) {
  const list = NEXT_TOPICS[t.id] ?? [], r = rounds[t.id];
  if (list.length) { const [title, opener] = list[r.next++ % list.length]; t.title = title; t.opener = opener; }
  r.ends = Date.now() + 25 * 60000;
  const spot = SPOTS.find(s => s.id === t.id); if (spot) spot.title = t.title;
  for (const n of npcs.filter(n => n.id.startsWith(t.id + '-'))) bubbleOver(n.root, '오!', '#e2f6d5', 1800 + Math.random() * 600);
  status(`🎲 새로운 판이 열렸어요 · T${t.number} ${t.title}`);
  session.record(`새로운 판 · T${t.number} ${t.title}`);
  refresh();
}
setInterval(() => {
  for (const t of TABLES) if (Date.now() > rounds[t.id].ends) {
    if (t.id === state.table) { if (!rounds[t.id].asked) { rounds[t.id].asked = true; askRound(t); } }
    else if (!t.open) newRound(t);
  }
  refreshLabels();
}, 5000);
// 내 테이블의 판 시간이 끝나도 자동으로 바꾸지 않는다: 계속 / 새 주제 중에서 고른다.
function askRound(t) {
  const el = $('roundCard');
  el.innerHTML = `<p>⏱ “${esc(t.title)}” 판 시간이 다 됐어요</p><div class="tut-row"><button id="rcKeep" class="ghost">계속 이야기</button><button id="rcNew">새 주제</button></div>`;
  el.hidden = false;
  $('rcKeep').onclick = () => { rounds[t.id].ends = Date.now() + 15 * 60000; rounds[t.id].asked = false; el.hidden = true; status('좋아요, 이 판을 15분 더 이어가요'); refreshLabels(); };
  $('rcNew').onclick = () => { rounds[t.id].asked = false; el.hidden = true; newRound(t); if (state.table === t.id) showConversation(t); };
}

// 주민 이름표(닉네임 + 성별). 누르면 프로필.
const npcTags = npcs.filter(n => !n.host).map(n => {
  const b = document.createElement('button'); b.className = 'npc-tag';
  const info = PEOPLE[n.name] ?? {};
  b.innerHTML = `${info.title ? `<small class="ttl">〈${esc(info.title)}〉</small>` : ''}${esc(n.name)} <i>${genderMark(info.gender)}</i>${info.pet ? '<span>🐾</span>' : ''}`;
  b.onclick = () => selectEntity(n.id);
  $('worldLabels').appendChild(b);
  return {n, b};
});

function tableBadge(t) {
  const rOwner = t.open && state.table !== t.id ? online?.ownerOf(t.id) : null;
  if (rOwner) { const n = session.occupancy(t.id); return [`👑 ${rOwner.p.n || '팀원'} · ${n}/${t.seats.length}`, n >= t.seats.length ? 'full' : 'open']; }
  if (t.open && !t.members.length && state.table !== t.id && !(state.guests[t.id]?.length) && !online?.atTable(t.id).length) return ['비어 있음 · 방장 가능', 'open'];
  if (state.table === t.id && state.owned === t.id) return [`👑 내 방 · ${minsLeft(t)}분`, 'mine'];
  if (state.table === t.id) return [`내 자리 · ${minsLeft(t)}분`, 'mine'];
  if (state.pending?.table === t.id) return ['요청 중', 'pending'];
  const n = session.occupancy(t.id);
  return n >= t.seats.length ? [`만석 · ${minsLeft(t)}분`, 'full'] : [`${n} / ${t.seats.length} · ${minsLeft(t)}분`, 'open'];
}

function refreshLabels() {
  for (const l of labels) {
    const t = tableOf(l.spot.id);
    if (t) {
      const [text, kind] = tableBadge(t);
      l.button.innerHTML = `<i>T${t.number}</i>${esc(t.title)}<small class="${kind}">${text}</small>`;
    } else if (l.spot.kind === 'exit') {
      l.button.innerHTML = '입구<small>마을 · 마무리</small>';
    } else {
      l.button.textContent = l.spot.title;
    }
  }
}
function refresh() {
  refreshLabels();
  const p = state.profile;
  $('nameplate').innerHTML = `<b class="mood-dot ${p.mood}"></b>${wallet.title && has('titles') ? `<small class="ttl">〈${esc(titleName(wallet.title))}〉</small>` : ''}${esc(p.name)} <i>${genderMark(p.gender)}</i>${wallet.equipped.pet ? '🐾' : ''}`;
  const open = TABLES.filter(t => !session.isFull(t.id)).length;
  $('placeLine').textContent = place === 'town' ? '밤마을 골목 · 산책 중 · 방문은 계속돼요' : online?.net.status === 'on' && inVillage ? `성수 · 팀 ${online.count + 1}명 접속 · 열린 테이블 ${open}개` : `성수 · 예시 주민 ${RESIDENT_COUNT}명 · 열린 테이블 ${open}개`;
  renderDock();
}

function activeOrder() {
  return [...state.orders].reverse().find(o => o.status === '접수' || o.status === '준비 중');
}

function renderDock() {
  const dock = $('dock'), p = state.profile, o = activeOrder();
  const moodChip = `<button class="mood-chip" id="dockMood"><b class="mood-dot ${p.mood}"></b>${MOODS[p.mood].short}</button>`;
  const orderChip = o ? `<button class="order-chip" id="dockOrder"><span style="--drink:${o.color}"></span>${esc(o.name)} · ${o.status}</button>` : '';
  if (escorting) {
    dock.innerHTML = `<div class="dock-line"><span class="pulse"></span>JAY가 자리까지 안내하는 중이에요</div>`;
    return;
  }
  if (place === 'town') {
    dock.innerHTML = `<div class="dock-head">${moodChip}${orderChip}<span class="dock-seat">🌆 밤마을 골목 · 산책 중</span></div>
      <div class="dock-actions">
        <button class="primary" id="tBar">바로 들어가기</button>
        <button id="tPlaza">광장</button>
        <button id="tRiver">한강</button>
        <button id="tMap">마을 지도</button>
      </div>`;
    $('tBar').onclick = () => walkTownSpot('barDoor'); $('tPlaza').onclick = () => goTo(TOWN_X + .5, -.6, '광장으로', null, 1);
    $('tRiver').onclick = () => walkTownSpot('river'); $('tMap').onclick = showTownMap; $('dockMood').onclick = openMood;
    if (o) $('dockOrder').onclick = showJournal;
    return;
  }
  if (state.table) {
    const t = tableOf(state.table);
    dock.innerHTML = `<div class="dock-head"><span class="dock-seat">T${t.number} · ${esc(t.title)}</span>${orderChip}</div>
      <div class="dock-actions seated${has('games') ? '' : ' four'}">
        <button class="primary" id="dockMenu">한잔 주문</button>
        ${has('games') ? '<button id="dockGame">🎲 게임</button>' : ''}
        <button id="dockHost">호스트</button>
        <button id="dockCalm">폰 내려놓기</button>
        <button class="quiet" id="dockStand">일어나기</button>
      </div>`;
    $('dockMenu').onclick = () => openMenu(); $('dockHost').onclick = openHostHelp; if ($('dockGame')) $('dockGame').onclick = () => games.menu();
    $('dockCalm').onclick = () => showCalm(t); $('dockStand').onclick = confirmStandOnly;
  } else {
    dock.innerHTML = `<div class="dock-head">${moodChip}${orderChip}</div>
      <div class="dock-actions">
        <button id="toBar">바 앞으로</button>
        <button id="toLounge">라운지</button>
        <button id="toMap">열린 테이블</button>
        <button class="quiet" id="toEntry">입구 · 마무리</button>
      </div>`;
    $('toBar').onclick = () => selectEntity('host'); $('toLounge').onclick = () => selectEntity('lounge');
    $('toMap').onclick = showMap; $('toEntry').onclick = () => selectEntity('exit');
    $('dockMood').onclick = openMood;
  }
  if (o) $('dockOrder').onclick = showJournal;
}

function resize() {
  const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view); resize();

function status(text) {
  const el = $('status'); el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
}
function release() { keys.clear(); document.querySelectorAll('[data-dir]').forEach(b => b.classList.remove('active')); }

// ── 자리 ─────────────────────────────────────────────────
function stand() {
  if (!state.table) return;
  const t = tableOf(state.table);
  level = t.level ?? 1;
  actor.position.set(t.approach.x, levelY(level), t.approach.z); rig.position.y = 0;
  const wasOwner = state.owned === t.id;
  if (unlock('openRoom')) unlock('games', {quiet: true});
  session.leave(); for (const l of legs) l.rotation.x = 0;
  if (wasOwner) closeRoom(t);
  refresh();
}

// 앉아 있을 때 다른 곳으로 가려면 반드시 한 번 확인한다.
function confirmStand(label, next) {
  show('잠깐만요', `<h2>자리에서 일어날까요?</h2>
    <p>${esc(label)} 쪽으로 가면 지금 자리는 다른 분께 열려요.</p>
    <button class="action" id="standGo">일어나서 이동</button>
    <button class="secondary" id="standStay">계속 앉아 있기</button>`);
  $('standGo').onclick = () => { closeDialog(); stand(); next(); };
  $('standStay').onclick = () => { closeDialog(); status('계속 앉아 있어요.'); };
}
function confirmStandOnly() {
  const t = tableOf(state.table);
  show('잠깐만요', `<h2>자리에서 일어날까요?</h2><p>“${esc(t.title)}” 자리가 다른 분께 열려요. 준비 중인 주문은 바에서 받을 수 있어요.</p>
    <button class="action" id="standGo">일어나기</button><button class="secondary" id="standStay">계속 앉아 있기</button>`);
  $('standGo').onclick = () => { closeDialog(); stand(); status('다음 이야기도 찾아볼까요?'); };
  $('standStay').onclick = closeDialog;
}
function seatedHint() { status('자리에 앉아 있어요. 움직이려면 아래 [일어나기]를 눌러요.'); $('dock').classList.add('nudge'); setTimeout(() => $('dock').classList.remove('nudge'), 700); }

// 점프: 서 있을 때만. 앉아 있거나 대화창·대화 중 화면일 때는 무시한다.
function jump() {
  if (failed || dialog.open || !calm.hidden || escorting) return;
  if (state.table) { seatedHint(); return; }
  if (jumpY > .001 || jumpV !== 0) return;
  jumpV = JUMP_SPEED; netJumpAt = Date.now();
  if (myPet) setTimeout(() => { if (myPet && !myPet.jy) myPet.jv = JUMP_SPEED * .8; }, 110); // 펫도 살짝 늦게 같이 점프
}

function goTo(x, z, label = '', done = null, toLevel = level) {
  if (failed) return false;
  if (state.table) { seatedHint(); return false; }
  path = place === 'town' ? town.route({x: actor.position.x, z: actor.position.z}, {x, z}) : levelRoute({x: actor.position.x, z: actor.position.z, level}, {x, z, level: toLevel});
  if (!path.length) { status('이쪽으로는 갈 수 없어요. 다른 곳을 눌러봐요.'); return false; }
  onArrival = done; arrival = label;
  const target = path.at(-1); marker.position.set(target.x, (target.y ?? 0) + .055, target.z); marker.visible = true;
  status(label ? label + ' 걸어가는 중' : '좋아, 저쪽으로 가볼까?');
  return true;
}

// ── 다이얼로그 ───────────────────────────────────────────
function closeDialog() { if (dialog.open) dialog.close(); release(); }
function show(label, html, {onClose = null, tone = '', lock = false} = {}) {
  release();
  dialog.dataset.lock = lock ? '1' : '';
  $('modalClose').hidden = lock;
  if (!escorting) { path = []; onArrival = null; marker.visible = false; }
  onDialogClose = onClose;
  dialog.dataset.tone = tone;
  $('modalLabel').textContent = label; $('modalContent').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.focus({preventScroll: true}); dialog.scrollTop = 0;
  $('interact').hidden = true;
}
$('modalClose').onclick = closeDialog;
dialog.addEventListener('cancel', e => { if (dialog.dataset.lock) e.preventDefault(); });
dialog.addEventListener('close', () => { release(); const fn = onDialogClose; onDialogClose = null; if (fn) fn(); });

// ── 선택 ─────────────────────────────────────────────────
function selectEntity(id) {
  if (place === 'town') { status('바 안에서 할 수 있어요 · [바로 들어가기]를 눌러요'); return; }
  if (escorting) { status('JAY가 안내하는 중이에요. 잠깐만요.'); return; }
  closeDialog();
  const spot = SPOTS.find(s => s.id === id);
  if (spot) {
    if (state.table === id) { openTable(tableOf(id)); return; }
    if (state.table && id === 'host') { openHostHelp(); return; }
    if (state.table) { confirmStand(spot.title, () => selectEntity(id)); return; }
    if (spot.kind === 'stairs') { // 계단: 반대 층으로
      if (level === 1) goTo(STAIRS.upper.x, STAIRS.upper.z, '2층 AFTER 존으로', () => status('2층이에요. 조용히 2차 대화하는 AFTER DRINK 존이에요.'), 2);
      else goTo(STAIRS.ground.x, STAIRS.ground.z, '1층으로', null, 1);
      return;
    }
    goTo(spot.x, spot.z, spot.title, () => openEntity(id), spot.level ?? 1);
    return;
  }
  const n = npcs.find(n => n.id === id); if (!n) return;
  if (n.host) { selectEntity('host'); return; }
  const t = TABLES.find(t => id.startsWith(t.id + '-'));
  if (state.table && (t?.id === state.table || n.guestOf === state.table || (!t && !n.seated))) { openPerson(n); return; }
  if (state.table) { confirmStand(n.name + '님', () => selectEntity(id)); return; }
  const r = roaming.find(r => r.npc === n); if (r) r.pauseUntil = performance.now() + 20000;
  const goal = t ? SPOTS.find(s => s.id === t.id) : {x: n.root.position.x + .75, z: n.root.position.z + .65, level: npcLevel(n)};
  goTo(goal.x, goal.z, n.name + '님에게', () => openPerson(n), goal.level ?? 1);
}

function openEntity(id) {
  const t = tableOf(id); if (t) { openTable(t); return; }
  if (id === 'stairs' || id === 'stairsDown') { selectEntity(id); return; }
  if (id === 'host') { openHost(); return; }
  if (id === 'exit') { openExit(); return; }
  if (id === 'lounge') {
    show('QUIET CORNER', `<h2>오늘은 천천히 쉬어도 돼요</h2>
      <p>혼술 코너에서는 먼저 말을 걸지 않아요. 상태를 ‘혼술 중’으로 바꾸면 인사와 초대도 받지 않아요.</p>
      <button class="action" id="restHere">혼술 중으로 바꾸기</button><button class="secondary" id="restNo">그냥 둘러볼게요</button>`);
    $('restHere').onclick = () => { setMood('rest'); session.record('라운지에서 잠깐 쉬었어요'); closeDialog(); status('천천히 쉬어요. 다시 대화하고 싶으면 상태를 바꾸면 돼요.'); };
    $('restNo').onclick = closeDialog;
  }
}

function setMood(mood) { state.profile.mood = mood; saveProfile(); refresh(); }

// ── 테이블 · 참여 요청 · 동의 · 호스트 안내 ──────────────
function openTable(t) {
  if (place === 'town') { status('바 안의 테이블이에요 · [바로 들어가기]를 눌러요'); return; }
  if (tutorial) tutorialEvent('table');
  if (t.open && !t.members.length && state.table !== t.id && !(state.guests[t.id]?.length) && !online?.atTable(t.id).length) {
    if (!has('openRoom')) {
      show('EMPTY · T' + t.number, `<h2>아직 비어 있는 자리예요</h2><p>처음엔 이야기가 열린 판에 함께 앉아봐요. 한 번 앉아보면 여기서 직접 판을 열 수 있어요.</p>
        <button class="action" id="eOpen">열린 테이블 추천받기</button><button class="secondary" id="eNow">그래도 지금 판 열기</button>`);
      $('eOpen').onclick = recommendTable; $('eNow').onclick = () => { unlock('openRoom', {quiet: true}); openRoomDialog(t); };
      return;
    }
    openRoomDialog(t); return;
  }
  const mine = state.table === t.id, full = session.isFull(t.id);
  const rOwner = t.open && !mine ? online?.ownerOf(t.id) : null;
  const chips = t.members.map(n => `<span>${n}</span>`).join('') + playerChips(t) + (mine ? `<span class="me">${esc(state.profile.name)} · 나</span>` : '');
  const seats = Array.from({length: t.seats.length}, (_, i) => `<i class="${i < session.occupancy(t.id) ? 'taken' : ''}"></i>`).join('');
  show('TABLE ' + String(t.number).padStart(2, '0'), `<h2>${esc(t.title)}</h2>
    <p class="meta">${esc(t.tag)} <span class="seats" aria-label="${session.occupancy(t.id)}/${t.seats.length}석">${seats}</span></p>
    <p class="meta round-line">⏱ ${minsLeft(t)}분 남음 · 💬 지금 이야기 중</p>
    <div class="people">${chips}</div>
    ${mine ? `<blockquote class="opener"><small>이 테이블의 첫 질문</small>${esc(t.opener)}</blockquote>` : ''}
    <p class="note">${mine ? '함께 앉아 있어요. 대화가 시작되면 폰은 내려놓아도 돼요.'
      : full ? '지금 이 테이블은 만석이에요. 다른 이야기를 둘러볼까요?'
      : rOwner ? `👑 방장 ${esc(rOwner.p.n || '팀원')}님에게 물어봐요. 패스해도 누가 거절했는지는 보이지 않아요.`
      : '요청하면 테이블 사람들에게 조용히 물어봐요. 누가 거절했는지는 서로 알 수 없어요.'}</p>
    <button id="tableAction" class="action">${mine ? '첫 질문 다시 보기' : full ? '열린 테이블 보기' : '같이 앉아도 될까요?'}</button>
    ${mine ? '<button id="tableStand" class="secondary">자리에서 일어나기</button>' : ''}`);
  $('tableAction').onclick = () => {
    if (mine) { showConversation(t); return; }
    if (full) { showMap(); return; }
    if (state.profile.mood === 'rest') { askMoodForJoin(t); return; }
    if (rOwner) { online.requestSeat(t); return; }
    requestJoin(t);
  };
  if (mine) $('tableStand').onclick = confirmStandOnly;
}

function askMoodForJoin(t) {
  show('잠깐만요', `<h2>지금은 ‘혼술 중’이에요</h2><p>합석을 요청하려면 상태를 ‘놀자’로 바꿔야 해요.</p>
    <button class="action" id="moodTalk">놀자로 바꾸고 요청</button><button class="secondary" id="moodKeep">계속 쉴게요</button>`);
  $('moodTalk').onclick = () => { setMood('talk'); requestJoin(t); };
  $('moodKeep').onclick = closeDialog;
}

function stepList(active, declined = false) {
  const steps = ['요청 보냄', '테이블에 조용히 물어보는 중', '호스트 확인'];
  return `<ol class="steps">${steps.map((s, i) => `<li class="${i < active ? 'done' : i === active ? (declined ? 'stop' : 'now') : ''}">${s}</li>`).join('')}</ol>`;
}

function requestJoin(t) {
  try { session.request(t.id); } catch (e) { status(e.message); closeDialog(); return; }
  const token = ++flowToken; refresh();
  const cancel = () => { if (token !== flowToken) return; flowToken++; session.cancelRequest(); refresh(); status('요청을 취소했어요. 괜찮아요, 다음에.'); };
  const waiting = active => {
    show('REQUEST · T' + t.number, `<h2>${esc(t.title)}</h2>${stepList(active)}
      <p class="note">테이블 사람들 화면에만 조용히 알림이 가요. (체험: 응답은 미리 정해져 있어요)</p>
      <button class="secondary" id="reqCancel">요청 취소</button>`, {onClose: cancel});
    $('reqCancel').onclick = closeDialog;
  };
  waiting(1);
  setTimeout(() => {
    if (token !== flowToken) return;
    if (t.demoResponse === 'decline') {
      flowToken++; session.declineRequest(); refresh();
      show('REQUEST · T' + t.number, `<h2>지금은 자리가 어려워요</h2>${stepList(1, true)}
        <p>누가 거절했는지는 알려드리지 않아요. 여기서는 자주 있는 일이고, 다른 테이블도 열려 있어요.</p>
        <button class="action" id="declineMap">다른 테이블 보기</button><button class="secondary" id="declineOk">괜찮아요</button>`, {tone: 'soft'});
      $('declineMap').onclick = showMap; $('declineOk').onclick = closeDialog;
      return;
    }
    waiting(2);
    setTimeout(() => {
      if (token !== flowToken) return;
      flowToken++;
      show('WELCOME · T' + t.number, `<h2>좋아요, 같이 앉아요!</h2>${stepList(3)}
        <p>호스트 JAY가 자리까지 안내해요. 따라가면 바로 앉을 수 있어요.</p>
        <button class="action" id="follow">JAY 따라가기</button>`, {onClose: () => startEscort(t)});
      $('follow').onclick = closeDialog;
    }, 1300);
  }, 1500);
}

function hostWalk(points, done) {
  host.path = points; hostTask = {done};
}
function hostOut(target, done) {
  // 링 바 안에 있으면 뒤쪽 통로로 나간 뒤 길을 찾는다.
  const inRing = Math.hypot(host.root.position.x - RING.x, host.root.position.z - RING.z) < RING.inner;
  const exit = RING.hostPath.at(-1);
  const start = inRing ? exit : {x: host.root.position.x, z: host.root.position.z};
  hostWalk([...(inRing ? RING.hostPath : []), ...route(start, target)], done);
}
function hostBack() {
  const exit = RING.hostPath.at(-1);
  hostWalk([...route({x: host.root.position.x, z: host.root.position.z}, exit), ...[...RING.hostPath].reverse().slice(1), RING.host], () => { host.root.quaternion.setFromAxisAngle(axis, 0); });
}

// 호스트와 내 캐릭터가 둘 다 자리에 도착해야 앉는다. 호스트가 늦으면 8초 뒤에는 그냥 앉는다.
function startEscort(t) {
  if (state.pending?.table !== t.id) return;
  escorting = true; refresh();
  const spot = SPOTS.find(s => s.id === t.id), token = ++flowToken;
  let me = false, jay = false;
  const trySit = () => { if (token === flowToken && me && jay) sit(t); };
  hostOut({x: t.approach.x + .8, z: t.approach.z + .3}, () => { jay = true; trySit(); });
  setTimeout(() => { jay = true; trySit(); }, 8000);
  status('JAY가 자리로 안내해요');
  setTimeout(() => {
    if (token !== flowToken) return;
    path = route({x: actor.position.x, z: actor.position.z}, spot);
    arrival = ''; marker.visible = false;
    onArrival = () => { me = true; trySit(); };
    if (!path.length) { me = true; trySit(); }
  }, 900);
}

function sit(t) {
  if (!escorting) return;
  escorting = false; flowToken++;
  try { session.confirmSeat(t.id); } catch (e) { status(e.message); refresh(); return; }
  seatMe(t);
  setTimeout(hostBack, 1400);
  showConversation(t);
  // 체험: 처음 앉으면 잠시 뒤 테이블의 누군가가 한 잔을 제안한다. 받을지는 내가 정한다(무응답·이탈·퇴장이면 받지 않음).
  if (!giftDemoDone) {
    giftDemoDone = true;
    const visit = state.visitId;
    setTimeout(() => offerDemoGift(t, visit), 15000);
  }
}
function offerDemoGift(t, visit, tries = 0) {
  if (state.visitId !== visit || state.table !== t.id || drink) return;
  if (dialog.open) { if (tries < 30) setTimeout(() => offerDemoGift(t, visit, tries + 1), 2000); return; }
  const giverNpc = t.type === 'ring' ? host : npcs.find(n => n.id.startsWith(t.id + '-'));
  const giver = giverNpc?.name ?? 'JAY';
  const d = DRINKS.find(d => d.id === (state.profile.fav ?? 'highball')) ?? DRINKS[0];
  hideCalm();
  show('🎁 한 잔 제안', `<h2>${esc(giver)}님이 ${eulreul(d.name)} 보내고 싶어해요</h2>
    <p>내가 좋아하는 술이래요. 받으면 바에서 만들어 자리로 가져다줘요. 마음만 받아도 괜찮아요.</p>
    <button class="action" id="dgYes">받을게요</button><button class="secondary" id="dgNo">마음만 받을게요</button>`);
  $('dgNo').onclick = () => { closeDialog(); if (giverNpc) bubbleOver(giverNpc.root, '다음에!', '#d8f0ff', 2000); status('마음만 받았어요'); session.record(`선물 마음만 · ${giver}`); };
  $('dgYes').onclick = () => {
    closeDialog();
    if (state.visitId !== visit || state.table !== t.id) { status('자리를 떠서 이번 선물은 받지 않았어요'); return; }
    status(`${giver}님에게 고맙다고 전했어요 · 곧 나와요`);
    setTimeout(() => {
      if (state.visitId !== visit || state.table !== t.id) return;
      serveToMe(d.glass, d.color, d.name);
      bubbleOver(actor, '선물 도착!', '#fff3c4', 2600, 2.0);
      if (giverNpc) { bubbleOver(giverNpc.root, '건배!', '#ffdbe8', 2200); giverNpc.waveUntil = performance.now() + 2200; }
      status(`🎁 ${giver}님이 보낸 ${iga(d.name)} 나왔어요!`);
      session.record(`선물 받음 · ${giver} → ${d.name}`);
    }, 4000);
  };
}

// 자리에 앉히기(공통): 좌석 높이·층·코인·칭찬 체험
function seatMe(t) {
  const idx = session.mySeatIndex(t.id), seat = t.seats[idx] ?? t.seats.at(-1);
  state.seatIdx = t.seats[idx] ? idx : t.seats.length - 1;
  level = t.level ?? 1;
  actor.position.set(seat.x, seat.y, seat.z); actor.rotation.set(0, 0, 0); actor.quaternion.setFromAxisAngle(axis, seat.heading);
  path = []; marker.visible = false;
  if (!wallet.joinedToday) wallet.joinedToday = [];
  if (!state.joinedCoin) state.joinedCoin = new Set();
  unlock('order', {quiet: true}); unlock('emote', {quiet: true}); tutorialEvent('sit');
  // 엽서용: 앉았던 판의 당시 주제·첫 질문을 복사해 둔다
  state.visitTables ??= [];
  if (!state.visitTables.some(v => v.number === t.number && v.title === t.title)) state.visitTables.push({number: t.number, title: t.title, opener: t.opener ?? ''});
  // 엔딩 크레딧: 실제 영화 주제 판에 앉았을 때, 방문당 한 번
  if (/영화/.test(t.title + ' ' + (t.opener ?? '')) && state.visitId && !wallet.movieVisits.includes(state.visitId)) { wallet.movieVisits.push(state.visitId); saveWallet(); checkTitles(); }
  refresh();
}

// ── 빈 테이블 · 방장 ─────────────────────────────────────
function openRoomDialog(t) {
  show('EMPTY · T' + t.number, `<h2>방장이 되어 판을 열까요?</h2>
    <p>${esc(t.tag)}. 먼저 앉으면 내가 방장이에요. 들어오고 싶은 사람은 나에게 요청하고, 수락은 내가 해요.</p>
    <fieldset class="topic-pick"><legend>오늘의 판(주제)</legend>${OPEN_TOPICS.map(([title], i) => `<label><input type="radio" name="topic" value="${i}" ${i === 0 ? 'checked' : ''}><span>${esc(title)}</span></label>`).join('')}</fieldset>
    <button class="action" id="openRoom">👑 판 열고 앉기</button>
    <p class="note">호스트 JAY에게는 알림만 가요. 주문은 앉은 자리에서 할 수 있어요.</p>`);
  $('openRoom').onclick = () => claimRoom(t, +(document.querySelector('input[name=topic]:checked')?.value ?? 0));
}

function claimRoom(t, topicIdx) {
  const [title, opener] = OPEN_TOPICS[topicIdx];
  try { session.claim(t.id, title); } catch (e) { status(e.message); return; }
  t.title = title; t.opener = opener; rounds[t.id].ends = Date.now() + 25 * 60000;
  const spot = SPOTS.find(s => s.id === t.id); if (spot) spot.title = title;
  closeDialog();
  seatMe(t);
  status(`👑 T${t.number} 방장이 됐어요 · JAY에게 알렸어요`);
  showConversation(t);
  // 체험: 잠시 뒤 NARI가 참여를 요청한다(방장이 수락/패스).
  const token = ++roomToken;
  if (online?.net.status !== 'on') setTimeout(() => askJoin(t, token), 12000);
}
let roomToken = 0;
function askJoin(t, token, tries = 0) {
  if (token !== roomToken || state.owned !== t.id) return;
  const n = npcs.find(n => n.id === 'nari');
  const r = roaming.find(r => r.npc === n);
  if (!n || n.guestOf || r?.disabled) return;
  if (dialog.open || !calm.hidden) { if (tries < 20) setTimeout(() => askJoin(t, token, tries + 1), 2000); return; }
  const info = PEOPLE[n.name];
  show('JOIN REQUEST · T' + t.number, `<h2>${esc(n.name)} <i class="g">${genderMark(info.gender)}</i>님이 같이 앉고 싶어해요</h2>
    <p class="meta">${info.title ? `〈${esc(info.title)}〉 · ` : ''}${info.age}세 · ${esc(info.job)} · ${info.mbti}</p>
    <div class="people tags">${(PROFILE_TAGS[n.name] ?? []).map(x => `<span>${esc(x)}</span>`).join('')}</div>
    <p class="note">방장인 내가 정해요. 패스해도 상대에게는 “지금은 자리가 어려워요”로만 전해져요.</p>
    <button class="action" id="reqAccept">수락</button><button class="secondary" id="reqPass">이번엔 패스</button>`);
  $('reqAccept').onclick = () => { closeDialog(); bringGuest(n, t); status(`${n.name}님을 수락했어요. JAY가 안내해요`); setTimeout(() => grantTitle('jay'), 4000); };
  $('reqPass').onclick = () => { closeDialog(); bubbleOver(n.root, '다음에!', '#d8f0ff', 2000); status(`${n.name}님에게 정중히 전했어요`); session.record('참여 요청 패스 · ' + n.name); };
}

// 방장이 일어나면 판을 닫는다. 같이 있던 주민은 다시 돌아다닌다.
function closeRoom(t) {
  roomToken++;
  releaseGuests(t.id);
  t.title = t.type === 'after' ? '빈 2인석' : '빈 테이블'; t.opener = '';
  const spot = SPOTS.find(s => s.id === t.id); if (spot) spot.title = t.title;
}

// ── 대화 시작 카드 · 폰 내려놓기 ─────────────────────────
function showConversation(t) {
  show('TABLE ' + String(t.number).padStart(2, '0') + ' · 첫 질문', `<p class="kicker">${esc(t.title)}</p>
    <blockquote class="opener big">${esc(t.opener)}</blockquote>
    <div class="people">${t.members.map(n => `<span>${n}</span>`).join('')}${playerChips(t)}<span class="me">${esc(state.profile.name)} · 나</span></div>
    <p class="note">질문은 대화의 첫 마디일 뿐이에요. 답하기 싫으면 넘겨도 돼요.</p>
    <button class="action" id="calmGo">폰 내려놓기</button><button class="secondary" id="calmLook">화면 둘러보기</button>`);
  $('calmGo').onclick = () => { closeDialog(); showCalm(t); };
  $('calmLook').onclick = closeDialog;
}

function showCalm(t) {
  closeDialog();
  $('calmTable').textContent = 'T' + t.number + ' · ' + t.title;
  calm.hidden = false; calm.focus();
}
function hideCalm() { calm.hidden = true; }
calm.addEventListener('click', e => { if (e.target === calm || e.target.closest('.calm-center')) hideCalm(); });
$('calmMenu').onclick = () => { hideCalm(); openMenu(); };
$('calmHost').onclick = () => { hideCalm(); openHostHelp(); };
$('calmBack').onclick = hideCalm;

// ── 호스트 ───────────────────────────────────────────────
function openHost() {
  const first = !state.joined.length;
  show('HOST JAY', `<h2>${first ? '오늘 처음 오셨어요?' : '또 뭐 해볼까요?'}</h2>
    <div class="bubble-line">${first ? '반가워요! 저는 오늘 판을 여는 호스트 JAY예요. 어색하면 제가 알아서 섞어드릴게요.' : '자리 옮기고 싶으면 언제든 말해요. 새 판도 계속 열려요.'}</div>
    <div class="choice-list">
      <button id="hostMenu"><b>🍸 주문하기</b><small>바에서 바로 한 잔</small></button>
      <button id="hostReco"><b>🎲 테이블 추천받기</b><small>지금 기분에 맞는 판을 골라줘요</small></button>
      <button id="hostSolo"><b>🙋 혼자 왔어요</b><small>처음이어도 괜찮게 시작하는 방법</small></button>
      <button id="hostHelp"><b>🆘 도움 요청</b><small>호스트에게만 조용히 전달돼요</small></button>
    </div>`);
  $('hostMenu').onclick = () => openMenu(); $('hostReco').onclick = recommendTable; $('hostSolo').onclick = soloGuide; $('hostHelp').onclick = openHostHelp;
}

// 호스트 추천: 열려 있는 판 중에서 지금 상태와 남은 시간을 보고 하나 고른다.
function recommendTable() {
  const open = TABLES.filter(t => !t.open && !session.isFull(t.id) && state.table !== t.id && t.demoResponse !== 'decline');
  const pick = state.profile.mood === 'look' ? open.find(t => t.type === 'sofa') ?? open[0]
    : open.find(t => t.type === 'ring' && !state.joined.includes(t.id)) ?? open.sort((a, b) => minsLeft(b) - minsLeft(a))[0];
  if (!pick) { show('HOST JAY', `<h2>지금은 다 차 있어요</h2><p>곧 새로운 판이 열려요. 그동안 바에서 한 잔 어때요?</p><button class="action" id="hOk">메뉴 보기</button>`); $('hOk').onclick = () => openMenu(); return; }
  const why = pick.type === 'ring' ? '처음 온 분은 바에서 시작하면 제가 대화를 열어드려요.'
    : pick.type === 'sofa' ? '편하게 기대서 얘기하는 자리라 천천히 섞이기 좋아요.' : `${minsLeft(pick)}분 남은 판이라 지금 들어가기 딱 좋아요.`;
  show('HOST JAY · 추천', `<h2>T${pick.number} ${esc(pick.title)}</h2><p class="meta">${esc(pick.tag)} · ${session.occupancy(pick.id)} / ${pick.seats.length}</p>
    <div class="bubble-line">${why}</div>
    <button class="action" id="recoGo">거기로 가볼게요</button><button class="secondary" id="recoMap">다른 곳도 볼래요</button>`);
  $('recoGo').onclick = () => selectEntity(pick.id); $('recoMap').onclick = showMap;
}

function soloGuide() {
  show('HOST JAY', `<h2>혼자 오신 거, 완전 좋아요</h2>
    <div class="bubble-line">여기 오는 분 절반은 혼자예요. 링 바에 앉으면 제가 첫 질문을 던져드리고, 분위기 올라오면 빠질게요. 조용히 마시고 싶으면 혼술 코너도 있어요.</div>
    <button class="action" id="soloRing">링 바에 앉아볼래요</button><button class="secondary" id="soloNook">혼술 코너로 갈게요</button>`);
  $('soloRing').onclick = () => selectEntity('table5');
  $('soloNook').onclick = () => selectEntity('lounge');
}

function openHostHelp() {
  show('HOST JAY · 도움 요청', `<h2>어떤 도움이 필요해요?</h2>
    <p>호스트에게만 조용히 전달돼요. 다른 손님에게는 알림이 가지 않아요.</p>
    <div class="choice-list">
      <button data-help="seat"><b>자리 안내가 필요해요</b><small>열린 테이블이나 쉬는 자리를 찾아줘요</small></button>
      <button data-help="uncomfortable"><b>불편한 상황이 있어요</b><small>호스트가 바로 와서 자리를 정리해요</small></button>
      <button data-help="rest"><b>잠깐 혼술하고 싶어요</b><small>상태를 바꾸고 인사·초대를 멈춰요</small></button>
    </div>`);
  $('modalContent').querySelectorAll('[data-help]').forEach(b => b.onclick = () => helpResult(b.dataset.help));
}

function helpResult(kind) {
  if (kind === 'seat') { showMap(); return; }
  if (kind === 'rest') {
    setMood('rest');
    show('HOST JAY', `<h2>혼술 중으로 바꿨어요</h2><p>${state.table ? '자리는 그대로 지켜둘게요. ' : ''}다시 대화하고 싶으면 아래 상태 버튼을 눌러요.</p><button class="action" id="helpOk">확인</button>`);
    $('helpOk').onclick = closeDialog; return;
  }
  session.record('호스트 호출 · 불편한 상황');
  show('HOST JAY', `<h2>JAY에게 조용히 알렸어요</h2>
    <p>호스트가 지금 이쪽으로 와요. 상대에게는 알림이 가지 않아요.</p>
    <p class="note">체험판이라 실제 직원 호출은 연결되어 있지 않아요. 실제 매장에서는 직원 화면에 바로 표시돼요.</p>
    <button class="action" id="helpOk">확인</button>`);
  $('helpOk').onclick = closeDialog;
  hostOut({x: actor.position.x + .8, z: actor.position.z + .5}, () => setTimeout(hostBack, 2600));
}

// ── 주문 · 한 잔 보내기 · 테이블 한 잔 돌리기 ───────────
// opts.to: 받는 주민(npc) · opts.round: 내 테이블 전체
function openMenu(opts = {}) {
  const t = state.table ? tableOf(state.table) : null;
  if (!t) { // 주문은 앉은 자리에서만
    show('BAR MENU', `<h2>주문은 자리에서 해요</h2>
      <div class="bubble-line">JAY: 자리에 앉으면 거기로 바로 가져다드려요. ${opts.to ? '한 잔 보내기도 자리에서 할 수 있어요.' : '먼저 판을 골라볼까요?'}</div>
      <button class="action" id="mReco">테이블 추천받기</button><button class="secondary" id="mMap">지도 보기</button>`);
    $('mReco').onclick = recommendTable; $('mMap').onclick = showMap; return;
  }
  const qty = opts.round ? session.occupancy(t.id) : 1;
  const where = opts.to ? `${opts.to.name}님에게 보내요` : opts.round ? `T${t.number} ${qty}명 모두에게 한 잔씩` : t ? `T${t.number} 자리로 가져다드려요` : '주문하면 바에서 받아가요';
  const fav = state.profile.fav;
  show(opts.to ? 'SEND A DRINK' : opts.round ? 'CHEERS · 한 잔 돌리기' : 'BAR MENU', `<h2>${opts.to ? '어떤 한 잔을 보낼까요?' : opts.round ? '테이블에 한 잔 돌리기' : '오늘의 한잔'}</h2><p class="meta">${where}</p>
    ${!opts.to && !opts.round && t ? `<button class="secondary cheers-row" id="roundBtn">🍻 T${t.number} 전체에 한 잔 돌리기</button>` : ''}
    <div class="menu">${DRINKS.map(d => `<div class="menu-row${d.soldOut ? ' sold' : ''}">
      <span class="swatch" style="--drink:${d.color}"></span>
      <div><b>${d.name}${d.id === fav ? ' <em class="fav">최애</em>' : ''}</b><small>${d.note}</small></div>
      <span class="price">${d.soldOut ? '오늘 품절' : won(d.price * qty)}</span>
      <button data-drink="${d.id}" ${d.soldOut ? 'disabled' : ''}>고르기</button></div>`).join('')}</div>
    <p class="note">체험 주문이에요. 실제 결제나 제조는 없어요.${opts.round ? ' 실서비스에서는 받는 사람마다 수락을 받고, 받은 잔만 결제해요(체험은 바로 건배).' : ''}</p>`);
  if ($('roundBtn')) $('roundBtn').onclick = () => openMenu({round: true});
  $('modalContent').querySelectorAll('[data-drink]').forEach(b => b.onclick = () => confirmOrder(b.dataset.drink, opts));
}

function confirmOrder(id, opts = {}) {
  const d = DRINKS.find(d => d.id === id);
  const t = state.table ? tableOf(state.table) : null;
  const qty = opts.round ? session.occupancy(t.id) : 1;
  const dup = !opts.to && !opts.round && session.recentSame(id);
  const where = opts.to ? `${opts.to.name}님에게 전달` : t ? `T${t.number} 자리로 서빙` : '바에서 픽업';
  show('ORDER', `<h2>${d.name} ${qty}잔</h2><p class="meta">${won(d.price * qty)} · ${where}</p>
    ${dup ? `<p class="warn">방금 ${eulreul(d.name)} 주문했어요. 한 잔 더 주문할까요?</p>` : ''}
    ${opts.to ? `<p class="note">${opts.to.name}님 화면에는 “${esc(state.profile.name)}님이 ${eulreul(d.name)} 보냈어요”만 떠요. 받을지 말지는 상대가 정해요.</p>` : ''}
    ${wallet.coupons > 0 && !opts.round ? `<label class="coupon"><input type="checkbox" id="useCoupon"> 🎟 무료 한 잔 쿠폰 사용 (데모 · ${wallet.coupons}장)</label>` : ''}
    <p class="note">접수 단계에서만 직접 취소할 수 있어요. 준비가 시작되면 호스트에게 말해주세요. ${has('coins') || has('stamps') ? `주문이 나오면 ${has('coins') ? `🪙 +${COIN_RULES.drink}/잔, ` : ''}스탬프 +1/잔(데모 · 쿠폰 음료 제외).` : ''}</p>
    <button id="orderConfirm" class="action">${opts.to ? '보내기' : opts.round ? '🍻 돌리기' : dup ? '한 잔 더 주문' : '주문하기'}</button>
    <button id="orderBack" class="secondary">메뉴로 돌아가기</button>`);
  $('orderBack').onclick = () => openMenu(opts);
  $('orderConfirm').onclick = () => placeOrder(id, {...opts, free: !!$('useCoupon')?.checked});
}

// 주문이 나오면: 코인 충전(잔 수만큼) + 데모 스탬프 1개. 쿠폰 주문은 적립하지 않는다.
function orderReward(o) {
  if (o.free || o.rewarded) return;
  o.rewarded = true;
  addCoins(COIN_RULES.drink * o.qty, '음료 주문');
  // 스탬프: 유료 음료 잔 수 기준(논알코올 포함). 한 번에 여러 잔이면 쿠폰도 여러 장.
  unlock('stamps');
  wallet.stamps += o.qty;
  const made = Math.floor(wallet.stamps / STAMP_GOAL);
  if (made) { wallet.stamps -= made * STAMP_GOAL; wallet.coupons += made; setTimeout(() => status(`🎟 스탬프 ${STAMP_GOAL}개! 무료 한 잔 쿠폰 ${made}장이 생겼어요 (데모)`), 1800); }
  saveWallet();
}

// 내 손에 잔을 쥐여준다. 들고 있는 동안 조금씩 줄어들고, 다 마시면 사라진다.
function serveToMe(glass, color, name) {
  setGlass(glass, color);
  drink = {name, start: performance.now(), end: performance.now() + DRINK_MINUTES * 60000};
}

function placeOrder(id, opts = {}) {
  let o;
  const t = state.table ? tableOf(state.table) : null;
  try { o = session.order(id, {qty: opts.round ? session.occupancy(t.id) : 1, to: opts.to?.name ?? null, free: !!opts.free}); } catch (e) { status(e.message); return; }
  if (o.free) { wallet.coupons--; saveWallet(); }
  closeDialog(); refresh();
  status(opts.to ? `${opts.to.name}님에게 ${eulreul(o.drink)} 보냈어요` : `${o.name} 주문 접수 · ${o.table ? 'T' + tableOf(o.table).number + ' 자리로 가져다드려요' : '바에서 받아가요'}`);
  const gen = orderGen;
  // 팀원에게 한 잔: 상대 화면에서 받기를 눌러야 제조가 시작된다.
  if (opts.to?.remote) {
    const R = opts.to.remote;
    online.sendGift(o, R, (ok, why) => {
      if (gen !== orderGen || o.status !== '접수') return;
      if (!ok) {
        session.cancelOrder(o.id); if (o.free) { wallet.coupons++; saveWallet(); } refresh();
        if (why !== 'timeout') bubbleOver(R.root, '마음만 받을게요', '#d8f0ff', 2400);
        status(why === 'timeout' ? `${opts.to.name}님이 답이 없어 취소했어요. 결제되지 않아요` : `${opts.to.name}님이 마음만 받았어요. 제조 전이라 결제되지 않아요`); return;
      }
      bubbleOver(R.root, '고마워요!', '#ffdbe8', 2000); status(`${opts.to.name}님이 한 잔을 받기로 했어요`);
      setTimeout(() => {
        if (gen !== orderGen || o.status !== '접수') return;
        session.advanceOrder(o.id); refresh(); status(o.name + ' 준비 중이에요');
        setTimeout(() => {
          if (gen !== orderGen || o.status !== '준비 중') return;
          session.advanceOrder(o.id); online.giftServed(o, R); orderReward(o); refresh();
          status(`${opts.to.name}님에게 ${eulreul(o.drink)} 전해졌어요 🥂`);
        }, 6000);
      }, 3000);
    });
    return;
  }
  // 한 잔 보내기는 받는 사람이 먼저 수락한다(체험: 놀자 상태만 수락). 거절이면 제조 전이라 결제되지 않는다.
  if (opts.to) setTimeout(() => {
    if (gen !== orderGen || o.status !== '접수') return;
    const mood = residentInfo(opts.to.id)?.mood ?? 'talk';
    if (mood !== 'talk') {
      session.cancelOrder(o.id); if (o.free) { wallet.coupons++; saveWallet(); } refresh();
      bubbleOver(opts.to.root, '마음만 받을게요', '#d8f0ff', 2400);
      status(`${opts.to.name}님이 마음만 받았어요. 제조 전이라 결제되지 않아요`);
    } else { bubbleOver(opts.to.root, '고마워요!', '#ffdbe8', 2000); status(`${opts.to.name}님이 한 잔을 받기로 했어요`); }
  }, 2500);
  setTimeout(() => {
    if (gen !== orderGen || o.status !== '접수') return;
    session.advanceOrder(o.id); refresh(); status(o.name + ' 준비 중이에요');
    setTimeout(() => {
      if (gen !== orderGen || o.status !== '준비 중') return;
      session.advanceOrder(o.id);
      if (opts.to) { // 한 잔 보내기: 받은 주민 손에 잔
        const n = opts.to;
        n.giftLiquid.color.set(o.color); n.giftGlass.visible = true; n.waveUntil = performance.now() + 2500;
        orderReward(o);
        bubbleOver(n.root, '고마워!', '#ffdbe8', 2600);
        refresh(); status(`${n.name}님이 ${eulreul(o.drink)} 받았어요. 손을 흔들어요!`);
        return;
      }
      if (opts.round) { // 테이블 한 잔 돌리기: 모두 건배
        const ids = [...npcs.filter(n => n.id.startsWith(o.table + '-')), ...npcs.filter(n => n.guestOf === o.table)];
        for (const n of ids) { n.giftLiquid.color.set(o.color); n.giftGlass.visible = true; bubbleOver(n.root, '건배!', '#fff3c4', 2400 + Math.random() * 500); }
        if (tableOf(o.table).type === 'ring') bubbleOver(host.root, '건배!', '#fff3c4', 2400);
      }
      serveToMe(o.glass, o.color, o.drink);
      orderReward(o);
      if (!o.alcohol && state.table) grantTitle('nonalc');
      refresh(); status(opts.round ? `🍻 T${tableOf(o.table).number} 건배!` : o.table ? `${iga(o.drink)} T${tableOf(o.table).number}에 나왔어요` : `${iga(o.drink)} 나왔어요. 바에서 받아가요`);
    }, 6000);
  }, 5000);
}

// ── 사람 ─────────────────────────────────────────────────
function openPerson(n) {
  const info = residentInfo(n.id), t = TABLES.find(t => n.id.startsWith(t.id + '-'));
  const mood = info?.mood ?? 'talk';
  const tags = (PROFILE_TAGS[n.name] ?? ['오늘 처음 왔어요']).map(x => `<span>${esc(x)}</span>`).join('');
  const pi = PEOPLE[n.name] ?? {};
  const head = `${pi.title ? `<p class="kicker">〈${esc(pi.title)}〉</p>` : ''}<h2>${esc(n.name)} <i class="g">${genderMark(pi.gender)}</i> <em class="ok" title="본인·직업 인증">✓ 인증</em></h2>
    ${pi.pet ? '<p class="meta badges"><b class="badge">🐾 단골</b></p>' : ''}
    <details class="more"><summary>자세히 (나이 · 직업 · MBTI)</summary><p class="meta profile-line">${pi.age ?? '?'}세 · ${esc(pi.job ?? '')} · ${pi.mbti ?? ''}</p></details>`;
  if (mood === 'rest') {
    show('VILLAGER · 예시 주민', `${head}<p class="meta"><b class="mood-dot rest"></b>혼술 중</p>
      <p>지금은 혼자만의 시간을 보내고 있어요. 인사는 다음에 해요.</p><button class="action" id="restOk">알겠어요</button>`);
    $('restOk').onclick = closeDialog; return;
  }
  if (state.profile.mood === 'rest') {
    show('VILLAGER · 예시 주민', `<h2>${esc(n.name)}</h2><p>지금 내 상태가 ‘혼술 중’이라 먼저 인사하지 않아요.</p>
      <button class="action" id="moodTalk">놀자로 바꾸기</button><button class="secondary" id="moodKeep">계속 혼술할게요</button>`);
    $('moodTalk').onclick = () => { setMood('talk'); openPerson(n); };
    $('moodKeep').onclick = closeDialog; return;
  }
  const atMine = state.table && (t?.id === state.table || n.guestOf === state.table);
  const canInvite = state.table && !t && !n.guestOf && roaming.some(r => r.npc === n && !r.disabled);
  const phrase = info?.topic ?? (atMine ? `반가워요! 첫 질문, 누가 먼저 답할까요?` : `지금 “${t?.title ?? '오늘의 이야기'}” 얘기 중이에요. 관심 있으면 같이 앉아요!`);
  show('VILLAGER · 예시 주민', `${head}<p class="meta"><b class="mood-dot ${mood}"></b>${MOODS[mood].short}</p>
    <div class="people tags">${tags}</div>
    <div class="bubble-line">💭 ${esc(phrase)}</div>
    <button id="sayHello" class="action">👋 인사하기</button>
    <button id="sendDrink" class="secondary">🍸 한 잔 보내기</button>
    ${canInvite ? '<button id="invite" class="secondary">🎲 우리 테이블에 초대</button>' : ''}

    ${t && !atMine ? '<button id="theirTable" class="secondary">이 테이블 살펴보기</button>' : ''}
    <p class="note">🌙 마을 규칙: 현장에서는 연락처·친구 신청·칭찬을 부탁하지 않아요. 다시 만나고 싶으면 퇴장한 뒤 ‘오늘의 기억’에서 전해요.</p>`);
  $('sayHello').onclick = () => { session.greet(n.id, n.name); n.waveUntil = performance.now() + 2300; bubbleOver(n.root, '안녕!', '#ffffff', 2000); closeDialog(); status(n.name + '님이 손을 흔들어요. 반가워요!'); };
  $('sendDrink').onclick = () => openMenu({to: n});
  if (canInvite) $('invite').onclick = () => inviteToTable(n);
  if (t && !atMine) $('theirTable').onclick = () => openTable(t);
}

// 우리 테이블에 초대: 상대가 수락하면 호스트 안내로 빈자리에 앉는다(체험: 놀자 상태만 수락).
function inviteToTable(n) {
  const t = tableOf(state.table);
  const seatIdx = t.freeOrder[1 + (state.guests[t.id]?.length ?? 0)];
  if (seatIdx === undefined || session.isFull(t.id) || session.occupancy(t.id) >= t.seats.length) {
    show('INVITE', `<h2>자리가 꽉 찼어요</h2><p>지금 테이블에 빈자리가 없어요. 대신 한 잔 보내볼까요?</p><button class="action" id="iDrink">한 잔 보내기</button>`);
    $('iDrink').onclick = () => openMenu({to: n}); return;
  }
  const info = residentInfo(n.id), token = ++flowToken;
  show('INVITE · T' + t.number, `<h2>${esc(n.name)}님에게 초대를 보냈어요</h2>${stepList(1).replace('테이블에 조용히 물어보는 중', `${esc(n.name)}님이 확인 중`)}
    <p class="note">테이블 사람들 동의를 받은 초대예요(체험). 상대가 수락하면 호스트가 자리로 안내해요.</p>`);
  session.record(`초대 · ${n.name} → T${t.number}`);
  setTimeout(() => {
    if (token !== flowToken || state.table !== t.id) return;
    if (info?.mood !== 'talk') {
      show('INVITE · T' + t.number, `<h2>이번엔 패스래요</h2><div class="bubble-line">${esc(n.name)}: 오늘은 천천히 구경하고 싶어요. 다음에 꼭 끼워줘요!</div><button class="action" id="iOk">괜찮아요</button>`);
      $('iOk').onclick = closeDialog; bubbleOver(n.root, '다음에!', '#d8f0ff', 2200); return;
    }
    closeDialog();
    bringGuest(n, t);
    bubbleOver(n.root, '갈게요!', '#e2f6d5', 2000);
    status(`${n.name}님이 수락했어요! 자리로 오는 중이에요`);
  }, 2200);
}

// 주민을 내 테이블 빈자리로 데려온다(층이 달라도 계단으로 걸어온다).
function bringGuest(n, t) {
  const seatIdx = t.freeOrder[1 + (state.guests[t.id]?.length ?? 0)];
  if (seatIdx === undefined) { status('빈자리가 없어요'); return; }
  const r = roaming.find(r => r.npc === n); if (r) r.disabled = true; n.walking = false;
  const seat = t.seats[seatIdx];
  n.guestTask = {path: levelRoute({x: n.root.position.x, z: n.root.position.z, level: npcLevel(n)}, {...t.approach, level: t.level ?? 1}), done: () => {
    n.root.position.set(seat.x, seat.y, seat.z); n.root.quaternion.setFromAxisAngle(axis, seat.heading);
    n.seated = true; n.baseY = seat.y; for (const l of n.legs) l.rotation.x = -1.35; n.guestOf = t.id;
    session.addGuest(t.id, n.id); refresh();
    bubbleOver(n.root, '반가워요!', '#e2f6d5', 2400);
    status(`${n.name}님이 T${t.number}에 합류했어요 🎉`);
  }};
}

// 퇴장할 때 초대했던 주민은 다시 돌아다니게 한다.
function releaseGuests(onlyTable = null) {
  for (const n of npcs.filter(n => n.guestOf && (!onlyTable || n.guestOf === onlyTable))) {
    const t = tableOf(n.guestOf);
    n.seated = false; n.guestOf = null; n.baseY = 0; for (const l of n.legs) l.rotation.x = 0;
    if (t.level === 2) n.root.position.set(STAIRS.ground.x, 0, STAIRS.ground.z); else n.root.position.set(t.approach.x, 0, t.approach.z);
    const r = roaming.find(r => r.npc === n); if (r) { r.disabled = false; r.path = []; }
    if (onlyTable && state.guests[onlyTable]) state.guests[onlyTable] = state.guests[onlyTable].filter(id => id !== n.id);
  }
  if (!onlyTable) for (const n of npcs) n.giftGlass.visible = false;
}

// ── 상태 · 기록 · 지도 · 퇴장 ────────────────────────────
function moodOptions(name = 'mood') {
  return `<div class="mood-options" role="radiogroup">${Object.entries(MOODS).map(([k, m]) => `<label class="mood-option">
    <input type="radio" name="${name}" value="${k}" ${state.profile.mood === k ? 'checked' : ''}>
    <span><b class="mood-dot ${k}"></b><b>${m.label}</b><small>${m.hint}</small></span></label>`).join('')}</div>`;
}
function openMood() {
  show('오늘의 상태', `<h2>지금 어떤 기분이에요?</h2>${moodOptions('moodPick')}<button class="action" id="moodSave">바꾸기</button>`);
  $('moodSave').onclick = () => { const v = document.querySelector('input[name=moodPick]:checked')?.value; if (v) setMood(v); closeDialog(); status('상태를 ' + ro(MOODS[state.profile.mood].label) + ' 바꿨어요.'); };
}

function orderRows() {
  if (!state.orders.length) return '<p class="empty">아직 주문이 없어요.</p>';
  return `<ul class="orders">${[...state.orders].reverse().map(o => `<li class="${o.status === '취소' ? 'cancelled' : ''}">
    <span class="swatch" style="--drink:${o.color}"></span>
    <div><b>${esc(o.name)}</b><small>${o.table ? (o.from ? `T${tableOf(o.from).number} → ` : '') + 'T' + tableOf(o.table).number + ' 서빙' : '바 픽업'} · ${won(o.price)}</small></div>
    <span class="status s-${o.status.replace(' ', '')}">${o.status}</span>
    ${o.status === '접수' ? `<button data-cancel="${o.id}">취소</button>` : ''}</li>`).join('')}</ul>`;
}

// ── MY: 내 정보 · 상점 · 기록 ─────────────────────────────
function showJournal() { showMy('records'); }
function showMy(tab = 'profile') {
  const p = state.profile, s = session.summary();
  const tabs = `<div class="tabs" role="tablist">${[['profile', '내 정보'], ['char', '캐릭터'], ['postcards', '엽서', 'postcards'], ['titles', '칭호', 'titles'], ['shop', '상점', 'shop'], ['records', '기록']].filter(x => !x[2] || has(x[2])).map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'profile') {
    const praises = Object.entries(wallet.praiseIn);
    const pet = SHOP.find(i => i.kind === 'pet' && i.value === wallet.equipped.pet);
    const nextUp = [['order', '자리에 앉으면 주문·표현'], ['stamps', '첫 음료가 나오면 스탬프 카드'], ['openRoom', '한 번 앉았다 일어나면 직접 판 열기'], ['postcards', '첫 퇴장 때 밤의 엽서·첫 칭호'], ['shop', '다시 방문하면 코인·상점·꾸미기·마을 산책']].find(([f]) => !has(f));
    body = `<div class="me-card">
        <h2>${esc(p.name)} <i class="g">${genderMark(p.gender)}</i></h2>
        <p class="meta profile-line">${[p.age ? p.age + '세' : '', p.job, p.mbti].filter(Boolean).map(esc).join(' · ') || '자세한 정보는 비공개'}</p>
        <p class="meta"><b class="mood-dot ${p.mood}"></b>${MOODS[p.mood].label} · <button class="link" id="jMood">바꾸기</button></p>
      </div>
      <dl class="recap">
        <div><dt>방문</dt><dd>${wallet.visits}회 · 서로 다른 날 ${wallet.visitDays.length}일</dd></div>
        ${has('coins') ? `<div><dt>코인</dt><dd>🪙 ${coinText()}${TEST_MODE.infiniteCoins ? ' (테스트판 무한)' : ''}</dd></div>` : ''}
        ${has('stamps') ? `<div><dt>스탬프 (데모)</dt><dd><span class="stamps">${Array.from({length: STAMP_GOAL}, (_, i) => `<i class="${i < wallet.stamps ? 'on' : ''}"></i>`).join('')}</span>${wallet.coupons ? ` 🎟 ${wallet.coupons}장` : ''}</dd></div>` : ''}
        ${has('postcards') ? `<div><dt>친구</dt><dd>${wallet.friends.filter(f => f.status === 'friend').map(f => esc(f.name)).join(', ') || '아직 없어요'}</dd></div>
        <div><dt>밤의 엽서</dt><dd>${wallet.memories.length ? `${wallet.memories.length}장 · <button class="link" id="jCards">엽서 보기</button>` : '퇴장하면 생겨요'}</dd></div>
        <div><dt>받은 칭찬 (나만 보기)</dt><dd>${praises.length ? praises.map(([t, n]) => `${esc(t)} ${n}`).join(' · ') : '아직 없어요'}</dd></div>` : ''}
        ${has('shop') ? `<div><dt>펫</dt><dd>${pet ? '🐾 ' + pet.name : `서로 다른 날 ${PET_UNLOCK_DAYS}번 오면 입양할 수 있어요`}</dd></div>` : ''}
      </dl>
      ${nextUp ? `<p class="note">다음에 열리는 것 · ${nextUp[1]}</p>` : ''}
      ${teamBlock()}
      <details class="more"><summary>자세한 프로필 (선택)</summary>
        <div class="row2"><label class="field" for="pAge"><span>나이</span><input id="pAge" type="number" inputmode="numeric" min="19" max="99" value="${p.age ?? ''}"></label>
        <label class="field" for="pMbti"><span>MBTI</span><select id="pMbti"><option value="">선택 안 함</option>${MBTI.map(m => `<option ${p.mbti === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
        <label class="field" for="pJob"><span>직업 · 학교</span><input id="pJob" maxlength="16" value="${esc(p.job ?? '')}" placeholder="예: 부동산 금융"></label>
        <label class="field" for="pFav"><span>좋아하는 술</span><select id="pFav">${DRINKS.filter(d => !d.soldOut).map(d => `<option value="${d.id}" ${p.fav === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
        <button class="secondary" id="pSave">저장</button>
        <p class="note">적은 정보는 누가 내 카드를 '자세히' 눌렀을 때만 보여요.</p>
      </details>
      <label class="toggle-row"><input type="checkbox" id="allFeat" ${wallet.allFeatures ? 'checked' : ''}> 전체 기능 보기 <small>주문·판 열기·게임·상점·마을을 지금 바로 열어요. 펫·칭호는 그대로 조건이 필요해요.</small></label>
      <button class="secondary" id="openShare">QR로 친구 부르기</button>`;
  } else if (tab === 'char') {
    body = charBody();
  } else if (tab === 'postcards') {
    body = wallet.memories.length ? `<p class="meta">퇴장할 때 자동으로 저장돼요(최근 20장). 매장 밖에서 다시 열어 칭찬·친구 신청을 할 수 있어요.</p>
      <ul class="cards">${wallet.memories.map(m => `<li><button data-card="${esc(m.id ?? '')}" ${m.id ? '' : 'disabled'}>
        <b>${esc(m.date)} · ${esc(m.place ?? '성수 마을')}</b>
        <small>${m.v === 2 ? `${m.tables.map(t => 'T' + t.number + ' ' + esc(t.title)).join(', ') || '구경만 했어요'} · 함께 ${m.mates.length}명` : '예전 형식 · 함께한 주민 기록 없음'}</small>
        ${m.memo ? `<em>“${esc(m.memo)}”</em>` : ''}</button></li>`).join('')}</ul>${inVillage ? '<p class="warn">지금은 매장 안이라 엽서를 열어볼 수만 있어요.</p>' : ''}`
      : '<p class="empty">아직 엽서가 없어요. 입구에서 ‘오늘 밤 마무리’를 하면 생겨요.</p>';
  } else if (tab === 'titles') {
    body = `<p class="meta">칭호 하나를 골라 이름 앞에 달아요. 진행률은 나만 볼 수 있어요.</p><div class="titles">${TITLES.map(t => {
      const own = wallet.titles.includes(t.id), pr = titleProgress(t);
      return `<div class="title-card${own ? ' own' : ''}${wallet.title === t.id ? ' on' : ''}"><b>〈${esc(t.name)}〉</b><small>${esc(t.how)}${!own && pr !== null ? ` · ${pr}/${t.goal}` : ''}</small>
        ${own ? `<button data-title="${t.id}">${wallet.title === t.id ? '장착 중' : '장착'}</button>` : '<span class="lock">🔒</span>'}</div>`;
    }).join('')}</div>${wallet.title ? '<button class="secondary" data-title="">칭호 떼기</button>' : ''}`;
  } else if (tab === 'shop') {
    const eq = wallet.equipped;
    const isOn = i => (i.kind === 'jacket' && eq.jacket === i.value) || (i.kind === 'accessory' && eq.accessory === i.value) || (i.kind === 'pet' && eq.pet === i.value);
    const groups = [['jacket', '옷'], ['accessory', '액세서리'], ['pet', '펫 · 단골의 상징']];
    body = `<p class="coin-line">🪙 <b>${coinText()}</b> 코인 <small>${TEST_MODE.infiniteCoins ? '테스트판이라 코인이 줄지 않아요' : `음료 1잔 주문할 때마다 +${COIN_RULES.drink} 충전`}</small></p>
      ${groups.map(([k, l]) => `<h3>${l}</h3><div class="shop">${k === 'jacket' ? `<div class="item${eq.jacket === 'lime' ? ' on' : ''}"><b>기본 라임 재킷</b><small>기본</small><button data-base="jacket">${eq.jacket === 'lime' ? '착용 중' : '입기'}</button></div>` : ''}${k === 'accessory' ? `<div class="item${eq.accessory === 'none' ? ' on' : ''}"><b>없음</b><small>기본</small><button data-base="accessory">${eq.accessory === 'none' ? '착용 중' : '빼기'}</button></div>` : ''}${SHOP.filter(i => i.kind === k).map(i => {
        const own = wallet.owned.includes(i.id);
        const petLock = i.kind === 'pet' && !own && (!TEST_MODE.petsOpen && wallet.visitDays.length < PET_UNLOCK_DAYS);
        if (petLock) return `<div class="item"><b>${i.name}</b><small>🔒 방문일 ${wallet.visitDays.length}/${PET_UNLOCK_DAYS}</small><button disabled>잠김</button></div>`;
        return `<div class="item${isOn(i) ? ' on' : ''}"><b>${i.name}</b><small>${own ? '보유' : '🪙 ' + i.price}</small><button data-item="${i.id}" ${!own && !TEST_MODE.infiniteCoins && wallet.coins < i.price ? 'disabled' : ''}>${own ? (isOn(i) ? (k === 'pet' ? '데려가는 중' : '착용 중') : (k === 'pet' ? '데려가기' : '입기')) : '사기'}</button></div>`;
      }).join('')}</div>`).join('')}
      <p class="note">${TEST_MODE.petsOpen ? '테스트판이라 펫을 바로 데려올 수 있어요(실서비스는 서로 다른 날 ' + PET_UNLOCK_DAYS + '번 방문 후).' : `펫은 단골의 상징이라 서로 다른 날 ${PET_UNLOCK_DAYS}번 방문하면 입양할 수 있어요(임시 기준).`} 코인은 꾸미기에 쓰고, 음료를 주문하면 1잔에 +${COIN_RULES.drink}씩 충전돼요(논알코올 포함, 현금 충전 없음).</p>`;
  } else {
    body = `<h3>주문</h3>${orderRows()}
      <div class="order-total"><span>합계 ${s.orders}잔</span><b>${won(s.total)}</b></div>
      <h3>기록</h3>${state.logs.length ? '<ul class="journal-list">' + state.logs.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '<p class="empty">주민에게 인사하거나 테이블에 앉아보세요.</p>'}
      ${state.table ? '<button id="jLeave" class="secondary">현재 테이블에서 일어나기</button>' : ''}
      <p class="note">이 기록은 이번 체험에만 남아요. <a href="social.html">이전 2D 체험</a></p>`;
  }
  wallet.newDot = false; saveWallet(); applyUnlocks();
  show('MY · ' + p.name, tabs + body);
  $('modalContent').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showMy(b.dataset.tab));
  if ($('jMood')) $('jMood').onclick = openMood;
  if ($('openShare')) $('openShare').onclick = showShare;
  if ($('allFeat')) $('allFeat').onchange = e => { wallet.allFeatures = e.target.checked; saveWallet(); applyUnlocks(); refresh(); showMy('profile'); };
  if ($('pSave')) $('pSave').onclick = () => { const age = +$('pAge').value; session.setProfile({age: age >= 19 && age <= 99 ? age : null, mbti: $('pMbti').value, job: $('pJob').value.trim().slice(0, 16), fav: $('pFav').value}); saveProfile(); status('프로필을 저장했어요'); showMy('profile'); };
  if ($('jCards')) $('jCards').onclick = () => showMy('postcards');
  if (tab === 'char') {
    requestAnimationFrame(renderPreview);
    $('modalContent').querySelectorAll('[data-sp]').forEach(b => b.onclick = () => setLookPart('species', b.dataset.sp));
    $('modalContent').querySelectorAll('[data-fur]').forEach(b => b.onclick = () => setLookPart('fur', b.dataset.fur));
    $('modalContent').querySelectorAll('[data-ex]').forEach(b => b.onclick = () => setLookPart('extra', b.dataset.ex));
  }
  $('modalContent').querySelectorAll('[data-card]').forEach(b => b.onclick = () => showPostcard(b.dataset.card));
  $('modalContent').querySelectorAll('[data-facc]').forEach(b => b.onclick = () => { b.disabled = true; online.acceptFriend(b.dataset.facc).then(() => { status('💌 팀 친구가 됐어요'); showMy('profile'); }); });
  $('modalContent').querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => {
    try { const o = session.cancelOrder(+b.dataset.cancel); if (o.free) { wallet.coupons++; saveWallet(); } status('주문을 취소했어요.'); } catch (e) { status(e.message); }
    refresh(); showMy('records');
  });
  if ($('jLeave')) $('jLeave').onclick = confirmStandOnly;
  $('modalContent').querySelectorAll('[data-base]').forEach(b => b.onclick = () => { wallet.equipped[b.dataset.base] = b.dataset.base === 'jacket' ? 'lime' : 'none'; saveWallet(); applyLook(); refresh(); showMy('shop'); });
  $('modalContent').querySelectorAll('[data-item]').forEach(b => b.onclick = () => buyOrEquip(b.dataset.item));
  $('modalContent').querySelectorAll('[data-title]').forEach(b => b.onclick = () => { wallet.title = b.dataset.title || null; saveWallet(); refresh(); showMy('titles'); });
}

function buyOrEquip(id) {
  const i = SHOP.find(i => i.id === id); if (!i) return;
  if (i.kind === 'pet' && !wallet.owned.includes(id) && (!TEST_MODE.petsOpen && wallet.visitDays.length < PET_UNLOCK_DAYS)) { status(`펫은 서로 다른 날 ${PET_UNLOCK_DAYS}번 방문하면 입양할 수 있어요`); return; }
  if (!wallet.owned.includes(id)) {
    if (!TEST_MODE.infiniteCoins && wallet.coins < i.price) { status('코인이 모자라요. 자리에서 한 잔 주문하면 충전돼요'); return; }
    if (!TEST_MODE.infiniteCoins) wallet.coins -= i.price; wallet.owned.push(id); renderCoins(); session.record(`상점 · ${i.name} (-${i.price})`);
    status(`${i.name}${i.kind === 'pet' ? '를 데려왔어요 🐾' : '를 샀어요'}`);
  }
  if (i.kind === 'pet') wallet.equipped.pet = wallet.equipped.pet === i.value ? null : i.value;
  else wallet.equipped[i.kind] = i.value;
  saveWallet(); applyLook(); refresh(); showMy('shop');
}

function showMap() {
  if (place === 'town') { showTownMap(); return; }
  show('SEONGSU · 매장 지도', `<h2>어디로 가볼까요?</h2>
    <canvas id="floorPlan" class="map-plan" width="440" height="360" aria-label="매장 평면도. 아래 버튼으로 구역을 고르세요."></canvas>
    <div class="place-list">${SPOTS.map(s => { const t = tableOf(s.id); const b = t ? tableBadge(t) : null;
      return `<button data-spot="${s.id}">${t ? `<i>T${t.number}</i>` : ''}${esc(s.title)}<small class="${b ? b[1] : ''}">${b ? b[0] : s.kind === 'exit' ? '오늘 마무리' : '찾아가기'}</small></button>`; }).join('')}</div>
    <p class="note">가상 배치예요. 실제 매장 치수와 통로는 실측 후 다시 그려요.</p>`);
  drawMap();
  $('modalContent').querySelectorAll('[data-spot]').forEach(b => b.onclick = () => selectEntity(b.dataset.spot));
}

function drawMap() {
  const canvas = $('floorPlan'); if (!canvas) return;
  const c = canvas.getContext('2d'), mx = x => 220 + x * 22, mz = z => 180 + z * 22;
  c.clearRect(0, 0, 440, 360);
  c.fillStyle = '#d9c7b0'; c.fillRect(mx(-9), mz(-7.5), 396, 330);
  c.fillStyle = '#5a3a28'; c.fillRect(mx(-9), mz(-7.5), 396, 8); c.fillRect(mx(-9), mz(-7.5), 8, 330);
  c.font = '14px Jua, sans-serif'; c.textAlign = 'center';
  // 2층(메자닌) 띠와 계단
  c.fillStyle = '#5a3a2899'; c.fillRect(mx(-8.4), mz(-7.5), 16.8 * 22, (MEZZ.front + 7.5) * 22);
  c.fillStyle = '#fff7e6'; c.textAlign = 'left'; c.fillText('2F AFTER', mx(-6.9), mz(-5.45)); c.textAlign = 'center';
  c.fillStyle = '#8a5636'; c.fillRect(mx(STAIRS.x - STAIRS.width / 2), mz(STAIRS.topZ), STAIRS.width * 22, (STAIRS.bottomZ - STAIRS.topZ) * 22);
  // Welcome Zone
  c.strokeStyle = '#ff8a3d'; c.setLineDash([5, 4]); c.beginPath(); c.arc(mx(WELCOME_ZONE.x), mz(WELCOME_ZONE.z), WELCOME_ZONE.r * 22, 0, 7); c.stroke(); c.setLineDash([]);
  // 혼술 코너
  const nook = OBSTACLES.rects[2];
  c.fillStyle = '#c98a5c'; c.fillRect(mx(nook.minX), mz(nook.minZ), (nook.maxX - nook.minX) * 22, (nook.maxZ - nook.minZ) * 22);
  c.fillStyle = '#3b2a22'; c.fillText('혼술', mx(-7.4), mz(4.5) + 5);
  for (const t of TABLES) {
    const [, kind] = tableBadge(t);
    c.fillStyle = kind === 'mine' ? '#ff8a3d' : kind === 'full' ? '#a89a8c' : kind === 'pending' ? '#f4b942' : '#3cb98a';
    c.beginPath();
    if (t.type === 'ring') { c.arc(mx(t.x), mz(t.z), RING.outer * 22, 0, Math.PI * 2); c.fill(); c.fillStyle = '#5a3a28'; c.beginPath(); c.arc(mx(t.x), mz(t.z), RING.inner * 22, 0, Math.PI * 2); }
    else if (t.type === 'booth') { c.arc(mx(t.x), mz(t.z), 26, Math.PI, Math.PI * 2); c.lineTo(mx(t.x), mz(t.z)); }
    else if (t.type === 'long') c.roundRect(mx(t.x - 1.3), mz(t.z - .5), 2.6 * 22, 22, 6);
    else if (t.type === 'sofa') c.roundRect(mx(4.6), mz(.6), 3.2 * 22, 2.5 * 22, 10);
    else c.arc(mx(t.x), mz(t.z), 19, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff'; c.fillText(t.type === 'ring' ? 'BAR' : 'T' + t.number, mx(t.x), mz(t.z) + 5);
  }
  for (const n of npcs) { c.fillStyle = '#5a3a28'; c.beginPath(); c.arc(mx(n.root.position.x), mz(n.root.position.z), 3.5, 0, 7); c.fill(); }
  c.fillStyle = '#ff6a2b'; c.beginPath(); c.arc(mx(actor.position.x), mz(actor.position.z), 6.5, 0, 7); c.fill();
  c.fillStyle = '#3b2a22'; c.fillText('나', mx(actor.position.x), mz(actor.position.z) - 11);
  c.fillText('입구', 220, mz(6.6));
}

function openExit() {
  const s = session.summary();
  show('ENTRANCE · 입구', `<h2>${has('town') ? '밖으로 나가볼까요?' : '오늘 밤, 여기까지 할까요?'}</h2>
    ${has('town') ? `<button class="action" id="toTown">🌆 마을로 나가기 <small>산책 · 방문은 계속돼요</small></button>
    <p class="note">바 밖 작은 서울 골목을 걸어요. 주문·자리·기록은 그대로고, 다시 문으로 들어오면 돼요.</p>
    <h3>오늘 방문을 끝낼 때</h3>` : ''}
    <dl class="recap">
      <div><dt>앉았던 테이블</dt><dd>${s.tables.length ? s.tables.map(esc).join(', ') : '없음'}</dd></div>
      <div><dt>인사한 주민</dt><dd>${s.greeted}명</dd></div>
      <div><dt>주문</dt><dd>${s.orders}잔 · ${won(s.total)}</dd></div>
    </dl>
    ${s.unfinished ? `<p class="warn">아직 준비 중인 주문이 ${s.unfinished}잔 있어요. 마무리하면 호스트가 확인해요.</p>` : ''}
    <p class="note">실제 매장에서는 이때 자리가 정리되고 정산을 확인해요. 체험판은 여기서 초기화돼요.</p>
    <button class="secondary" id="exitGo">오늘 방문 마무리 (퇴장)</button><button class="secondary" id="exitStay">조금 더 있을래요</button>`);
  $('exitStay').onclick = closeDialog;
  if ($('toTown')) $('toTown').onclick = () => { closeDialog(); goOutside(); };
  $('exitGo').onclick = () => {
    if (wallet.visits === 1) { grantTitle('arrived'); grantTitle('firstnight'); }
    unlock('titles', {quiet: true}); unlock('postcards', {quiet: true});
    const memory = makeMemory();
    wallet.memories.unshift(memory); wallet.memories = wallet.memories.slice(0, 20); saveWallet();
    online?.leaveVillage(); inVillage = false;
    stand(); orderGen++; flowToken++; releaseGuests(); session.reset(); glassGroup.visible = false; drink = null; giftDemoDone = false; refresh();
    showPostcard(memory.id, {fresh: true});
  };
}

// ── 오늘의 기억 · 밤의 엽서 ──────────────────────────────
// 퇴장하면 엽서가 자동 저장된다(당시 값을 복사). 칭찬·친구 신청은 선택이고, 매장 밖에서 아무 때나 엽서를 다시 열어 할 수 있다.
const mateKey = x => x.remote ? 'u:' + x.remote : 'npc:' + x.name;
function makeMemory() {
  const mates = [];
  for (const id of state.joined) {
    const t = tableOf(id);
    for (const name of t.members) mates.push({key: 'npc:' + name, name, g: PEOPLE[name]?.gender ?? '', remote: null, table: t.number, praised: false});
    for (const nid of new Set([...(state.met?.[id] ?? []), ...(state.guests[id] ?? [])])) { const n = npcs.find(n => n.id === nid); if (n) mates.push({key: 'npc:' + n.name, name: n.name, g: PEOPLE[n.name]?.gender ?? '', remote: null, table: t.number, praised: false}); }
  }
  for (const x of online?.metList() ?? []) { const t = tableOf(x.table); if (t) mates.push({key: 'u:' + x.by, name: x.name, g: x.g ?? '', remote: x.by, table: t.number, praised: false}); }
  const now = Date.now();
  return {v: 2, id: 'pc' + now.toString(36), visitId: state.visitId ?? null, at: now, date: kstDate(now).replace(/-0?/g, '.'), place: '성수 마을',
    name: state.profile.name, title: wallet.title ? titleName(wallet.title) ?? null : null,
    tables: (state.visitTables ?? []).map(t => ({...t})), mates: mates.filter((m, i) => mates.findIndex(x => x.key === m.key) === i),
    drinks: session.summary().orders, memo: ''};
}
// 친구 관계는 엽서마다가 아니라 사람(키)마다 하나
function relationOf(x) {
  if (x.remote) { const st = online?.friendStatus(x.remote); return st ? {status: st} : null; }
  return wallet.friends.find(f => (f.key ?? 'npc:' + f.name) === x.key) ?? null;
}
let memoTimer = 0;
function showPostcard(id, {fresh = false} = {}) {
  const m = wallet.memories.find(x => x.id === id); if (!m) { showMy('postcards'); return; }
  const old = m.v !== 2, locked = inVillage;
  const mateRow = (x, i) => {
    const f = relationOf(x), here = x.remote && online?.isHere(x.remote);
    const off = locked || here, why = locked ? '매장 안' : here ? '상대가 아직 매장에 있어요' : '';
    return `<li><div><b>${esc(x.name)} <i class="g">${genderMark(x.g)}</i>${x.remote ? ' <em class="ok">팀원</em>' : ''}</b><small>T${x.table}${why ? ' · ' + why : ''}</small></div>
      <button data-praise="${i}" ${x.praised || off ? 'disabled' : ''}>${x.praised ? '칭찬함' : '👏 칭찬'}</button>
      <button data-friend="${i}" ${f || off ? 'disabled' : ''}>${f ? (f.status === 'friend' ? '친구' : '신청함') : '💌 친구 신청'}</button></li>`;
  };
  show(fresh ? '오늘의 기억' : '밤의 엽서', `<div class="postcard">
      <small>${esc(m.date)} · ${esc(m.place ?? '성수 마을')}</small>
      <b>${m.title ? `〈${esc(m.title)}〉 ` : ''}${esc(m.name ?? state.profile.name)}</b>
      <ul>${old ? (m.tables ?? []).map(t => `<li>${esc(t)}</li>`).join('') || '<li>예전 형식의 엽서예요</li>'
        : m.tables.length ? m.tables.map(t => `<li>T${t.number} · ${esc(t.title)}${t.opener ? `<em>“${esc(t.opener)}”</em>` : ''}</li>`).join('') : '<li>오늘은 천천히 구경만 했어요</li>'}</ul>
      <label class="field" for="memo"><span>오늘 한 줄 (나만 보기)</span><input id="memo" maxlength="40" placeholder="예: 영화 추천 3개 받음" value="${esc(m.memo ?? '')}"></label>
    </div>
    <h3>함께한 주민</h3>
    ${old ? '<p class="empty">예전 형식의 엽서라 함께한 주민 기록이 없어요.</p>' : m.mates.length ? `<ul class="mates">${m.mates.map(mateRow).join('')}</ul>` : '<p class="empty">같은 테이블에 앉은 사람만 여기에 보여요.</p>'}
    ${locked ? '<p class="warn">매장 안에서는 지난 엽서로도 칭찬·친구 신청을 할 수 없어요. 퇴장한 뒤에 열어요.</p>' : ''}
    <p class="note">엽서는 자동으로 저장돼요. 칭찬·친구 신청은 지금 하지 않아도 돼요. 내일이라도 MY › 엽서에서 다시 열 수 있어요. 누가 거절했는지는 보이지 않아요.${m.mates.some(x => !x.remote) ? ' (예시 주민의 응답은 체험)' : ''}</p>
    <button class="action" id="saveMemory">${fresh ? '마무리' : '엽서 목록으로'}</button>`, {lock: fresh});
  const keepMemo = () => { m.memo = ($('memo')?.value ?? m.memo ?? '').slice(0, 40); };
  $('memo').addEventListener('input', () => { keepMemo(); clearTimeout(memoTimer); memoTimer = setTimeout(saveWallet, 400); });
  $('modalContent').querySelectorAll('[data-praise]').forEach(b => b.onclick = () => {
    keepMemo(); saveWallet();
    const x = m.mates[+b.dataset.praise];
    show('PRAISE · ' + x.name, `<h2>${esc(x.name)}님에게 남길 칭찬</h2><div class="choice-list">${PRAISE_TAGS.map((t, i) => `<button data-p="${i}"><b>👏 ${t}</b></button>`).join('')}</div>
      <p class="note">익명으로 조용히 전해져요. 숫자는 상대 본인만 MY에서 볼 수 있어요.</p><button class="secondary" id="pBack">돌아가기</button>`, {lock: fresh});
    $('pBack').onclick = () => showPostcard(id, {fresh});
    $('modalContent').querySelectorAll('[data-p]').forEach(pb => pb.onclick = () => {
      if (x.praised || inVillage) { showPostcard(id, {fresh}); return; }
      if (x.remote) online?.praise(x.remote, +pb.dataset.p);
      x.praised = true; saveWallet();
      session.record(`칭찬 · ${x.name} · ${PRAISE_TAGS[+pb.dataset.p]}`); showPostcard(id, {fresh}); status(`${x.name}님에게 칭찬을 남겼어요`);
    });
  });
  $('modalContent').querySelectorAll('[data-friend]').forEach(b => b.onclick = () => {
    keepMemo(); saveWallet();
    const x = m.mates[+b.dataset.friend];
    if (relationOf(x) || inVillage) return;
    b.disabled = true;
    if (x.remote) {
      online?.friendRequest(x.remote, x.name).then(() => { if (dialog.open && $('modalLabel').textContent === (fresh ? '오늘의 기억' : '밤의 엽서')) showPostcard(id, {fresh}); });
      status(`${x.name}님에게 친구 신청을 보냈어요. 상대가 수락하면 친구가 돼요`); return;
    }
    const mood = (WANDERERS.find(w => w.name === x.name) ?? LOUNGERS.find(w => w.name === x.name))?.mood ?? 'talk';
    const f = {key: x.key, name: x.name, status: 'sent'}; wallet.friends.push(f); saveWallet();
    showPostcard(id, {fresh}); status(`${x.name}님에게 친구 신청을 보냈어요`);
    if (mood === 'talk') setTimeout(() => { f.status = 'friend'; saveWallet(); if (dialog.open && $('memo') && wallet.memories.find(z => z.id === id)) { keepMemo(); showPostcard(id, {fresh}); } status(`💌 ${x.name}님이 친구 신청을 수락했어요 · 우체통은 다음 버전에서`); }, 1600);
  });
  $('saveMemory').onclick = () => {
    keepMemo(); saveWallet(); checkTitles();
    if (!fresh) { showMy('postcards'); return; }
    // 체험: 함께 앉았던 예시 주민이 나에게 남긴 칭찬(퇴장 후에만 도착)
    const npcMate = m.mates.find(x => !x.remote);
    if (npcMate) { const tag = PRAISE_TAGS[0]; wallet.praiseIn[tag] = (wallet.praiseIn[tag] ?? 0) + 1; saveWallet(); checkTitles(); }
    show('SEE YOU', `<h2>또 놀러 와요</h2><p>오늘 밤 마을은 여기까지예요. 엽서는 MY › 엽서에 있어요. 내일 다시 열어서 칭찬·친구 신청을 해도 돼요.</p>
      ${npcMate ? `<p class="note">💌 ${esc(npcMate.name)}님이 칭찬을 남겼어요 (체험 · 숫자는 MY에서 나만 봐요)</p>` : ''}
      <button class="action" id="again">처음부터 다시</button>`, {onClose: () => openVillages()});
    $('again').onclick = closeDialog;
  };
}

function saveProfile() { try { localStorage.setItem('bam-profile', JSON.stringify(state.profile)); } catch {} }
function loadProfile() { try { const p = JSON.parse(localStorage.getItem('bam-profile') || 'null'); if (p && p.name) session.setProfile(p); } catch {} }
function applyJacket() { const j = JACKETS.find(j => j.id === wallet.equipped.jacket) ?? JACKETS[0]; jacket.color.set(j.color); }
function applyLook() {
  world.setLook(wallet.look ?? CHAR_DEFAULT);
  applyJacket(); setAccessory(wallet.equipped.accessory ?? 'none');
  const want = wallet.equipped.pet;
  if (myPet && myPet.species !== want) { scene.remove(myPet.group); myPet = null; }
  if (want && !myPet) { const item = SHOP.find(i => i.kind === 'pet' && i.value === want); myPet = {...makePet(want, item?.fur ?? '#e8bd85'), species: want}; myPet.group.position.set(actor.position.x + .5, actor.position.y, actor.position.z + .3); }
}

// 매장 밖에서 보는 오늘의 마을: 숫자와 분위기만. 사람과 미니미는 체크인해야 보인다.
function openVillages() {
  const openTables = TABLES.filter(t => !session.isFull(t.id)).length;
  const solo = WANDERERS.length + LOUNGERS.length + 5;
  const card = v => {
    const live = v.open ? RESIDENT_COUNT : v.live, s2 = v.open ? solo : v.solo, f = v.open ? live - solo : v.friends, tb = v.open ? openTables : v.tables;
    return `<article class="village${v.open ? ' is-open' : ''}">
      <header><b>${v.name}</b><span class="live">● ${live} LIVE</span></header>
      <dl><div><dt>혼자</dt><dd>${s2}</dd></div><div><dt>일행</dt><dd>${f}</dd></div><div><dt>열린 판</dt><dd>${tb}</dd></div><div><dt>평균 체류</dt><dd>${v.stay}</dd></div></dl>
      <p class="vibe">오늘 분위기 · ${v.vibe}</p>
      ${v.open ? `<button class="action" id="goVillage">${v.name} 마을로 놀러가기</button>` : '<button class="secondary" disabled>예시 지점 · 준비 중</button>'}
    </article>`;
  };
  show("TONIGHT'S VILLAGES", `<h2>오늘 밤, 어디가 살아 있을까?</h2>
    <div class="villages">${VILLAGES.map(card).join('')}</div>
    <p class="note">숫자는 체험용 예시예요. 매장 밖에서는 숫자와 분위기만 보여요. 사람과 미니미는 매장에 체크인해야 보여요.</p>
    <div id="netLine" class="net-line">${netLine()}</div>`);
  bindNetLine();
  $('goVillage').onclick = async () => {
    $('goVillage').disabled = true; $('goVillage').textContent = '연결 확인 중…';
    const ok = await (online ? online.gate() : true);
    if (ok) openOnboarding(); else openVillages();
  };
}

// ── 체크인: 본인인증 → 프로필 → 직업·학생 인증(직원 승인). 모두 체험용 화면 ──
const MBTI = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];
function openOnboarding() {
  const p = state.profile;
  if (p.verified) {
    show('CHECK-IN · 다시 오셨네요', `<h2>${esc(p.name)}님, 또 오셨네요!</h2>
      <p class="meta">방문 ${wallet.visits + 1}번째${wallet.title ? ` · 〈${esc(titleName(wallet.title))}〉` : ''}</p>
      <p>오늘도 편하게 놀다 가요.</p>
      <fieldset><legend>오늘의 상태</legend>${moodOptions('moodStart')}</fieldset>
      <button class="action" id="enter">마을로 들어가기</button><button class="secondary" id="reverify">정보 다시 입력</button>`, {onClose: enterVillage, lock: true});
    $('enter').onclick = () => { state.profile.mood = document.querySelector('input[name=moodStart]:checked')?.value ?? p.mood; closeDialog(); };
    $('reverify').onclick = stepProfile; return;
  }
  stepProfile();
}

// 테스트판 체크인: 승인 단계 없이 한 화면(닉네임 · 기본 외형 · 성인 확인 · 오늘의 상태)
function stepProfile() {
  const p = state.profile, L = wallet.look ?? CHAR_DEFAULT;
  const basicFur = ['#f08a3c', '#f2b675', '#fbf3ea', '#8a8290', '#2f2b30', '#a9b8f0'];
  show('CHECK-IN · 오늘 밤의 나', `<h2>오늘 밤의 나</h2>
    <label class="field" for="nick"><span>닉네임</span><input id="nick" maxlength="10" autocomplete="off" value="${esc(p.name)}"></label>
    <fieldset><legend>기본 외형</legend><div class="char-grid six">${BASIC_SPECIES.map(id => { const sp = CHAR_SPECIES.find(x => x[0] === id); return `<label class="pick"><input type="radio" name="sp" value="${id}" ${L.species === id ? 'checked' : ''}><span>${sp[2]}</span>${sp[1]}</label>`; }).join('')}</div>
      <div class="swatches">${basicFur.map((c, i) => `<label class="sw"><input type="radio" name="fur" value="${c}" ${L.fur === c || (!basicFur.includes(L.fur) && i === 0) ? 'checked' : ''}><span style="--sw:${c}"></span></label>`).join('')}</div></fieldset>
    <fieldset class="jackets"><legend>성별 (이름표에 표시 · 선택)</legend>${[['M', '남 ♂'], ['F', '여 ♀'], ['', '말 안 함']].map(([v, l]) => `<label><input type="radio" name="gender" value="${v}" ${(p.gender ?? '') === v ? 'checked' : ''}>${l}</label>`).join('')}</fieldset>
    <label class="check-row"><input type="checkbox" id="adult" ${p.adult ? 'checked' : ''}> 만 19세 이상이에요</label>
    <fieldset><legend>오늘의 상태</legend>${moodOptions('moodStart')}</fieldset>
    <button class="action" id="profileNext">마을로 들어가기</button>
    <p class="note">테스트판이라 승인 단계 없이 바로 들어가요. 나이·직업·MBTI는 MY에서 원할 때만 적어요. 꾸미기는 다시 방문하면 더 열려요.</p>`, {lock: true});
  $('profileNext').onclick = () => {
    if (!$('adult').checked) { status('만 19세 이상만 입장할 수 있어요'); return; }
    const pick = n => document.querySelector(`input[name=${n}]:checked`)?.value;
    session.setProfile({name: ($('nick').value || '').trim().slice(0, 10) || '손님', gender: pick('gender') ?? '', adult: true, mood: pick('moodStart') ?? p.mood, fav: p.fav ?? 'highball'});
    wallet.look = {species: pick('sp') ?? 'fox', fur: pick('fur') ?? '#f08a3c', extra: 'none'}; saveWallet();
    closeDialog(); enterVillage();
  };
}

// 주말을 여기 두고 간: 같은 주 금·토·일 세 날 모두 방문(한국 날짜 기준)
function checkWeekend() {
  const days = new Set(wallet.visitDays);
  for (const d of days) {
    const t = Date.parse(d + 'T00:00:00Z');
    if (new Date(t).getUTCDay() !== 5) continue;
    const next = k => new Date(t + k * 86400e3).toISOString().slice(0, 10);
    if (days.has(next(1)) && days.has(next(2))) { grantTitle('weekend'); return; }
  }
}
function enterVillage() {
  state.profile.verified = true; inVillage = true;
  actor.position.set(ENTRY.x, 0, ENTRY.z); level = 1;
  wallet.visits++; state.visitId = 'v' + Date.now().toString(36); state.visitTables = [];
  const today = kstDate(); if (!wallet.visitDays.includes(today)) wallet.visitDays.push(today);
  wallet.visitDays = wallet.visitDays.slice(-400);
  saveWallet(); saveProfile(); applyLook(); refresh();
  checkWeekend();
  showWelcomeBoard();
  if (wallet.visits >= 2 && !['coins', 'shop', 'charFull', 'town'].every(f => wallet.unlocked.includes(f))) {
    for (const f of ['coins', 'shop', 'charFull', 'town']) unlock(f, {quiet: true});
    setTimeout(() => quietToast(`다시 왔네요! 🪙 코인 ${coinText()}개 · 상점 · 캐릭터 꾸미기 · 🌆 마을 산책이 열렸어요`), 5200);
  }
  checkTitles();
  setTimeout(() => {
    if (!wallet.rulesSeen) showRules(() => { if (!wallet.tutorialDone) startTutorial(); });
    else { status('🌙 마을 규칙: 현장에서는 연락처·친구 신청·칭찬을 부탁하지 않아요'); if (!wallet.tutorialDone) startTutorial(); }
  }, 4900);
}

// 마을 규칙: 첫 방문에 한 번 확인한다.
function showRules(next) {
  show('VILLAGE RULES', `<h2>밤마을에서는 이렇게 만나요 🌙</h2>
    <ul class="rules">${VILLAGE_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <p class="note">현장에서는 말풍선 표현과 테이블 초대·합석 요청만 있어요. 칭찬과 친구 신청은 퇴장한 뒤 ‘오늘의 기억’에서 할 수 있어요.</p>
    <button class="action" id="rulesOk">알겠어요</button>`, {onClose: () => { wallet.rulesSeen = true; saveWallet(); next?.(); }, lock: true});
  $('rulesOk').onclick = closeDialog;
}

// ── Welcome Zone 튜토리얼: 걷기 → 점프 → 판 구경 → 자리로 ──
const TUT = [
  {key: 'table', text: '테이블 이름표를 누르면 오늘의 판을 보고 앉을 수 있어요'},
  {key: 'sit', text: '마음에 드는 판이면 [같이 앉아도 될까요?]를 눌러요. 호스트가 자리로 안내해요'},
  {key: 'done', text: '앉았어요! 아래 [한잔 주문]과 😊 표현이 생겼어요. 도움이 필요하면 언제든 [호스트]'}
];
function startTutorial() { tutorial = {step: 0}; renderTutorial(); }
function renderTutorial() {
  const el = $('tutorial');
  if (!tutorial || place === 'town') { el.hidden = true; $('stage').classList.remove('tut-on'); return; }
  const st = TUT[tutorial.step], last = tutorial.step === TUT.length - 1;
  el.innerHTML = `<small>WELCOME ZONE · ${tutorial.step + 1}/${TUT.length}</small><p>${st.text}</p>
    <div class="tut-row"><span class="dots">${TUT.map((_, i) => `<i class="${i <= tutorial.step ? 'on' : ''}"></i>`).join('')}</span>
    ${last ? `<button id="tutDone">알겠어요</button>` : '<button id="tutSkip" class="ghost">건너뛰기</button>'}</div>`;
  el.hidden = false; $('stage').classList.add('tut-on');
  if (last) $('tutDone').onclick = finishTutorial; else $('tutSkip').onclick = () => { tutorial = null; wallet.tutorialDone = true; saveWallet(); renderTutorial(); };
}
function tutorialEvent(key) {
  if (key === 'table' && tutorial && TUT[tutorial.step].key === 'sit') return;
  if (!tutorial || TUT[tutorial.step].key !== key) return;
  tutorial.step++; renderTutorial();
}
function finishTutorial() { tutorial = null; wallet.tutorialDone = true; saveWallet(); renderTutorial(); status('편하게 놀다 가요 🌙'); }

// 입장 직후 잠깐 뜨는 마을 환영 보드
function showWelcomeBoard() {
  const open = TABLES.filter(t => !session.isFull(t.id)).length;
  const b = $('welcomeBoard');
  b.innerHTML = `<small>WELCOME TO</small><b>SEONGSU VILLAGE</b>
    <ul><li>오늘 주민 <em>${RESIDENT_COUNT}</em></li><li>열린 판 <em>${open}</em></li><li>오늘의 Host <em>JAY</em></li><li>새로운 이야기 <em>${TABLES.length}</em></li></ul>`;
  b.hidden = false; b.classList.remove('out');
  setTimeout(() => b.classList.add('out'), 4200);
  setTimeout(() => { b.hidden = true; status('바닥을 톡 누르면 걸어가요. 사람이나 테이블을 누르면 가까이 가요.'); }, 4800);
}

// ── 입력 ─────────────────────────────────────────────────
// ── QR 공유 ─────────────────────────────────────────────
const ARTIFACT_URL = 'https://claude.ai/artifact/QDA8x2k7YFAGr4Jh5ntH9S', PAGES_URL = 'https://johnnyseo-glitch.github.io/bam-village/';
const ON_PAGES = /github\.io$/.test(location.hostname);
const SHARE_URL = ON_PAGES ? PAGES_URL : ARTIFACT_URL;
const QR_IMG = ON_PAGES ? 'qr-pages.png' : 'qr.png';
function showShare() {
  show('SHARE · 같이 들어오기', `<h2>옆 사람에게 보여주세요</h2>
    <p>폰 카메라로 QR을 찍으면 바로 밤마을에 들어와요.</p>
    <div class="qr-box"><img src="${QR_IMG}" alt="밤마을로 들어오는 QR 코드" width="260" height="260"></div>
    <p class="share-link" id="shareLink">${SHARE_URL}</p>
    <button class="action" id="copyLink">링크 복사</button>
    <p class="note">팀 테스트판: 이 링크로 들어온 뒤 호스트 화면의 4자리 입장 코드를 넣으면, 같은 마을에서 서로 보여요(Claude에 로그인한 팀원만).</p>`);
  $('copyLink').onclick = () => {
    const done = () => { $('copyLink').textContent = '복사했어요'; };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($('shareLink')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); $('copyLink').textContent = '링크를 길게 눌러 복사해요'; };
    try { navigator.clipboard.writeText(SHARE_URL).then(done, fallback); } catch { fallback(); }
  };
}

$('coinButton').onclick = () => showMy('shop');
$('mapButton').onclick = showMap; $('journalButton').onclick = showJournal;
$('interact').onclick = () => {
  if (!nearestEntity) return;
  const id = nearestEntity.id;
  if (id.startsWith('town:')) { openTownSpot(id.slice(5)); return; }
  if (id === 'townNpc') { const n = nearestEntity.npc; bubbleOver(townBubbleAnchor(n), n.line, '#ffffff', 2400, 1.85); status('마을 주민이 인사해요 (데모 주민)'); return; }
  const sp = SPOTS.find(s => s.id === id);
  if (sp?.kind === 'stairs') selectEntity(id); else if (sp) openEntity(id); else openPerson(npcs.find(n => n.id === id));
};

view.addEventListener('pointerdown', e => {
  if (e.button !== 0 || dialog.open) return;
  view.focus({preventScroll: true});
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (place === 'town') {
    if (escorting) return;
    if (raycaster.ray.intersectPlane(floor, hit)) { if (town.valid(hit.x, hit.z)) goTo(hit.x, hit.z, '', null, 1); else { const r = town.route({x: actor.position.x, z: actor.position.z}, {x: hit.x, z: hit.z}); if (r.length) { const e = r.at(-1); goTo(e.x, e.z, '', null, 1); } } }
    return;
  }
  const picked = raycaster.intersectObjects(indoorObjs, true).find(h => h.object.isMesh && !h.object.userData.ignorePick);
  if (picked?.object.userData.entity) { selectEntity(picked.object.userData.entity); return; }
  if (escorting) { status('JAY가 안내하는 중이에요. 잠깐만요.'); return; }
  if (state.table) { seatedHint(); return; }
  if (picked?.object.userData.level === 2) { goTo(picked.point.x, picked.point.z, '', null, 2); return; }
  if (raycaster.ray.intersectPlane(floor, hit) && Math.abs(hit.x) < ROOM.width / 2 && Math.abs(hit.z) < ROOM.depth / 2) goTo(hit.x, hit.z, '', null, 1);
});

const mapping = {ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right'};
function keyStart(d) {
  if (dialog.open || !calm.hidden) return false;
  if (escorting) { status('JAY가 안내하는 중이에요. 잠깐만요.'); return false; }
  if (state.table) { seatedHint(); return false; }
  keys.add(d); path = []; onArrival = null; marker.visible = false; arrival = '';
  return true;
}
window.addEventListener('keydown', e => {
  if (dialog.open || e.altKey || e.ctrlKey || e.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (!calm.hidden) { if (e.key === 'Escape') hideCalm(); return; }
  if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) jump(); return; }
  if (e.key.toLowerCase() === 'e' && nearestEntity && !$('interact').hidden) { e.preventDefault(); $('interact').click(); return; }
  if (!mapping[e.key]) return;
  e.preventDefault(); if (!e.repeat) keyStart(mapping[e.key]);
});
window.addEventListener('keyup', e => { if (mapping[e.key]) keys.delete(mapping[e.key]); if ((e.code === 'Space' || e.key === ' ') && !dialog.open && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); });
$('jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
$('jumpBtn').addEventListener('click', e => { if (e.detail === 0) jump(); });
window.addEventListener('blur', release);
document.querySelectorAll('[data-dir]').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); if (keyStart(b.dataset.dir)) b.classList.add('active'); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { keys.delete(b.dataset.dir); b.classList.remove('active'); });
  b.addEventListener('click', e => {
    if (e.detail !== 0 || dialog.open || state.table || escorting) return;
    const d = b.dataset.dir, v = new T.Vector3();
    if (d === 'up') v.copy(up); if (d === 'down') v.copy(up).negate(); if (d === 'right') v.copy(right); if (d === 'left') v.copy(right).negate();
    goTo(actor.position.x + v.x * .7, actor.position.z + v.z * .7);
  });
});

// ── 계단: 방향키·패드로 그대로 걸어서 오르내린다 ───────
const SZ = {minX: STAIRS.x - STAIRS.width / 2 + .06, maxX: STAIRS.x + STAIRS.width / 2 - .06, top: STAIRS.topZ - .45, bottom: STAIRS.bottomZ + .4};
const inStairs = (x, z) => x > SZ.minX && x < SZ.maxX && z < SZ.bottom && z > SZ.top;
const stairY = z => MEZZ_Y * Math.min(1, Math.max(0, (STAIRS.bottomZ - z) / (STAIRS.bottomZ - STAIRS.topZ)));
function standAt(x, z) {
  if (place === 'town') return town.valid(x, z) ? 0 : null;
  const cy = actor.position.y;
  if (inStairs(x, z)) return stairY(z);
  if (inStairs(actor.position.x, actor.position.z) && cy > .25 && cy < MEZZ_Y - .25) return null; // 계단 중간에서 옆으로 떨어지지 않게
  if (cy > 1.45) return navs[2].valid(x, z) ? MEZZ_Y : null;
  return navs[1].valid(x, z) ? 0 : null;
}
function tryStep(x, z) {
  const y = standAt(x, z); if (y === null) return false;
  actor.position.set(x, y, z); level = y > 1.45 ? 2 : 1; return true;
}

// ── 애니메이션 ───────────────────────────────────────────
// 경로 점에 y가 있으면(계단·2층) 수평 이동 비율만큼 높이도 따라간다.
function moveToward(obj, p, step) {
  temp.set(p.x - obj.position.x, 0, p.z - obj.position.z);
  const dist = temp.length();
  if (p.y !== undefined && p._len === undefined) { p._fy = obj.position.y; p._len = Math.max(dist, 1e-4); }
  if (dist <= step) { obj.position.x = p.x; obj.position.z = p.z; if (p.y !== undefined) obj.position.y = p.y; return {done: true, dist}; }
  temp.normalize(); obj.position.addScaledVector(temp, step);
  if (p.y !== undefined) obj.position.y = p._fy + (p.y - p._fy) * (1 - (dist - step) / p._len);
  return {done: false, dist};
}
function stepAlong(n, p, dt, spd) {
  temp.set(p.x - n.root.position.x, 0, p.z - n.root.position.z);
  n.walking = true; n.phase += dt * 8;
  targetQ.setFromAxisAngle(axis, Math.atan2(temp.x, temp.z)); n.root.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 6));
  if (p.y !== undefined) n.baseY = n.root.position.y;
  return moveToward(n.root, p, dt * spd).done;
}

function animateCrowd(now, dt) {
  for (const r of roaming) {
    const n = r.npc;
    if (r.disabled) continue;
    if (now < r.waitUntil || now < r.pauseUntil) { n.walking = false; continue; }
    if (!r.path.length) { r.path = route({x: n.root.position.x, z: n.root.position.z}, r.data.route[r.index]); r.index = (r.index + 1) % r.data.route.length; }
    if (r.path.length) {
      if (n.root.position.distanceTo(actor.position) < .65) { n.walking = false; continue; }
      if (stepAlong(n, r.path[0], dt, .72)) r.path.shift();
      if (!r.path.length) { r.waitUntil = now + 1800 + (r.index % 3) * 1200; n.walking = false; }
    }
  }
  // 바 뒤 발판 위에 있을 때만 호스트를 올려준다.
  host.baseY = Math.hypot(host.root.position.x - RING.x, host.root.position.z - RING.z) < RING.inner ? HOST_STEP : 0;
  if (host.path.length) {
    if (stepAlong(host, host.path[0], dt, 2.0)) host.path.shift();
    if (!host.path.length) { host.walking = false; const done = hostTask?.done; hostTask = null; if (done) done(); }
  }
  for (const n of npcs) if (n.guestTask) { // 초대받은 주민이 자리로 걸어온다
    const g = n.guestTask;
    if (g.path.length) { if (stepAlong(n, g.path[0], dt, 1.6)) g.path.shift(); }
    if (!g.path.length) { n.walking = false; n.guestTask = null; g.done(); }
  }
  for (const n of npcs) {
    if (n.seated) {
      n.head.rotation.y = reduced ? 0 : Math.sin(now * .0008 + n.phase) * .16;
      n.arms[0].rotation.x = reduced ? -.1 : Math.sin(now * .0014 + n.phase) * .12 - .12;
    } else if (n.walking) {
      n.legs[0].rotation.x = Math.sin(n.phase) * .4; n.legs[1].rotation.x = -Math.sin(n.phase) * .4;
      n.arms[0].rotation.x = -Math.sin(n.phase) * .3; n.arms[1].rotation.x = Math.sin(n.phase) * .3;
      n.root.position.y = n.baseY + (reduced ? 0 : Math.abs(Math.sin(n.phase)) * .03);
    } else {
      for (const leg of n.legs) leg.rotation.x = T.MathUtils.damp(leg.rotation.x, 0, 10, dt);
      n.root.position.y = n.baseY;
      n.arms[0].rotation.x = T.MathUtils.damp(n.arms[0].rotation.x, 0, 8, dt);
      n.arms[1].rotation.x = T.MathUtils.damp(n.arms[1].rotation.x, 0, 8, dt);
    }
    n.arms[1].rotation.z = n.waveUntil > now ? -.9 + Math.sin(now * .018) * .25 : 0;
    if (n.badge) n.badge.position.y = 1.78 + (reduced ? 0 : Math.sin(now * .002 + n.phase) * .03);
  }
}

// 테이블 주민 머리 위에 짧은 말풍선이 번갈아 뜬다(대화 중인 느낌).
const emotes = TABLES.map((t, i) => {
  const sprite = new T.Sprite(new T.SpriteMaterial({map: emoteTextures[0], depthWrite: false, transparent: true}));
  sprite.visible = false; scene.add(sprite);
  return {t, sprite, next: 1200 + i * 900, until: 0, born: 0};
});
function animateEmotes(now) {
  for (const e of emotes) {
    if (now > e.next) {
      const members = [...npcs.filter(n => n.id.startsWith(e.t.id + '-')), ...npcs.filter(n => n.guestOf === e.t.id)];
      if (!members.length) { e.next = now + 3000; continue; }
      const who = members[Math.floor(Math.random() * members.length)];
      e.sprite.material.map = emoteTextures[Math.floor(Math.random() * emoteTextures.length)];
      e.sprite.position.set(who.root.position.x, who.root.position.y + 1.72, who.root.position.z);
      e.born = now; e.until = now + 1700; e.next = now + 2600 + Math.random() * 2600; e.sprite.visible = true;
    }
    if (e.sprite.visible) {
      if (now > e.until) { e.sprite.visible = false; continue; }
      const k = Math.min(1, (now - e.born) / 180), out = Math.max(0, (now - e.until + 250) / 250);
      const sc = (reduced ? 1 : (k < 1 ? .6 + .5 * k : 1 + Math.sin((now - e.born) * .012) * .03)) * (1 - out);
      e.sprite.scale.set(.48 * sc, .38 * sc, 1);
    }
  }
}

// ── 펫: 주인 옆을 졸졸 따라다닌다 ─────────────────────
const petTarget = new T.Vector3(), petOff = new T.Vector3();
function animatePets(now, dt) {
  const list = (place === 'bar' ? npcPets : []).map(p => ({p, owner: p.owner.root, floor: npcLevel(p.owner) === 2 ? MEZZ_Y : 0, seated: p.owner.seated}));
  if (myPet) list.push({p: myPet, owner: actor, floor: state.table ? levelY(level) : actor.position.y, seated: !!state.table});
  for (const {p, owner, floor, seated} of list) {
    petOff.set(seated ? .55 : .45, 0, seated ? .35 : -.45).applyQuaternion(owner.quaternion);
    petTarget.set(owner.position.x + petOff.x, floor, owner.position.z + petOff.z);
    const g = p.group, d = g.position.distanceTo(petTarget);
    if (d > 4) g.position.copy(petTarget);
    g.position.lerp(petTarget, 1 - Math.exp(-dt * 3.5));
    const moving = d > .08;
    if (moving) { temp.set(petTarget.x - g.position.x, 0, petTarget.z - g.position.z); if (temp.lengthSq() > 1e-4) { targetQ.setFromAxisAngle(axis, Math.atan2(temp.x, temp.z)); g.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 8)); } }
    else g.quaternion.slerp(owner.quaternion, 1 - Math.exp(-dt * 2));
    p.phase += dt * (moving ? 14 : 2);
    p.legs[0].rotation.x = moving ? Math.sin(p.phase) * .6 : 0; p.legs[1].rotation.x = moving ? -Math.sin(p.phase) * .6 : 0;
    if (p.jv || p.jy) { p.jv = (p.jv ?? 0) - GRAVITY * dt; p.jy = (p.jy ?? 0) + p.jv * dt; if (p.jy <= 0) { p.jy = 0; p.jv = 0; } }
    g.position.y = floor + (p.jy ?? 0) + (moving && !reduced ? Math.abs(Math.sin(p.phase)) * .05 : 0);
  }
}

// ── 선택형 감정 말풍선(채팅 없음, 집계 안 함) ───────────
let emoteAnim = null, myBubble = null, emoteReadyAt = 0;
function renderEmotePanel() {
  $('emotePanel').innerHTML = EMOTES.map(e => `<button data-emote="${e.id}"><span>${e.icon}</span>${e.label}</button>`).join('');
  $('emotePanel').querySelectorAll('[data-emote]').forEach(b => b.onclick = () => { doEmote(b.dataset.emote); $('emotePanel').hidden = true; });
}
function doEmote(id) {
  const e = EMOTES.find(e => e.id === id); if (!e) return;
  const now = performance.now();
  if (now < emoteReadyAt) return; emoteReadyAt = now + 1200;
  if (myBubble) myBubble.until = now; // 겹치지 않게 이전 말풍선은 바로 정리
  myBubble = bubbleOver(actor, e.text, e.bg, 3000, 2.05);
  emoteAnim = {id, start: now, until: now + 1600}; netEmote = {id, at: Date.now()};
  if (id === 'cheers' && glassGroup.visible) status('짠! 🥂');
}
renderEmotePanel();
$('emoteBtn').onclick = e => { e.stopPropagation(); $('emotePanel').hidden = !$('emotePanel').hidden; };

// 머리 위 말풍선(인사, 건배, 선물 등)
function bubbleOver(obj, text, bg = '#ffffff', ms = 2200, yOff = 1.85) {
  const sprite = new T.Sprite(new T.SpriteMaterial({map: makeBubble(text, bg), depthWrite: false, transparent: true}));
  scene.add(sprite);
  const b = {sprite, obj, born: performance.now(), until: performance.now() + ms, yOff};
  bubbles.push(b); return b;
}
function animateBubbles(now) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (now > b.until) { scene.remove(b.sprite); b.sprite.material.dispose(); bubbles.splice(i, 1); continue; }
    const k = Math.min(1, (now - b.born) / 180), out = Math.max(0, (now - b.until + 250) / 250);
    const sc = (reduced ? 1 : (k < 1 ? .6 + .5 * k : 1)) * (1 - out);
    const extra = b.obj === actor ? jumpY : 0;
    b.sprite.position.set(b.obj.position.x, b.obj.position.y + b.yOff + extra + (reduced ? 0 : (now - b.born) * .00008), b.obj.position.z);
    b.sprite.scale.set(.56 * sc, .45 * sc, 1);
  }
}

function updateClock() {
  const d = new Date(), m = d.getMinutes(), h = d.getHours() % 12 + m / 60;
  clock.minHand.rotation.z = -m / 60 * Math.PI * 2; clock.hourHand.rotation.z = -h / 12 * Math.PI * 2;
}
updateClock(); setInterval(updateClock, 30000);

function updateOverlay() {
  for (const l of labels) {
    projected.copy(l.anchor).project(camera);
    const d = l.anchor.distanceTo(actor.position);
    const nearExit = l.spot.kind === 'exit' && Math.hypot(actor.position.x - ENTRY.x, actor.position.z - ENTRY.z) < 2.4;
    const ownSeat = state.table && l.spot.id === state.table;
    const visible = place === 'bar' && !nearExit && !ownSeat && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .88 && Math.abs(projected.y) < .83 && d < 10;
    l.button.hidden = !visible;
    if (visible) { l.button.style.left = (projected.x + 1) / 2 * view.clientWidth + 'px'; l.button.style.top = (-projected.y + 1) / 2 * view.clientHeight + 'px'; }
  }
  for (const {n, b} of npcTags) {
    projected.copy(n.root.position); projected.y += 1.62;
    const d = n.root.position.distanceTo(actor.position);
    projected.project(camera);
    const vis = place === 'bar' && d < 6.5 && !n.guestTask && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .92 && Math.abs(projected.y) < .9;
    b.hidden = !vis;
    if (vis) { b.style.left = (projected.x + 1) / 2 * view.clientWidth + 'px'; b.style.top = (-projected.y + 1) / 2 * view.clientHeight + 'px'; }
  }
  projected.copy(actor.position); projected.y += 1.9 + jumpY; projected.project(camera);
  $('nameplate').style.left = (projected.x + 1) / 2 * view.clientWidth + 'px';
  $('nameplate').style.top = (-projected.y + 1) / 2 * view.clientHeight + 'px';
  let nearest = null, best = 1.55;
  if (place === 'town') {
    for (const l of townLabels) {
      projected.set(l.spot.wx, l.y, l.spot.z); const d = Math.hypot(actor.position.x - l.spot.wx, actor.position.z - l.spot.z); projected.project(camera);
      const vis = d < 12 && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .9 && Math.abs(projected.y) < .85;
      l.button.hidden = !vis; if (vis) { l.button.style.left = (projected.x + 1) / 2 * view.clientWidth + 'px'; l.button.style.top = (-projected.y + 1) / 2 * view.clientHeight + 'px'; }
      const r = l.spot.kind === 'door' ? 1.5 : 2.0;
      if (d < Math.min(best + .5, r)) { best = d; nearest = {id: 'town:' + l.spot.id, label: l.spot.label}; }
    }
    const tn = town.nearNpc(actor); if (tn && !nearest) nearest = {id: 'townNpc', label: '👋 인사하기', npc: tn};
  } else for (const l of townLabels) l.button.hidden = true;
  if (place === 'bar' && !state.table && !escorting) {
    for (const s of SPOTS) {
      if (s.kind === 'exit' || (s.level ?? 1) !== level) continue;
      const d = Math.hypot(actor.position.x - s.x, actor.position.z - s.z);
      if (d < best) { best = d; nearest = {id: s.id, label: s.kind === 'table' ? s.title + ' · 살펴보기' : s.kind === 'stairs' ? (level === 1 ? '계단 · 2층 올라가기' : '계단 · 1층 내려가기') : s.title + ' · 말 걸기'}; }
    }
    for (const n of npcs.filter(n => !n.seated && !n.host && !n.guestTask && npcLevel(n) === level)) {
      const d = Math.hypot(actor.position.x - n.root.position.x, actor.position.z - n.root.position.z);
      if (d < Math.min(best, 1.2)) { best = d; nearest = {id: n.id, label: n.mood === 'rest' ? n.name + ' · 혼술 중' : n.name + ' · 인사하기'}; }
    }
  }
  online?.overlay();
  nearestEntity = nearest;
  $('interact').hidden = !nearest || dialog.open || path.length > 0;
  if (nearest && lastNear !== nearest.label) { $('interact').textContent = nearest.label; lastNear = nearest.label; }
}

function animate(now) {
  if (failed) return;
  frameId = requestAnimationFrame(animate);
  if (document.hidden) { last = now; return; }
  const dt = Math.min((now - last) / 1000 || 0, .045); last = now;
  direction.set(0, 0, 0); let moved = false;
  if (!dialog.open && keys.size && !state.table) {
    if (keys.has('up')) direction.add(up); if (keys.has('down')) direction.sub(up);
    if (keys.has('right')) direction.add(right); if (keys.has('left')) direction.sub(right);
    direction.normalize();
    const nx = actor.position.x + direction.x * speed * dt, nz = actor.position.z + direction.z * speed * dt;
    if (tryStep(nx, nz)) moved = direction.lengthSq() > 0;
    else if (tryStep(nx, actor.position.z)) { direction.z = 0; moved = Math.abs(direction.x) > .01; }
    else if (tryStep(actor.position.x, nz)) { direction.x = 0; moved = Math.abs(direction.z) > .01; }
  } else if (!dialog.open && path.length) {
    const p = path[0];
    direction.set(p.x - actor.position.x, 0, p.z - actor.position.z);
    const r = moveToward(actor, p, speed * dt);
    if (r.done) { path.shift(); if (p.y !== undefined && !p.stair) level = p.y > 1.5 ? 2 : 1; }
    else direction.normalize();
    moved = r.dist > .001;
    if (!path.length) {
      marker.visible = false;
      if (arrival) status(arrival + ' 도착했어요');
      const done = onArrival; onArrival = null; if (done) done();
    }
  }
  if (state.table) {
    rig.position.y = reduced ? 0 : Math.sin(now * .002) * .008;
    legs.forEach(l => l.rotation.x = -1.35); arms[0].rotation.x = -.1; arms[1].rotation.x = glassGroup.visible ? -.6 : -.1;
  } else if (moved) {
    phase += dt * 12;
    targetQ.setFromAxisAngle(axis, Math.atan2(direction.x, direction.z)); actor.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 14));
    rig.position.y = reduced ? 0 : Math.abs(Math.sin(phase)) * .042;
    const swing = reduced ? .12 : .48;
    legs[0].rotation.x = Math.sin(phase) * swing; legs[1].rotation.x = -Math.sin(phase) * swing;
    arms[0].rotation.x = -Math.sin(phase) * swing * .8; arms[1].rotation.x = glassGroup.visible ? -.6 : Math.sin(phase) * swing * .8;
  } else {
    rig.position.y = reduced ? 0 : Math.sin(now * .002) * .009;
    for (const part of [...legs, ...arms]) part.rotation.x = T.MathUtils.damp(part.rotation.x, part === arms[1] && glassGroup.visible ? -.6 : 0, 16, dt);
  }
  walking = moved;
  // 점프 물리 + 찌그러짐/늘어남
  if (jumpV !== 0 || jumpY > 0) {
    jumpV -= GRAVITY * dt; jumpY += jumpV * dt;
    if (jumpY <= 0) { jumpY = 0; jumpV = 0; landAt = now; }
  }
  const sinceLand = (now - landAt) / 1000;
  const squash = sinceLand < .22 ? Math.sin(sinceLand / .22 * Math.PI) * .16 : 0;
  const stretch = jumpY > 0 ? Math.min(.1, Math.abs(jumpV) * .025) : 0;
  rig.scale.set(1 + squash * .6 - stretch * .4, 1 - squash + stretch, 1 + squash * .6 - stretch * .4);
  rig.position.y += jumpY;
  if (jumpY > 0) { arms[0].rotation.x = -2.5; if (!glassGroup.visible) arms[1].rotation.x = -2.5; legs[0].rotation.x = -.5; legs[1].rotation.x = .3; }
  shadow.scale.setScalar(Math.max(.55, 1 - jumpY * .55));
  if (emoteAnim) { // 감정 표현 동작
    const k = (now - emoteAnim.start) / 1000;
    if (now > emoteAnim.until) emoteAnim = null;
    else if (emoteAnim.id === 'laugh') rig.position.y += Math.abs(Math.sin(k * 18)) * .07;
    else if (emoteAnim.id === 'clap') { arms[0].rotation.x = arms[1].rotation.x = -1.3; arms[0].rotation.z = .5 + Math.sin(k * 30) * .25; arms[1].rotation.z = -.5 - Math.sin(k * 30) * .25; }
    else if (emoteAnim.id === 'cheers') arms[1].rotation.x = -2.6;
    else if (emoteAnim.id === 'wave') { arms[1].rotation.x = -2.4; arms[1].rotation.z = -.4 + Math.sin(k * 16) * .35; }
    else if (emoteAnim.id === 'agree') rig.rotation.z = Math.sin(k * 10) * .08;
  } else { arms[0].rotation.z = 0; arms[1].rotation.z = 0; rig.rotation.z = 0; }
  if (place === 'bar') for (const l of lampShades) {
    const blocking = (!l.upperOnly || actor.position.y > 1.2 || level === 2) && l.z > actor.position.z + .6 && l.z < actor.position.z + 6 && Math.abs(l.x - actor.position.x) < (l.r ?? 2.6);
    const target = blocking ? .12 : 1;
    if (Math.abs(l.opacity - target) > .01) { l.opacity = T.MathUtils.damp(l.opacity, target, 6, dt); for (const m of l.mats) m.opacity = l.opacity; }
  }
  if (place === 'bar') animateCrowd(now, dt); else town.update(now, dt, actor);
  animatePets(now, dt);
  if (fadeT && now > fadeT) { fadeT = 0; $('fade').classList.remove('on'); }
  if (place === 'bar') animateEmotes(now);
  animateBubbles(now);
  if (drink) { // 마실수록 줄어들고, 다 마시면 사라진다
    const f = 1 - (now - drink.start) / (drink.end - drink.start);
    if (f <= 0) { glassGroup.visible = false; status(`${eulreul(drink.name)} 다 마셨어요. 한 잔 더?`); session.record('다 마심 · ' + drink.name); drink = null; }
    else setFill(f);
  }
  for (const f of flags) f.quaternion.copy(camera.quaternion);
  desiredFocus.set(actor.position.x, .6 + (state.table ? levelY(level) : actor.position.y), actor.position.z - .75);
  followPoint.lerp(desiredFocus, reduced ? 1 : 1 - Math.exp(-dt * 5));
  camOff.lerp(place === 'town' && now < wideUntil ? WIDE : cameraOffset, reduced ? 1 : 1 - Math.exp(-dt * 2.2));
  const wk = Math.min(1, Math.max(0, (camOff.y - cameraOffset.y) / (WIDE.y - cameraOffset.y)));
  // 마을에서는 시선을 살짝 들어 남산타워·한강 하늘선이 화면 위쪽에 걸리게 한다
  const tilt = place === 'town' ? 1 - wk : 0;
  lookAt.copy(followPoint).add(temp.set(0, 3.5 * wk + .7 * tilt, -16 * wk - 1.6 * tilt));
  camera.position.copy(followPoint).add(camOff); camera.lookAt(lookAt); camera.updateMatrixWorld();
  const blink = now % 4800 > 4630 ? .15 : 1.25; eyes.forEach(e => e.scale.y = blink);
  shadow.position.set(actor.position.x, .045, actor.position.z);
  marker.scale.setScalar(reduced ? 1 : 1 + Math.sin(now * .004) * .08);
  online?.tick(now, dt);
  updateOverlay();
  renderer.render(scene, camera);
}

// ── 바 밖 마을(작은 서울) ────────────────────────────────
// '마을로 나가기'는 공간 이동일 뿐이다. 방문·주문·자리 기록·관계 잠금은 그대로 이어진다.
function ensureTown() {
  if (town) return;
  town = createTown({scene, critter: world.critter});
  for (const s of TOWN_SPOTS) {
    const b = document.createElement('button'); b.className = 'world-label town-label' + (s.kind === 'door' ? ' is-door' : '');
    b.innerHTML = `${esc(s.name)}<small>${s.kind === 'door' ? '들어가기' : s.kind === 'view' ? '바라보기' : '오픈 준비 중'}</small>`; b.hidden = true;
    b.onclick = () => walkTownSpot(s.id);
    $('worldLabels').appendChild(b);
    townLabels.push({spot: s, button: b, y: s.kind === 'door' ? 3.4 : s.id === 'hotel' ? 3.6 : s.id === 'park' ? 3 : 2.6});
  }
}
function switchPlace(to) {
  place = to;
  for (const o of indoorObjs) o.visible = to === 'bar';
  town.group.visible = to === 'town';
  camera.far = to === 'town' ? 170 : 80; camera.updateProjectionMatrix(); wideUntil = 0;
  scene.background = to === 'town' ? town.sky : indoorSky.bg; scene.fog = to === 'town' ? town.fog : indoorSky.fog;
  path = []; onArrival = null; marker.visible = false; keys.clear(); level = 1;
  $('fade').classList.add('on'); fadeT = performance.now() + 450;
  followPoint.set(actor.position.x, .6, actor.position.z - .75);
  if (myPet) myPet.group.position.set(actor.position.x + .5, 0, actor.position.z + .3);
  refresh(); renderTutorial();
}
function goOutside() {
  if (escorting) { status('JAY가 안내하는 중이에요. 잠깐만요.'); return; }
  if (state.table) { confirmStand('마을', goOutside); return; }
  if (state.pending) { flowToken++; session.cancelRequest(); }
  ensureTown();
  actor.position.set(TOWN_SPAWN.x, 0, TOWN_SPAWN.z); actor.quaternion.setFromAxisAngle(axis, 0);
  switchPlace('town');
  wideUntil = performance.now() + 4200; // 나오자마자 잠깐 서울 전경을 보여주고 원래 시점으로
  const o = activeOrder();
  status(o ? `🌆 마을로 나왔어요 · 준비 중인 ${o.name}은(는) 그대로예요` : '🌆 마을로 나왔어요. 방문은 계속돼요. 바 문으로 다시 들어갈 수 있어요');
  session.record('마을로 산책');
}
function goInside() {
  actor.position.set(ENTRY.x, 0, ENTRY.z - .4); actor.quaternion.setFromAxisAngle(axis, Math.PI);
  switchPlace('bar');
  status('다시 바 안이에요. 반가워요!');
}
function walkTownSpot(id) {
  const s = TOWN_SPOTS.find(s => s.id === id); if (!s) return;
  const near = Math.hypot(actor.position.x - s.wx, actor.position.z - s.z) < 1.6;
  if (near) { openTownSpot(id); return; }
  const r = town.route({x: actor.position.x, z: actor.position.z}, {x: s.wx, z: s.z});
  if (!r.length) { status('그쪽으로 가는 길이 없어요'); return; }
  const e = r.at(-1); goTo(e.x, e.z, s.name + ' 쪽으로', () => openTownSpot(id), 1);
}
function openTownSpot(id) {
  const s = TOWN_SPOTS.find(s => s.id === id); if (!s) return;
  if (s.kind === 'door') {
    show('밤마을 바', `<h2>바에 들어갈까요?</h2><p>오늘 방문은 계속 이어져요. 자리·주문·기록은 그대로예요.</p>
      <button class="action" id="tIn">바에 들어가기</button><button class="secondary" id="tStay">조금 더 걸을래요</button>`);
    $('tIn').onclick = () => { closeDialog(); goInside(); }; $('tStay').onclick = closeDialog; return;
  }
  if (s.kind === 'view') { wideUntil = performance.now() + 7000; status('🌊 한강 너머로 남산서울타워, 오른쪽에 롯데월드타워, 왼쪽에 63빌딩이 보여요'); bubbleOver(actor, '와…', '#d8f0ff', 2200, 2.0); return; }
  show(s.name, `<p class="kicker">오픈 준비 중</p><h2>${esc(s.name)}</h2><p>${esc(s.note)}</p>
    <p class="note">아직 들어갈 수 없어요. 실제 영업·예약·결제 기능은 없어요.${id === 'mailbox' ? ' 친구 쪽지는 다음 업데이트에서 열려요.' : ''}</p>
    <button class="action" id="tOk">알겠어요</button>`);
  $('tOk').onclick = closeDialog;
}
function showTownMap() {
  show('밤마을 · 마을 지도', `<h2>어디로 걸어볼까요?</h2>
    <div class="place-list">${TOWN_SPOTS.map(s => `<button data-tspot="${s.id}">${esc(s.name)}<small>${s.kind === 'door' ? '들어가기' : s.kind === 'view' ? '산책로' : '오픈 준비 중'}</small></button>`).join('')}</div>
    <button class="secondary" id="tWide">📷 마을 전경 잠깐 보기</button>
    <p class="note">서울의 골목·한강·궁궐 돌담을 짧은 산책 거리로 다시 짠 가상 동네예요. 실제 지도나 실제 매장 위치가 아니에요.</p>`);
  $('tWide').onclick = () => { closeDialog(); wideUntil = performance.now() + 6000; status('📷 남산타워와 한강, 관람차가 보여요'); };
  $('modalContent').querySelectorAll('[data-tspot]').forEach(b => b.onclick = () => { closeDialog(); walkTownSpot(b.dataset.tspot); });
}
function townBubbleAnchor(n) { const o = new T.Object3D(); town.worldPos(n, o.position); return o; }

// ── 캐릭터 꾸미기 ────────────────────────────────────────
let preview = null;
function renderPreview() {
  const cv = $('charPreview'); if (!cv) return;
  if (!preview) {
    const r = new T.WebGLRenderer({antialias: true, alpha: true}); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(220, 220, false);
    const sc = new T.Scene(); sc.add(new T.HemisphereLight('#fff3e0', '#6b5040', 1.6)); const dl = new T.DirectionalLight('#ffffff', 1.2); dl.position.set(2, 4, 5); sc.add(dl);
    const cam = new T.PerspectiveCamera(30, 1, .1, 20); cam.position.set(0, 1.0, 3.6); cam.lookAt(0, .72, 0);
    preview = {r, sc, cam, holder: new T.Group()}; sc.add(preview.holder);
  }
  const L = wallet.look ?? CHAR_DEFAULT;
  preview.holder.clear();
  const j = JACKETS.find(j => j.id === wallet.equipped.jacket) ?? JACKETS[0];
  const c = world.critter({species: L.species, fur: L.fur, outfit: j.color, accent: '#f4b942', extra: L.extra});
  if (wallet.equipped.accessory && wallet.equipped.accessory !== 'none') world.addAccessory(c.head, wallet.equipped.accessory);
  c.rig.rotation.y = -.35; preview.holder.add(c.rig);
  preview.r.render(preview.sc, preview.cam);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(preview.r.domElement, 0, 0, cv.width, cv.height);
}
function charBody() {
  const L = wallet.look ?? CHAR_DEFAULT;
  return `<div class="char-wrap"><canvas id="charPreview" width="220" height="220" class="char-preview"></canvas>
    <div><p class="meta">오리지널 캐릭터를 만들어요. 종·색·장식은 무료예요. 옷과 소품은 상점에서.</p></div></div>
    ${has('charFull') ? '' : '<p class="note">지금은 기본 외형만 고를 수 있어요. 다시 방문하면 종·색·장식이 모두 열려요.</p>'}
    <h3>종</h3><div class="char-grid">${CHAR_SPECIES.filter(([id]) => has('charFull') || BASIC_SPECIES.includes(id)).map(([id, name, icon]) => `<button data-sp="${id}" class="${L.species === id ? 'on' : ''}"><span>${icon}</span>${name}</button>`).join('')}</div>
    <h3>색</h3><div class="swatches">${CHAR_FURS.slice(0, has('charFull') ? 99 : 6).map(c => `<button data-fur="${c}" class="${L.fur === c ? 'on' : ''}" style="--sw:${c}" aria-label="색 ${c}"></button>`).join('')}</div>
    ${has('charFull') ? `<h3>장식</h3><div class="char-grid small">${CHAR_EXTRAS.map(([id, name]) => `<button data-ex="${id}" class="${L.extra === id ? 'on' : ''}">${name}</button>`).join('')}</div>` : ''}
    <p class="note">팀원 화면에도 바로 이 모습으로 보여요. 실제 작품 속 캐릭터는 만들 수 없어요.</p>`;
}
function setLookPart(k, v) { wallet.look = {...(wallet.look ?? CHAR_DEFAULT), [k]: v, ...(k === 'species' ? {fur: SPECIES_FUR[v] ?? (wallet.look ?? CHAR_DEFAULT).fur} : {})}; saveWallet(); applyLook(); showMy('char'); }

// ── 술게임 ───────────────────────────────────────────────
function tableNames() {
  if (!state.table) return [state.profile.name];
  const t = tableOf(state.table);
  const npcNames = [...t.members, ...(state.guests[t.id] ?? []).map(id => npcs.find(n => n.id === id)?.name).filter(Boolean)];
  const remote = (online?.atTable(t.id) ?? []).map(R => R.p.n || '팀원');
  return [state.profile.name, ...remote, ...npcNames].slice(0, 8);
}
function bubbleByName(name, text) {
  if (name === state.profile.name) { bubbleOver(actor, text, '#fff3c4', 2600, 2.05); return; }
  const R = online?.players().find(R => R.p.n === name && R.p.tb === state.table); if (R) { bubbleOver(R.root, text, '#fff3c4', 2600, 2.05); return; }
  const n = npcs.find(n => n.name === name && (n.id.startsWith(state.table + '-') || n.guestOf === state.table)); if (n) bubbleOver(n.root, text, '#fff3c4', 2600);
}

// ── 온라인(팀 테스트) ────────────────────────────────────
function netMe() {
  const p = state.profile, r2 = v => Math.round(v * 100) / 100;
  const t = state.table ? tableOf(state.table) : null, owner = !!t && state.owned === t.id;
  const j = JACKETS.find(j => j.id === wallet.equipped.jacket) ?? JACKETS[0];
  const petItem = wallet.equipped.pet ? SHOP.find(i => i.kind === 'pet' && i.value === wallet.equipped.pet) : null;
  return {in: 1, n: (p.name || '손님').slice(0, 12), g: p.gender || '', a: p.age ? String(p.age) : '', j: (p.job || '').slice(0, 16), m: p.mbti || '',
    t: wallet.title ? titleName(wallet.title) ?? '' : '', md: p.mood || 'talk', c: j.color, pt: wallet.equipped.pet || null, pf: petItem?.fur || null,
    x: r2(actor.position.x), y: r2(actor.position.y), z: r2(actor.position.z), r: r2(netEuler.setFromQuaternion(actor.quaternion, 'YXZ').y), w: walking ? 1 : 0,
    tb: state.table || null, s: t ? (state.seatIdx ?? -1) : -1, own: owner ? 1 : 0, tt: owner ? t.title : '', op: owner ? t.opener : '',
    e: netEmote.id, ea: netEmote.at, ja: netJumpAt,
    sp: wallet.look?.species ?? 'fox', fu: wallet.look?.fur ?? '#f08a3c', ex: wallet.look?.extra ?? 'none', ac: wallet.equipped.accessory ?? 'none', pl: place};
}
const netEuler = new T.Euler();
function playerChips(t) {
  return (online?.atTable(t.id) ?? []).map(R => `<span class="player">👤 ${esc(R.p.n || '팀원')}${R.p.own ? ' 👑' : ''}</span>`).join('');
}
function netLine() {
  const st = online?.net.status;
  if (st === 'on') return `<p>👥 <b>팀 테스트 연결됨</b> · 지금 마을에 ${online.count}명${online.net.isHost ? ' · 내가 호스트' : ''}</p>${online.net.isHost ? `<button class="secondary" id="netHost">${online.net.hostMode ? '호스트 화면 (켜짐)' : '호스트 화면 열기 · QR 입장 코드'}</button>` : ''}`;
  if (st === 'off') return '<p>혼자 체험 모드예요. 팀원과 같이 놀려면 Claude에 로그인한 상태로 이 링크를 열어주세요.</p>';
  return '<p>팀 연결 확인 중…</p>';
}
function bindNetLine() { if ($('netHost')) $('netHost').onclick = () => online.openHost(); }
function onNetChange() {
  const on = online?.net.status === 'on';
  $('netChip').hidden = !on;
  if (on) $('netChip').innerHTML = `<i></i>${online.count + (inVillage ? 1 : 0)}${online.net.hostMode ? '<small>HOST</small>' : ''}`;
  if ($('netLine')) { $('netLine').innerHTML = netLine(); bindNetLine(); }
  refresh();
}
function teamBlock() {
  if (online?.net.status !== 'on') return '';
  const n = online.net, incoming = n.friendsIn.filter(f => f.status === 'sent');
  const friends = [...n.friendsIn.filter(f => f.status === 'friend').map(f => f.fromNick), ...n.friendsOut.filter(f => f.status === 'friend').map(f => f.toNick)];
  const pr = Object.entries(n.praiseIn);
  return `<h3>팀 테스트</h3><dl class="recap">
    <div><dt>팀 친구</dt><dd>${friends.length ? friends.map(esc).join(', ') : '아직 없어요'}</dd></div>
    <div><dt>팀원이 남긴 칭찬</dt><dd>${pr.length ? pr.map(([t, c]) => `${esc(t)} ${c}`).join(' · ') : '아직 없어요'}</dd></div>
  </dl>${incoming.length ? `<ul class="pass-list">${incoming.map(f => `<li><div><b>💌 ${esc(f.fromNick || '팀원')}</b><small>오늘 같이 앉았던 팀원이 친구 신청을 보냈어요</small></div><button data-facc="${esc(f.id)}">수락</button></li>`).join('')}</ul>` : ''}`;
}
function showPlayers() {
  const list = online.players(), where = tb => tb ? `T${tableOf(tb).number} · ${esc(tableOf(tb).title)}` : '돌아다니는 중';
  show('ONLINE · 팀 테스트', `<h2>지금 마을에 ${list.length + (inVillage ? 1 : 0)}명</h2>
    <ul class="pass-list">${inVillage ? `<li><div><b>${esc(state.profile.name)} (나)</b><small>${where(state.table)}</small></div></li>` : ''}${list.map(R => `<li><div><b>👤 ${esc(R.p.n || '팀원')} <i class="g">${genderMark(R.p.g)}</i></b><small>${where(R.p.tb)}</small></div><button data-find="${esc(R.peer)}">프로필</button></li>`).join('')}</ul>
    ${online.net.isHost ? `<button class="action" id="openHostPanel">호스트 화면 · QR 입장 코드${online.net.hostMode ? ' (켜짐)' : ''}</button>` : ''}
    <p class="note">QR 입장 코드를 넣은 팀원만 서로 보여요. 팀원 이름표는 코랄 테두리, 테두리 없는 동물은 예시 주민이에요.</p>`);
  $('modalContent').querySelectorAll('[data-find]').forEach(b => b.onclick = () => { const R = online.players().find(R => R.peer === b.dataset.find); closeDialog(); R?.tag.onclick(); });
  if ($('openHostPanel')) $('openHostPanel').onclick = () => online.openHost();
}
function walkAndSit(t) {
  const arrive = () => { try { session.confirmSeat(t.id); } catch (e) { status(e.message); refresh(); return; } seatMe(t); showConversation(t); };
  if (!goTo(t.approach.x, t.approach.z, 'T' + t.number + ' 자리로', arrive, t.level ?? 1)) arrive();
}
function becomeOwner(t) { state.owned = t.id; status('👑 방장이 자리를 떠서 이제 내가 방장이에요'); refresh(); }
function kicked() {
  stand(); orderGen++; flowToken++; releaseGuests(); session.reset(); glassGroup.visible = false; drink = null; inVillage = false; path = []; marker.visible = false;
  online.leaveVillage(); refresh();
  show('GOOD NIGHT', '<h2>호스트가 입장을 마감했어요</h2><p>다시 들어오려면 호스트 화면의 새 입장 코드를 입력해 주세요.</p><button class="action" id="kOk">확인</button>', {onClose: openVillages, lock: true});
  $('kOk').onclick = closeDialog;
}
$('netChip').onclick = showPlayers;
online = createOnline({
  scene, critter: world.critter, makePet, eulreul, iga, qrImg: QR_IMG, camera, view, actor, state, session, esc, genderMark,
  bubbleOver, status, show, closeDialog, refresh, tableOf, openMenu, openTable, serveToMe, hideCalm,
  inVillage: () => inVillage, me: netMe, dialogLabel: () => dialog.open ? $('modalLabel').textContent : '',
  moodShort: md => MOODS[md]?.short ?? '', levelOf: tb => levelY(tableOf(tb)?.level ?? 1),
  walkAndSit, becomeOwner, onPassLost: kicked, wave: () => bubbleOver(actor, '👋 안녕!', '#ffffff', 2000, 2.0),
  onGame: (p, from) => { if (dialog.open) status(`🎲 ${from}님이 게임을 시작했어요`); else games.play(p, from); },
  addAccessory: world.addAccessory,
  onChange: onNetChange, afterHost: () => { if (!inVillage && !dialog.open) openVillages(); }, onAccepted: () => setTimeout(() => grantTitle('jay'), 3000)
});
games = createGames({show, closeDialog, status, esc, names: tableNames, myName: () => state.profile.name, bubbleByName,
  share: p => { if (online?.net.status === 'on' && state.table) online.shareGame(state.table, p); }});
session.hooks.extra = id => online.atTable(id).length;
session.hooks.taken = id => online.takenSeats(id);

// ── 시작 ─────────────────────────────────────────────────
loadProfile(); applyLook(); renderCoins(); applyUnlocks(); refresh();
renderer.render(scene, camera);
$('loading').hidden = true; $('nameplate').hidden = false;
frameId = requestAnimationFrame(animate);
openVillages();
document.fonts?.load('64px Jua').then(() => world.drawSign("'Jua', sans-serif")).catch(() => {});

renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); failed = true; cancelAnimationFrame(frameId); $('failure').hidden = false; $('nameplate').hidden = true; release(); });
document.addEventListener('visibilitychange', () => { release(); if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; } else if (!failed && !frameId) { last = performance.now(); frameId = requestAnimationFrame(animate); } });
window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); frameId = 0; release(); });
window.addEventListener('pageshow', () => { if (!failed && !frameId) { resize(); last = performance.now(); frameId = requestAnimationFrame(animate); } });

// 테스트용 훅: 상태를 읽기만 한다.
window.__bam = {state, wallet, showMy, wide: ms => { wideUntil = performance.now() + ms; }, goOutside, goInside, get place() { return place; }, get town() { return town; }, get games() { return games; }, applyLook, checkWeekend, get online() { return online; }, get inVillage() { return inVillage; }, rounds, doEmote, standAt, get emoteAnim() { return emoteAnim; }, get level() { return level; }, get tutorial() { return tutorial; }, get myPet() { return myPet; }, actor, host, npcs, select: id => selectEntity(id), endRound: id => newRound(tableOf(id)), get drink() { return drink; }, get escorting() { return escorting; }, get path() { return path; }, get jumpY() { return jumpY; }};

if (document.modelContext?.registerTool) {
  const spots = ['host', 'lounge', 'exit', 'table1', 'table2', 'table3', 'table4', 'table5'];
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'walk_to_village_spot',
      description: 'Start walking in the simulated 3D village to a named place and open its interaction on arrival. Does not join a table, place an order, or contact real people.',
      inputSchema: {type: 'object', properties: {spot: {type: 'string', enum: spots}}, required: ['spot'], additionalProperties: false},
      annotations: {readOnlyHint: false},
      execute: input => {
        if (!input || Object.keys(input).length !== 1 || !spots.includes(input.spot)) throw new Error('Invalid spot');
        selectEntity(input.spot);
        return {demo: true, walkingStarted: path.length > 0, spot: input.spot};
      }
    })).catch(() => {});
  } catch {}
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('#emotePanel, #emoteBtn')) $('emotePanel').hidden = true; });
// 아이폰: 길게 누르거나 두 번 탭할 때 글자 전체 선택·복사 메뉴가 뜨지 않게(입력칸은 예외)
const editable = t => t instanceof Element && t.closest('input, textarea, select, [contenteditable]');
document.addEventListener('selectstart', e => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener('dblclick', e => { if (!editable(e.target)) e.preventDefault(); }, {passive: false});
document.addEventListener('gesturestart', e => e.preventDefault());
