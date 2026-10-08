// 밤마을 v0.5 — 한 손님의 체험 상태.
// 서버가 없으므로 이 브라우저 안에서만 유지된다. 실제 파일럿에서는 좌석·요청·주문의
// 최종 상태를 서버 한 곳에서만 확정해야 한다.
import {TABLES, DRINKS} from './map-data.mjs?v=1791440229';

export const ORDER_STEPS = ['접수', '준비 중', '서빙 완료'];

export function createSession() {
  const state = {
    profile: {name: '', mood: 'talk', jacket: 'lime', fav: 'highball', accessory: 'none', pet: null,
      gender: '', age: null, job: '', jobType: '직장인', mbti: '', verified: false, jobVerified: false},
    owned: null,          // 내가 방장인 테이블 id
    praised: new Set(),   // 오늘 칭찬을 보낸 주민
    praiseIn: {},         // 내가 받은 칭찬 {태그: 횟수}
    table: null,          // 착석한 테이블 id
    pending: null,        // {table, startedAt} — 요청 중인 자리(임시 보류)
    orders: [],           // {id, drinkId, name, price, color, table, from, status, at}
    greeted: new Set(),
    joined: [],           // 앉았던 테이블 id 기록
    guests: {},           // 내가 초대해서 합류한 주민 {tableId: [npcId]}
    met: {},              // 오늘 함께 앉았던 손님 기록(퇴장 후 오늘의 기억)
    logs: []
  };
  let orderSeq = 0;

  const findTable = id => {
    const t = TABLES.find(t => t.id === id);
    if (!t) throw new Error('없는 테이블이에요.');
    return t;
  };

  // 온라인(팀 테스트): 다른 플레이어가 차지한 자리 수 · 좌석 번호
  const hooks = {extra: () => 0, taken: () => new Set()};

  function record(message) {
    state.logs.unshift(message);
    state.logs = state.logs.slice(0, 20);
  }

  function occupancy(id) {
    const t = findTable(id);
    return t.members.length + (state.guests[id]?.length ?? 0) + hooks.extra(id) + (state.table === id ? 1 : 0) + (state.pending?.table === id ? 1 : 0);
  }

  function isFull(id) {
    return state.table !== id && state.pending?.table !== id && occupancy(id) >= findTable(id).seats.length;
  }

  // 내가 앉을 좌석: 주민이 없는 좌석 중 freeOrder 첫 번째.
  function mySeatIndex(id) {
    const t = findTable(id), taken = hooks.taken(id);
    return t.freeOrder.find(i => !taken.has(i)) ?? t.freeOrder[0];
  }
  function mySeat(id) {
    const t = findTable(id);
    return t.seats[mySeatIndex(id)];
  }

  function setProfile(next) {
    Object.assign(state.profile, next);
  }

  // 참여 요청: 먼저 접수된 요청 하나만 자리를 임시 보류한다.
  function request(id) {
    const t = findTable(id);
    if (state.table === id) throw new Error('이미 이 테이블에 앉아 있어요.');
    if (state.pending) throw new Error('이미 다른 테이블에 요청 중이에요.');
    if (isFull(id)) throw new Error('지금은 만석이에요.');
    state.pending = {table: id, startedAt: Date.now()};
    record('보낸 요청 · ' + t.title);
    return t;
  }

  function cancelRequest() {
    if (!state.pending) return;
    const t = findTable(state.pending.table);
    state.pending = null;
    record('요청 취소 · ' + t.title);
  }

  function declineRequest() {
    if (!state.pending) return;
    const t = findTable(state.pending.table);
    state.pending = null;
    record('다음 기회에 · ' + t.title);
  }

  // 동의가 끝나고 호스트 안내로 자리에 도착했을 때 확정한다.
  function confirmSeat(id) {
    const t = findTable(id);
    if (state.pending?.table !== id) throw new Error('확정할 요청이 없어요.');
    state.pending = null;
    if (state.table && state.table !== id) leave();
    state.table = id;
    if (!state.joined.includes(id)) state.joined.push(id);
    for (const o of state.orders) {
      if ((o.status === '접수' || o.status === '준비 중') && o.table !== id) {
        o.from = o.table;
        o.table = id;
      }
    }
    record('합석 · ' + t.title);
    return t;
  }

  function leave() {
    if (!state.table) return;
    const t = findTable(state.table);
    record('자리에서 일어남 · ' + t.title);
    if (state.owned === t.id) state.owned = null;
    state.table = null;
  }

  // 빈 테이블에 먼저 앉으면 방장이 된다(호스트 승인 없이 바로 착석, 호스트에게는 알림만).
  function claim(id, title) {
    const t = findTable(id);
    if (!t.open || t.members.length || (state.guests[id]?.length) || hooks.extra(id)) throw new Error('이미 누군가 열어둔 판이에요.');
    if (state.table) leave();
    state.table = id; state.owned = id;
    if (!state.joined.includes(id)) state.joined.push(id);
    record('방장 · T' + t.number + ' ' + title);
    return t;
  }

  // 자유석(방장 없음): 빈 자리만 있으면 바로 앉는다
  function sitFree(id) {
    const t = findTable(id);
    if (occupancy(id) >= t.seats.length && state.table !== id) throw new Error('지금은 자리가 꽉 찼어요.');
    if (state.table && state.table !== id) leave();
    state.pending = null; state.table = id;
    if (!state.joined.includes(id)) state.joined.push(id);
    record('자유석 · T' + t.number + ' ' + t.title);
    return t;
  }

  function praise(npcId, name, tag) {
    if (state.praised.has(npcId)) throw new Error('오늘은 이미 칭찬했어요.');
    state.praised.add(npcId);
    record('칭찬 보냄 · ' + name + ' · ' + tag);
  }
  function receivePraise(from, tag) {
    state.praiseIn[tag] = (state.praiseIn[tag] ?? 0) + 1;
    record('칭찬 받음 · ' + from + ' · ' + tag);
  }

  function recentSame(drinkId, withinMs = 60000) {
    return state.orders.some(o => o.drinkId === drinkId && o.status !== '취소' && Date.now() - o.at < withinMs);
  }

  // qty: 잔 수(테이블 한 잔 돌리기) · to: 받는 사람 이름(한 잔 보내기)
  function order(drinkId, {qty = 1, to = null, free = false} = {}) {
    const d = DRINKS.find(d => d.id === drinkId);
    if (!d) throw new Error('없는 메뉴예요.');
    if (d.soldOut) throw new Error('오늘은 품절이에요.');
    const name = d.name + (qty > 1 ? ` ${qty}잔` : '') + (to ? ` → ${to}` : '') + (free ? ' (쿠폰)' : '');
    const o = {id: ++orderSeq, drinkId: d.id, name, drink: d.name, price: free ? 0 : d.price * qty, free, alcohol: d.id !== 'soda', color: d.color, glass: d.glass, qty, to,
      table: state.table, from: null, status: '접수', at: Date.now()};
    state.orders.push(o);
    record((to ? '한 잔 보내기 · ' : qty > 1 ? '테이블 한 잔 · ' : '주문 · ') + name + (o.table ? ' (T' + findTable(o.table).number + ')' : to ? '' : ' (바 픽업)'));
    return o;
  }

  function addGuest(tableId, npcId) {
    (state.guests[tableId] ??= []).push(npcId);
    (state.met[tableId] ??= []).push(npcId); // 오늘의 기억용: 일어나도 함께한 기록은 남는다
  }

  function advanceOrder(id) {
    const o = state.orders.find(o => o.id === id);
    if (!o || o.status === '취소' || o.status === '서빙 완료') return o;
    o.status = ORDER_STEPS[ORDER_STEPS.indexOf(o.status) + 1];
    return o;
  }

  // 손님은 '접수' 단계에서만 직접 취소할 수 있다(제안 정책).
  function cancelOrder(id) {
    const o = state.orders.find(o => o.id === id);
    if (!o) throw new Error('없는 주문이에요.');
    if (o.status !== '접수') throw new Error('이미 준비를 시작해서 호스트에게 말해야 해요.');
    o.status = '취소';
    record('주문 취소 · ' + o.name);
    return o;
  }

  function greet(id, name) {
    state.greeted.add(id);
    record('인사 · ' + name);
  }

  function summary() {
    const live = state.orders.filter(o => o.status !== '취소');
    return {
      tables: state.joined.map(id => findTable(id).title),
      greeted: state.greeted.size,
      orders: live.reduce((a, o) => a + (o.qty ?? 1), 0),
      total: live.reduce((a, o) => a + o.price, 0),
      unfinished: live.filter(o => o.status !== '서빙 완료').length
    };
  }

  function reset() {
    state.table = null;
    state.pending = null;
    state.orders = [];
    state.greeted = new Set();
    state.joined = [];
    state.guests = {};
    state.met = {};
    state.owned = null;
    state.praised = new Set();
    state.logs = [];
  }

  return {state, record, occupancy, isFull, mySeat, setProfile, request, cancelRequest, declineRequest,
    confirmSeat, leave, claim, sitFree, hooks, mySeatIndex, praise, receivePraise, recentSame, order, addGuest, advanceOrder, cancelOrder, greet, summary, reset};
}
