'use strict';
const $=id=>document.getElementById(id);
const tables=[
{id:1,x:27,y:40,title:'안정 vs 도전',desc:'요즘 내 선택이 고민이라면',tag:'가벼운 딥토크',color:'#d8ee87',members:[['🐻','MOON'],['🐱','MIMI'],['🐼','JUNE']]},
{id:2,x:73,y:40,title:'최근 본 영화',desc:'인생 영화 한 편씩 꺼내봐요',tag:'영화 · 취향',color:'#b4a5ff',members:[['🐰','SORA'],['🐶','DAN']]},
{id:3,x:27,y:67,title:'퇴사 그 다음',desc:'새로운 시작에 관한 이야기',tag:'일 · 새로운 시작',color:'#ffae7e',members:[['🐹','SOL'],['🐨','ROO'],['🐯','KIM']]},
{id:4,x:73,y:67,title:'오늘의 플레이리스트',desc:'각자 좋아하는 노래 한 곡',tag:'음악 · 취향',color:'#8fcdd9',members:[['🐸','LILY'],['🐧','BO'],['🐻‍❄️','WOO'],['🦁','LEO']]}
];
const drinks=[{id:'highball',emoji:'🥃',name:'하이볼',price:15000,detail:'위스키 · 소다'},{id:'gimlet',emoji:'🍸',name:'김렛',price:16000,detail:'진 · 라임'},{id:'wine',emoji:'🍷',name:'레드 와인',price:13000,detail:'오늘의 글라스 와인'},{id:'soda',emoji:'🍹',name:'라임 소다',price:8000,detail:'무알코올'}];
const moods=['💬 이야기하고 싶어','🌙 그냥 한잔','🎲 어떤 판이든 좋아','👥 친구랑 놀러옴'];
let state,walk=0,toastTimer;
function initial(){return {entered:false,name:'JOHNNY',avatar:'🦊',mood:moods[0],table:null,quests:new Set(),orders:[],logs:[],x:50,y:89};}
state=initial();
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function occupancy(t){return t.members.length+(state.table===t.id?1:0);}
function notify(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function record(message){state.logs.unshift(message);state.logs=state.logs.slice(0,6);render();}
function quest(id){state.quests.add(id);}
function render(){
$('meAvatar').textContent=state.avatar;$('meName').textContent=state.name;$('meMood').textContent=state.mood;$('meAccessory').textContent=state.quests.size===3?'✨':'';
$('population').textContent=12+(state.entered?1:0);$('openCount').textContent=tables.filter(t=>occupancy(t)<4).length;
$('mapStatus').textContent=state.entered?'체험 입장 중':'마을 구경 중';$('enter').textContent=state.entered?'호스트 만나기':'마을 들어가기';
$('hint').textContent=state.entered?'빈 바닥을 누르면 걸어가요':'입장하면 내 미니미가 나타나요';
$('player').hidden=!state.entered;$('playerAvatar').textContent=state.avatar;$('playerName').innerHTML=`${esc(state.name)} <b>나</b>${state.quests.size===3?' ✨':''}`;
$('player').style.left=state.x+'%';$('player').style.top=state.y+'%';$('heldDrink').textContent=state.orders.length?state.orders.at(-1).emoji:'';
$('tableMap').innerHTML=tables.map(t=>`<button class="table ${occupancy(t)===4?'full':''} ${state.table===t.id?'selected':''}" data-table="${t.id}" style="left:${t.x}%;top:${t.y}%;--accent:${t.color}" aria-label="테이블 ${t.id}, ${esc(t.title)}, ${occupancy(t)}명, 정원 4명"><span class="residents">${state.entered?t.members.slice(0,3).map(m=>m[0]).join(''):'👤👤'}</span><span class="table-title">TABLE ${String(t.id).padStart(2,'0')}</span><span class="table-topic">${esc(t.title)}</span><span class="table-count">${state.table===t.id?'내가 앉은 판':occupancy(t)===4?'지금은 만석':`${occupancy(t)} / 4 · 참여 가능`}</span></button>`).join('');
$('tableList').innerHTML=tables.map(t=>`<button class="story" data-table="${t.id}"><span class="story-top"><span>TABLE ${String(t.id).padStart(2,'0')}</span><span>${state.table===t.id?'참여 중':occupancy(t)===4?'만석':`${4-occupancy(t)}자리 남음`}</span></span><h3>${esc(t.title)}</h3><span class="tags">${esc(t.tag)}</span></button>`).join('');
$('questCount').textContent=`${state.quests.size} / 3`;$('progress').style.width=state.quests.size/3*100+'%';
$('quests').innerHTML=[['enter','마을에 입장하기'],['table','대화판에 앉아보기'],['host','호스트에게 인사하기']].map(([id,label])=>`<span class="${state.quests.has(id)?'done':''}">${state.quests.has(id)?'✓':'○'} ${label}</span>`).join('');
$('reward').hidden=state.quests.size!==3;$('emptyLog').hidden=state.logs.length>0;$('log').innerHTML=state.logs.map(l=>`<li>${esc(l)}</li>`).join('');
$('orderSummary').hidden=state.orders.length===0;$('total').textContent=state.orders.reduce((a,o)=>a+o.price,0).toLocaleString('ko-KR')+'원';
}
function show(label,html){$('dialogLabel').textContent=label;$('dialogContent').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function close(){if($('dialog').open)$('dialog').close();}
function requireEntry(){if(state.entered)return true;customize(true);return false;}
function move(x,y,callback){const seq=++walk;state.x=x;state.y=y;render();if(callback)setTimeout(()=>{if(seq===walk&&state.entered)callback();},720);}
function customize(entering=false){
let draft={avatar:state.avatar,mood:state.mood};
show('MY MINI-ME',`<h2>${entering?'내 미니미 데리고 입장':'오늘의 나를 꾸며봐요'}</h2><p>오늘 어떤 기분으로 놀러 왔어요?</p><form id="meForm"><label for="nickname">마을에서 부를 이름</label><input id="nickname" maxlength="12" required autocomplete="nickname" value="${esc(state.name)}"><label>내 미니미</label><div class="choices">${['🦊','🐱','🐻','🐰','🐼','🐶'].map(a=>`<button type="button" class="avatar-choice ${a===draft.avatar?'active':''}" data-avatar="${a}" aria-label="${a} 미니미" aria-pressed="${a===draft.avatar}">${a}</button>`).join('')}</div><label>오늘의 기분</label><div class="choices">${moods.map(m=>`<button type="button" class="mood ${m===draft.mood?'active':''}" data-mood="${m}" aria-pressed="${m===draft.mood}">${m}</button>`).join('')}</div><button class="primary wide" type="submit">${entering?'이 미니미로 입장':'꾸미기 완료'}</button></form>`);
$('dialogContent').querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{draft.avatar=b.dataset.avatar;$('dialogContent').querySelectorAll('[data-avatar]').forEach(c=>{c.classList.toggle('active',c===b);c.setAttribute('aria-pressed',c===b);});});
$('dialogContent').querySelectorAll('[data-mood]').forEach(b=>b.onclick=()=>{draft.mood=b.dataset.mood;$('dialogContent').querySelectorAll('[data-mood]').forEach(c=>{c.classList.toggle('active',c===b);c.setAttribute('aria-pressed',c===b);});});
$('meForm').onsubmit=e=>{e.preventDefault();const name=$('nickname').value.trim();if(!name){$('nickname').setCustomValidity('이름을 입력해주세요.');$('nickname').reportValidity();return;}state.name=name;state.avatar=draft.avatar;state.mood=draft.mood;if(entering){state.entered=true;quest('enter');record('🌙 성수 마을에 첫 발을 들였어요.');}render();close();notify(entering?'환영해요! 테이블이나 호스트를 눌러봐요.':'오늘의 미니미가 준비됐어요.');};$('nickname').oninput=()=> $('nickname').setCustomValidity('');
}
function openTable(id){const t=tables.find(t=>t.id===id);if(!t)return;if(!requireEntry())return;close();move(t.x,t.y+13,()=>tableDetail(t));}
function tableDetail(t){
const mine=state.table===t.id,full=occupancy(t)>=4&&!mine;
show(`TABLE ${String(t.id).padStart(2,'0')}`,`<h2>${esc(t.title)}</h2><p>${esc(t.desc)}</p><div class="members">${t.members.map(([a,n])=>`<div class="member">${a}<small>${n}</small></div>`).join('')}${mine?`<div class="member">${state.avatar}<small>나</small></div>`:''}</div><div class="dialog-note">${mine?'이 테이블에 앉아 있어요. 폰을 내려놓고 대화를 시작할 시간!':full?'지금은 예시 주민 4명이 앉아 있어요. 다른 이야기도 둘러볼까요?':'참여 요청을 보내고, 테이블의 수락을 받으면 함께 앉아요. 이 체험에서는 예시 수락을 직접 눌러볼 수 있어요.'}</div>${mine?'<button id="leaveTable" class="secondary">테이블에서 나오기</button>':full?'<button id="otherTable" class="primary wide">다른 테이블 둘러보기</button>':'<button id="requestJoin" class="primary wide">같이 앉아도 될까요?</button>'}`);
if(mine)$('leaveTable').onclick=()=>{state.table=null;close();move(50,83);record(`👋 TABLE ${t.id}에서 나왔어요.`);};
else if(full)$('otherTable').onclick=()=>{close();notify('열린 테이블을 눌러봐요.');};
else $('requestJoin').onclick=()=>{
show('JOIN REQUEST',`<h2>테이블에 참여 요청</h2><p>실제 서비스에서는 주민들이 수락한 뒤 호스트가 자리를 안내해요.</p><div class="dialog-note">지금은 예시 상황이에요. 아래에서 수락 또는 거절을 체험해볼 수 있어요.</div><button id="approveDemo" class="primary wide">수락 상황 체험하기</button><button id="declineDemo" class="secondary">거절 상황 체험하기</button>`);
$('approveDemo').onclick=()=>{if(t.members.length>=4){notify('빈자리가 없어요.');return;}const previous=state.table;state.table=t.id;quest('table');record(`🎲 ${t.title} 테이블에 앉았어요.`);close();notify(previous&&previous!==t.id?'이전 자리에서 나와 새로운 판에 앉았어요.':'수락됐어요! 실제 매장이라면 호스트가 자리로 안내해요.');};
$('declineDemo').onclick=()=>{close();notify('지금은 함께하기 어려워요. 다른 판도 둘러봐요.');};
};
}
function openHost(){if(!requireEntry())return;close();move(50,24,hostDetail);}
function hostDetail(){quest('host');render();show('HOST JAY',`<h2>오늘 뭐 하고 놀까요?</h2><p>편하게 한잔해도, 새로운 이야기에 들어가도 좋아요.</p><button id="menu" class="primary wide">🍸 메뉴 보고 주문하기</button><button id="recommend" class="secondary">🎲 열린 테이블 추천받기</button><button id="help" class="secondary">🙋 호스트에게 도움 요청</button>`);$('menu').onclick=openMenu;$('recommend').onclick=()=>{const t=tables.find(t=>occupancy(t)<4&&state.table!==t.id);if(t)openTable(t.id);else notify('지금은 열린 자리가 없어요. 잠시 라운지에서 쉬어요.');};$('help').onclick=()=>show('HOST HELP',`<h2>호스트가 함께할게요</h2><p>실제 매장에서는 직원에게 바로 도움을 요청할 수 있어요.</p><div class="dialog-note">이 체험판에는 직원 호출이 연결되지 않았어요.</div><button class="primary wide" id="helpDone">확인</button>`);$('help').addEventListener('click',()=>{$('helpDone').onclick=close;});}
function openMenu(){show('BAR MENU',`<h2>한잔 골라볼까요?</h2><p>체험 주문이에요. 실제 결제나 음료 제조는 발생하지 않아요.</p>${drinks.map(d=>`<div class="menu-item"><div><b>${d.emoji} ${d.name}</b><small>${d.detail} · ${d.price.toLocaleString('ko-KR')}원</small></div><button class="add" data-drink="${d.id}">고르기</button></div>`).join('')}`);$('dialogContent').querySelectorAll('[data-drink]').forEach(b=>b.onclick=()=>{const d=drinks.find(d=>d.id===b.dataset.drink);confirmDrink(d);});}
function confirmDrink(d){show('DEMO ORDER',`<h2>${d.emoji} ${d.name}</h2><p>${d.price.toLocaleString('ko-KR')}원 · 1잔</p><div class="dialog-note">미니미 손에 음료가 생기고, 밤의 기록에 추가돼요. 실제 주문이나 결제는 진행되지 않아요.</div><button id="order" class="primary wide">체험 주문하기</button><button id="backMenu" class="secondary">메뉴로 돌아가기</button>`);$('order').onclick=()=>{state.orders.push({...d});record(`${d.emoji} ${d.name} 체험 주문 · ${d.price.toLocaleString('ko-KR')}원`);close();notify('미니미가 음료를 들었어요. 현실에선 이제 폰 내려놓기!');};$('backMenu').onclick=openMenu;}
$('enter').onclick=()=>state.entered?openHost():customize(true);$('customize').onclick=()=>customize(false);$('editMe').onclick=()=>customize(false);$('host').onclick=openHost;$('closeDialog').onclick=close;
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-table]');if(b)openTable(Number(b.dataset.table));});
$('map').addEventListener('click',e=>{if(e.target.closest('button'))return;if(!requireEntry())return;const r=$('map').getBoundingClientRect();const x=(e.clientX-r.left)/r.width*100,y=(e.clientY-r.top)/r.height*100;move(Math.max(8,Math.min(92,x)),Math.max(24,Math.min(92,y)));});
$('map').addEventListener('keydown',e=>{if(e.target!==$('map')||!state.entered||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();move(Math.max(8,Math.min(92,state.x+(e.key==='ArrowRight'?5:e.key==='ArrowLeft'?-5:0))),Math.max(24,Math.min(92,state.y+(e.key==='ArrowDown'?5:e.key==='ArrowUp'?-5:0))));});
$('rest').onclick=()=>{if(!requireEntry())return;state.table=null;move(19,87);notify('라운지에 잠깐 쉬러 왔어요. 혼자 있어도 괜찮아요.');};
$('reset').onclick=()=>{show('NEW NIGHT',`<h2>처음부터 체험할까요?</h2><p>지금의 미니미, 테이블, 체험 주문과 밤의 기록이 초기화돼요.</p><button id="confirmReset" class="primary wide">체험 초기화</button><button id="cancelReset" class="secondary">계속 놀기</button>`);$('confirmReset').onclick=()=>{walk++;state=initial();render();close();notify('새로운 밤을 시작해요.');};$('cancelReset').onclick=close;};
render();
if(document.modelContext?.registerTool){const controller=new AbortController();const definitions=[{name:'read_village_demo',description:'Read example village state; all residents and orders are simulated.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Expected empty input');return {demo:true,entered:state.entered,tables:tables.map(t=>({id:t.id,topic:t.title,occupancy:occupancy(t),capacity:4})),myTable:state.table,orders:state.orders.length};}},{name:'start_table_join_demo',description:'Open a simulated table participation flow. Does not complete participation or contact real people.',inputSchema:{type:'object',properties:{tableId:{type:'integer',minimum:1,maximum:4}},required:['tableId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{if(!input||Object.keys(input).length!==1||!Number.isInteger(input.tableId)||!tables.some(t=>t.id===input.tableId))throw new Error('Invalid tableId');if(!state.entered)throw new Error('Enter the example village first');openTable(input.tableId);await new Promise(r=>setTimeout(r,750));return {demo:true,flowOpened:$('dialog').open,tableId:input.tableId};}}];definitions.forEach(t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:controller.signal})).catch(()=>{});}catch{}});window.addEventListener('pagehide',()=>controller.abort(),{once:true});}
