// 밤마을 v1.1 — 테이블 술게임: 주사위 · 룰렛 · 사다리타기.
// 결과는 시작한 사람이 정하고(payload), 같은 테이블의 팀원 화면에서는 같은 결과로 같은 애니메이션이 재생된다.
import {PENALTIES, PENALTY_ICONS} from './map-data.mjs?v=1791561358';

const COLORS = ['#ff8f7a', '#ffd36b', '#8fd0c9', '#c9a2e8', '#9ad37a', '#7fc8e8', '#f5a3c0', '#f2b675'];
const $ = id => document.getElementById(id);
const pick = n => Math.floor(Math.random() * n);
const ease = t => 1 - Math.pow(1 - t, 3);
const FONT = "'Jua', 'Gowun Dodum', sans-serif";

export function createGames(G) {
  const esc = G.esc;
  let anim = 0;

  function menu() {
    const names = G.names();
    G.show('🎲 술게임', `<h2>오늘의 한 판, 뭘로 정할까요?</h2>
      <p class="meta">이 테이블 ${names.length}명 · ${names.map(esc).join(', ')}</p>
      <div class="choice-list game-menu">
        <button data-g="dice"><b>🎲 주사위</b><small>다 같이 굴려서 가장 낮은 사람이 마셔요</small></button>
        <button data-g="roulette"><b>🎡 룰렛</b><small>누가 마실지, 어떤 벌칙일지 돌려요</small></button>
        <button data-g="ladder"><b>🪜 사다리타기</b><small>사다리 끝에 당첨이 숨어 있어요</small></button>
      </div>
      <p class="note">무리하지 않기! 벌칙은 물이나 논알코올로 바꿔도 돼요. 팀원이 같은 테이블에 있으면 같은 결과가 함께 보여요.</p>`);
    document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => ({dice: diceSetup, roulette: rouletteSetup, ladder: ladderSetup})[b.dataset.g]());
  }

  // ── 주사위 ────────────────────────────────────────────
  function diceSetup() {
    G.show('🎲 주사위', `<h2>주사위 굴리기</h2>
      <div class="choice-list"><button id="gdAll"><b>다 같이 굴리기</b><small>합이 가장 낮은 사람이 마셔요</small></button>
      <button id="gdMe"><b>나만 굴리기</b><small>숫자로 정하는 게임에</small></button></div>
      <button class="secondary" id="gBack">게임 고르기</button>`);
    $('gBack').onclick = menu;
    $('gdAll').onclick = () => start({kind: 'dice', names: G.names(), rolls: G.names().map(() => [1 + pick(6), 1 + pick(6)])});
    $('gdMe').onclick = () => start({kind: 'dice', names: [G.myName()], rolls: [[1 + pick(6), 1 + pick(6)]]});
  }
  // ── 룰렛 ──────────────────────────────────────────────
  function rouletteSetup() {
    G.show('🎡 룰렛', `<h2>무엇을 돌릴까요?</h2>
      <div class="choice-list"><button id="grWho"><b>누가 마실까?</b><small>이 테이블 사람 이름으로</small></button>
      <button id="grWhat"><b>벌칙 룰렛</b><small>${PENALTIES.slice(0, 4).map(esc).join(' · ')} …</small></button></div>
      <button class="secondary" id="gBack">게임 고르기</button>`);
    $('gBack').onclick = menu;
    $('grWho').onclick = () => { const items = G.names(); start({kind: 'roulette', title: '누가 마실까?', items, win: pick(items.length), turns: 4 + pick(3)}); };
    $('grWhat').onclick = () => penaltyPicker('roulette');
  }
  // ── 사다리 ────────────────────────────────────────────
  function ladderSetup() { penaltyPicker('ladder'); }
  // 벌칙 아이콘 고르기: 사다리는 고른 벌칙 + 나머지 '통과', 룰렛은 고른 벌칙만으로 돌린다.
  let chosen = ['🍺 원샷'];
  function penaltyPicker(kind) {
    const n = G.names().length, max = kind === 'ladder' ? Math.max(1, n) : 10;
    const render = () => {
      G.show(kind === 'ladder' ? '🪜 사다리타기' : '🎡 벌칙 룰렛', `<h2>벌칙을 골라요</h2>
        <p class="meta">${kind === 'ladder' ? `${n}명 참가 · 최대 ${max}개 · 나머지 칸은 ‘통과’` : '2개 이상 골라요'}</p>
        <div class="pen-grid">${PENALTY_ICONS.map(([ic, nm]) => { const v = ic + ' ' + nm, on = chosen.includes(v); return `<button data-pen="${v}" class="${on ? 'on' : ''}"><span>${ic}</span>${nm}</button>`; }).join('')}</div>
        <button class="action" id="penGo" ${(kind === 'ladder' ? chosen.length >= 1 : chosen.length >= 2) ? '' : 'disabled'}>${kind === 'ladder' ? '사다리 타기' : '룰렛 돌리기'} · ${chosen.length}개</button>
        <button class="secondary" id="gBack">게임 고르기</button>
        <p class="note">벌칙은 언제든 물·논알코올로 바꿔도 돼요.</p>`);
      document.querySelectorAll('[data-pen]').forEach(b => b.onclick = () => {
        const v = b.dataset.pen;
        if (chosen.includes(v)) chosen = chosen.filter(x => x !== v); else if (chosen.length < max) chosen = [...chosen, v]; else G.status(`최대 ${max}개까지 골라요`);
        render();
      });
      $('gBack').onclick = menu;
      $('penGo').onclick = () => kind === 'ladder' ? startLadder() : start({kind: 'roulette', title: '벌칙 룰렛', items: [...chosen], win: pick(chosen.length), turns: 4 + pick(3)});
    };
    render();
  }
  function startLadder() {
    const names = G.names(), N = names.length;
    let results = Array.from({length: N}, (_, i) => chosen[i] ?? '통과');
    results = results.map(r => [Math.random(), r]).sort((a, c) => a[0] - c[0]).map(r => r[1]);
    const rows = 9, rungs = [];
    for (let r = 0; r < rows; r++) { let last = -2; for (let i = 0; i < N - 1; i++) if (i - last > 1 && Math.random() < .45) { rungs.push([r, i]); last = i; } }
    start({kind: 'ladder', names, results, rungs, rows});
  }

  // ── 실행(내가 시작 / 팀원이 시작) ──────────────────────
  function start(p) { G.share(p); play(p, null); }
  function play(p, from) {
    cancelAnimationFrame(anim);
    const title = p.kind === 'dice' ? '🎲 주사위' : p.kind === 'roulette' ? '🎡 ' + p.title : '🪜 사다리타기';
    G.show(title, `${from ? `<p class="kicker">${esc(from)}님이 시작했어요</p>` : ''}<canvas id="gCanvas" width="600" height="600" class="game-canvas"></canvas>
      <p class="game-result" id="gResult">…</p>
      <button class="action" id="gAgain">다시 하기</button><button class="secondary" id="gMenu">다른 게임</button>`);
    $('gAgain').onclick = () => ({dice: diceSetup, roulette: rouletteSetup, ladder: ladderSetup})[p.kind]();
    $('gMenu').onclick = menu;
    const cv = $('gCanvas'), c = cv.getContext('2d'), t0 = performance.now();
    const loop = now => {
      if (!cv.isConnected) return;
      const k = Math.max(0, (now - t0) / 1000); // rAF 시각이 시작 시각보다 조금 이를 수 있다
      const done = (p.kind === 'dice' ? drawDice : p.kind === 'roulette' ? drawRoulette : drawLadder)(c, p, k);
      if (!done) anim = requestAnimationFrame(loop); else finish(p);
    };
    anim = requestAnimationFrame(loop);
  }
  function finish(p) {
    let text = '', loser = null;
    if (p.kind === 'dice') {
      if (p.names.length === 1) text = `${p.rolls[0][0]} + ${p.rolls[0][1]} = ${p.rolls[0][0] + p.rolls[0][1]}`;
      else { const sums = p.rolls.map(r => r[0] + r[1]), min = Math.min(...sums); const losers = p.names.filter((_, i) => sums[i] === min); loser = losers; text = `🍺 ${losers.join(', ')} 마시기! (합 ${min})`; }
    } else if (p.kind === 'roulette') {
      const it = p.items[p.win]; text = p.title === '누가 마실까?' ? `🍺 ${it} 당첨!` : `벌칙: ${it}`; if (p.title === '누가 마실까?') loser = [it];
    } else {
      const map = ladderMap(p); const hits = p.names.filter((_, i) => p.results[map[i]] !== '통과');
      text = hits.map(nm => `${nm} → ${p.results[map[p.names.indexOf(nm)]]}`).join(' · ') || '모두 통과!'; loser = hits;
    }
    if ($('gResult')) $('gResult').textContent = text;
    for (const nm of loser ?? []) G.bubbleByName(nm, '🍺 원샷!');
    G.status(text);
  }

  // ── 그리기 ────────────────────────────────────────────
  function bg(c) { c.fillStyle = '#2b1d16'; c.fillRect(0, 0, 600, 600); }
  function die(c, x, y, s, v, col = '#fff8e9') {
    c.fillStyle = col; c.strokeStyle = '#5a3d2b'; c.lineWidth = 5; c.beginPath(); c.roundRect(x, y, s, s, s * .18); c.fill(); c.stroke();
    const P = {1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]]}[v];
    c.fillStyle = v === 1 ? '#e8584a' : '#3b2a22'; for (const [a, b] of P) { c.beginPath(); c.arc(x + a * s, y + b * s, s * .09, 0, Math.PI * 2); c.fill(); }
  }
  function drawDice(c, p, k) {
    bg(c); const n = p.names.length, rolling = k < 1.4;
    if (n === 1) {
      for (let j = 0; j < 2; j++) { const v = rolling ? 1 + Math.floor((k * 17 + j * 3) % 6) : p.rolls[0][j]; const wob = rolling ? Math.sin(k * 30 + j) * 12 : 0; c.save(); c.translate(150 + j * 300, 300); c.rotate(wob * .02); die(c, -95, -95 + wob, 190, v); c.restore(); }
      return k > 1.8;
    }
    const rowH = Math.min(110, 560 / n), s = rowH * .72;
    const sums = p.rolls.map(r => r[0] + r[1]), min = Math.min(...sums);
    p.names.forEach((nm, i) => {
      const y = 20 + i * rowH, lose = !rolling && sums[i] === min;
      if (lose) { c.fillStyle = 'rgba(232,88,74,.35)'; c.fillRect(10, y, 580, rowH - 8); }
      c.fillStyle = '#ffe9c2'; c.font = `${Math.min(40, rowH * .38)}px ${FONT}`; c.textBaseline = 'middle'; c.fillText(nm, 24, y + rowH / 2 - 4);
      for (let j = 0; j < 2; j++) { const v = rolling ? 1 + Math.floor((k * 19 + i * 5 + j * 3) % 6) : p.rolls[i][j]; die(c, 330 + j * (s + 14), y + (rowH - 8 - s) / 2, s, v); }
      if (!rolling) { c.fillStyle = lose ? '#ffd36b' : '#c9b49c'; c.fillText(lose ? '🍺' : String(sums[i]), 330 + 2 * (s + 14) + 6, y + rowH / 2 - 4); }
    });
    return k > 1.8;
  }
  function drawRoulette(c, p, k) {
    bg(c); const n = p.items.length, seg = Math.PI * 2 / n, T = 3.6;
    const end = p.turns * Math.PI * 2 + (Math.PI * 2 - (p.win + .5) * seg);
    const a = end * ease(Math.min(1, k / T));
    c.save(); c.translate(300, 315); c.rotate(a - Math.PI / 2);
    for (let i = 0; i < n; i++) {
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 250, i * seg, (i + 1) * seg); c.closePath();
      c.fillStyle = COLORS[i % COLORS.length]; c.fill(); c.strokeStyle = '#5a3d2b'; c.lineWidth = 4; c.stroke();
      c.save(); c.rotate((i + .5) * seg); c.fillStyle = '#3b2a22'; c.textAlign = 'right'; c.textBaseline = 'middle';
      const label = p.items[i]; c.font = `${Math.min(34, 520 / Math.max(6, label.length * 1.6))}px ${FONT}`; c.fillText(label, 232, 0); c.restore();
    }
    c.restore();
    c.fillStyle = '#fff8e9'; c.beginPath(); c.arc(300, 315, 34, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#5a3d2b'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#e8584a'; c.beginPath(); c.moveTo(300, 92); c.lineTo(276, 40); c.lineTo(324, 40); c.closePath(); c.fill(); c.stroke();
    return k > T + .3;
  }
  function ladderMap(p) {
    const N = p.names.length, map = [];
    for (let s = 0; s < N; s++) { let col = s; for (let r = 0; r < p.rows; r++) { if (p.rungs.some(([rr, i]) => rr === r && i === col)) col++; else if (p.rungs.some(([rr, i]) => rr === r && i === col - 1)) col--; } map.push(col); }
    return map;
  }
  function ladderPath(p, s, X, Y) {
    const pts = [[X(s), Y(-1)]]; let col = s;
    for (let r = 0; r < p.rows; r++) {
      pts.push([X(col), Y(r)]);
      if (p.rungs.some(([rr, i]) => rr === r && i === col)) { col++; pts.push([X(col), Y(r)]); }
      else if (p.rungs.some(([rr, i]) => rr === r && i === col - 1)) { col--; pts.push([X(col), Y(r)]); }
    }
    pts.push([X(col), Y(p.rows)]);
    return pts;
  }
  function drawLadder(c, p, k) {
    bg(c); const N = p.names.length, left = 60, right = 540, top = 80, bottom = 510;
    const X = i => N === 1 ? 300 : left + (right - left) * i / (N - 1), Y = r => top + (bottom - top) * (r + 1) / (p.rows + 1);
    c.strokeStyle = '#c9b49c'; c.lineWidth = 6; c.lineCap = 'round';
    for (let i = 0; i < N; i++) { c.beginPath(); c.moveTo(X(i), top); c.lineTo(X(i), bottom); c.stroke(); }
    for (const [r, i] of p.rungs) { c.beginPath(); c.moveTo(X(i), Y(r)); c.lineTo(X(i + 1), Y(r)); c.stroke(); }
    c.font = `${N > 6 ? 22 : 28}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    p.names.forEach((nm, i) => { c.fillStyle = COLORS[i % COLORS.length]; c.fillText(nm.slice(0, 6), X(i), 40); });
    const prog = Math.min(1, k / 3);
    const map = ladderMap(p);
    p.names.forEach((_, s) => {
      const pts = ladderPath(p, s, X, Y); let len = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
      let remain = len * prog; c.strokeStyle = COLORS[s % COLORS.length]; c.lineWidth = 8; c.beginPath(); c.moveTo(...pts[0]);
      for (let i = 1; i < pts.length && remain > 0; i++) { const f = Math.min(1, remain / seg[i - 1]); c.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); remain -= seg[i - 1]; }
      c.stroke();
    });
    p.results.forEach((r, i) => {
      const reveal = prog >= 1;
      c.fillStyle = reveal ? (r === '통과' ? '#c9b49c' : '#ffd36b') : '#6b5a4c';
      c.font = `${N > 6 ? 18 : 24}px ${FONT}`; c.fillText(reveal ? r.slice(0, 7) : '?', X(i), 555);
      if (reveal) { const who = map.indexOf(i); if (who >= 0) { c.fillStyle = COLORS[who % COLORS.length]; c.beginPath(); c.arc(X(i), 528, 7, 0, Math.PI * 2); c.fill(); } }
    });
    return k > 3.4;
  }

  return {menu, play};
}
