// v2.14 입장 시퀀스: 초대장(멤버 카드) 스캔 → 문이 닫혔다 열리며 바 안으로.
// 비밀번호는 저장하지 않고 해시만 비교한다. 같은 비밀번호끼리만 같은 방 열쇠(__bamKey)를 얻는다.
const CHECK = '345eed1ea6899355018991ea086a734c50db7bb73e42c572c728c40540580aeb';
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const $ = id => document.getElementById(id);
const ls = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = p => { try { navigator.vibrate?.(p); } catch {} };
const wait = ms => new Promise(r => setTimeout(r, reduced ? Math.min(ms, 120) : ms * 1.45)); // v2.15 천천히: 각 단계가 보이게

// 기기마다 고정된 멤버 번호(1000~9999). 같은 기기 = 같은 캐릭터 = 같은 번호
export function memberNo() {
  let uid = ls.get('bam-uid');
  if (!uid) { uid = 'u_' + Math.random().toString(36).slice(2, 12); ls.set('bam-uid', uid); }
  let h = 7; for (const ch of uid) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return String(1000 + h % 9000);
}
const device = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Browser'; };

function rows(key) {
  const no = memberNo();
  return [['INVITE', '초대 코드 일치'], ['DEVICE', `${device()} · 이 기기 1대`], ['ROOM', `SEONGSU · 🔒 ${key.slice(0, 4).toUpperCase()}…`], ['MEMBER', `No. ${no}`]];
}

// 스캔 연출. fast = 다시 온 사람(저장된 비밀번호)용 짧은 버전
async function scan(key, {fast = false} = {}) {
  const g = $('passGate'), st = $('gateSt'), data = $('gateData');
  data.innerHTML = rows(key).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  g.classList.remove('bad'); g.classList.add('run', 'flash'); buzz(12);
  st.textContent = fast ? '멤버 카드 확인 중' : '초대장 확인 중';
  await wait(fast ? 150 : 420); g.classList.add('sweep');
  const lines = [...data.children], fx = [...g.querySelectorAll('.mc .fx')];
  const step = fast ? 170 : 380;
  fx.forEach((f, i) => setTimeout(() => f.classList.add('on'), (fast ? 100 : 450) + i * (fast ? 120 : 300)));
  for (let i = 0; i < lines.length; i++) {
    await wait(i ? step : (fast ? 120 : 500)); lines[i].classList.add('on');
    if (!fast && i === 1) st.textContent = '기기 등록 중';
    if (!fast && i === 2) st.textContent = '방 열쇠 받는 중';
  }
  await wait(fast ? 260 : 520);
  g.querySelector('.mc-no').textContent = 'No. ' + memberNo();
  g.classList.remove('sweep'); g.classList.add('done'); st.textContent = fast ? '어서 와요' : '입장 허가'; buzz([20, 40, 20]);
  await wait(fast ? 450 : 900);
}

// 문이 닫히고(쿵) → 틈으로 불빛 → 양쪽으로 열린다. 문이 닫힌 순간 앱을 이어서 띄운다.
async function doors(resolve) {
  const g = $('passGate');
  g.classList.add('shut'); await wait(460); buzz(25);
  $('loading').hidden = false; resolve();
  await wait(380); g.classList.add('seam');
  await wait(420); g.classList.add('open');
  await wait(1100); g.hidden = true; g.className = 'gate';
}

export async function unlock() {
  const testing = new URLSearchParams(location.search).has('broker');
  if (testing) return;
  const g = $('passGate');
  const saved = (ls.get('bam-pass') || '').toUpperCase();
  if (saved && await sha('bam-check:' + saved) === CHECK) {
    window.__bamKey = (await sha('bam-room:' + saved)).slice(0, 24);
    // 사파리가 잠깐 잠들었다 깬 거면(이어하기) 연출 없이 바로
    try { const r = JSON.parse(ls.get('bam-resume') || 'null'); if (r && Date.now() - r.at < 20 * 60000) return; } catch {}
    $('loading').hidden = true; g.hidden = false; g.classList.add('returning');
    await wait(350); await scan(window.__bamKey, {fast: true});
    return new Promise(res => doors(res));
  }
  $('loading').hidden = true; g.hidden = false;
  const input = $('passInput'), msg = $('passMsg'), st = $('gateSt');
  setTimeout(() => input.focus({preventScroll: true}), 600);
  return new Promise(resolve => {
    let busy = false;
    const tryIt = async () => {
      if (busy) return;
      const pw = input.value.trim().toUpperCase(); // 폰 자판 대소문자 상관없이
      if (!pw) { input.focus(); return; }
      busy = true;
      if (await sha('bam-check:' + pw) !== CHECK) {
        g.classList.remove('bad'); void g.offsetWidth; g.classList.add('bad'); buzz([30, 40, 30]);
        st.textContent = '등록되지 않은 초대 코드'; msg.textContent = '비밀번호가 달라요 · 초대한 사람에게 다시 확인해요';
        input.value = ''; busy = false; setTimeout(() => { if (g.classList.contains('bad')) { g.classList.remove('bad'); st.textContent = 'INVITATION ONLY'; } }, 1600);
        return;
      }
      ls.set('bam-pass', pw); input.blur();
      window.__bamKey = (await sha('bam-room:' + pw)).slice(0, 24);
      msg.textContent = '';
      await scan(window.__bamKey);
      doors(resolve);
    };
    $('passGo').onclick = tryIt;
    input.onkeydown = e => { if (e.key === 'Enter') tryIt(); };
    input.oninput = () => { msg.textContent = ''; g.style.setProperty('--typed', Math.min(1, input.value.length / 7)); };
  });
}
