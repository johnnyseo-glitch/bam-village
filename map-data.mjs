// 밤마을 v0.7 — 매장 배치와 예시 데이터.
// 좌표는 가상 단위이며 실측 평면도가 아니다.
// 테이블은 종류마다 좌석 수와 좌석 위치가 다르다:
//   round(원형 4인) · booth(벨벳 부스 4인) · ring(링 바 6인, 호스트가 가운데) · long(긴 테이블 6인) · sofa(소파 거실존 5석)

// v1.7: 앞쪽(입구 쪽)으로 4m 넓혔다. 입구는 맨 앞, 문턱(DOOR_Z)을 넘어 걸어 나가면 골목으로 나간다.
export const ROOM = {width: 18, depth: 19, minX: -8.4, maxX: 8.4, minZ: -6.9, maxZ: 10.9, cz: 2};
export const ENTRY = {x: 0, z: 9.3};
export const DOOR_Z = 10.35;
export const WELCOME_ZONE = {x: 0, z: 8.9, r: 1.7};

// 복층(메자닌): 뒤쪽 벽을 따라 2층. 왼쪽 벽 계단으로 오르내린다.
export const MEZZ_Y = 2.9;
export const MEZZ = {front: -5.1, walk: {minX: -8.2, maxX: 8.2, minZ: -7.15, maxZ: -5.4}};
export const STAIRS = {x: -7.8, bottomZ: -1.2, topZ: -5.1, width: 1.05,
  ground: {x: -7.8, z: -.85}, upper: {x: -7.8, z: -5.7}};

// 의자 종류별 앉은 높이(캐릭터 기준점 y)
export const SEAT_HEIGHT = {stool: .54, chair: .36, dining: .3, sofa: .2, lounge: .18, booth: .05};
const AFTER_SEAT = SEAT_HEIGHT.lounge + 2.9;

const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

function roundSeats(cx, cz) {
  return [0, Math.PI, Math.PI * 1.5, Math.PI * .5].map(a => {
    const x = cx + Math.cos(a) * 1.12, z = cz + Math.sin(a) * 1.12;
    return {x, z, heading: face(x, z, cx, cz), y: SEAT_HEIGHT.chair, kind: 'chair'};
  });
}
// 링 바: 앞쪽 240°에 의자 6개, 뒤쪽은 호스트가 드나드는 통로로 비운다.
// 가운데 돌기둥(병 선반) 앞에 호스트가 선다. 뒤쪽 통로로 드나든다.
// v2.0: 공간 한가운데 웅장한 원형 바. JAY가 가운데서 모든 걸 관장한다.
// v2.1: 바닥 정가운데(ROOM.cz)로. 뒤쪽 통로로 JAY가 드나든다.
export const RING = {x: 0, z: 2.0, outer: 1.6, inner: .95, stool: 2.12, gap: Math.PI / 3, column: .34,
  host: {x: .45, z: 2.58}, hostPath: [{x: .65, z: 1.85}, {x: .35, z: 1.05}, {x: 0, z: -.6}, {x: 0, z: -6.1}]};
function ringSeats() {
  return [-2.1, -1.26, -.42, .42, 1.26, 2.1].map(d => {
    const a = Math.PI / 2 + d, x = RING.x + Math.cos(a) * RING.stool, z = RING.z + Math.sin(a) * RING.stool;
    return {x, z, heading: face(x, z, RING.x, RING.z), y: SEAT_HEIGHT.stool, kind: 'stool'};
  });
}
// 벨벳 부스: 테이블 뒤쪽을 감싸는 반원 소파
function boothSeats(cx, cz) {
  return [-150, -112, -68, -30].map(d => {
    const a = d * Math.PI / 180, x = cx + Math.cos(a) * 1.1, z = cz + Math.sin(a) * 1.1;
    return {x, z, heading: face(x, z, cx, cz), y: SEAT_HEIGHT.booth, kind: 'booth'};
  });
}
function longSeats(cx, cz) {
  const seats = [];
  for (const side of [-1, 1]) for (const dx of [-.9, 0, .9]) {
    const x = cx + dx, z = cz + side * .85;
    seats.push({x, z, heading: side < 0 ? 0 : Math.PI, y: SEAT_HEIGHT.dining, kind: dx === 0 ? 'tub' : 'dining'});
  }
  return seats;
}
// 마주 보는 하이 바 테이블: 긴 상판 양쪽에 스툴 3개씩, 서로 마주 본다.
function barSeats(cx, cz) {
  const seats = [];
  for (const side of [-1, 1]) for (const dx of [-1.0, 0, 1.0]) seats.push({x: cx + dx, z: cz + side * .78, heading: side < 0 ? 0 : Math.PI, y: SEAT_HEIGHT.stool, kind: 'stool'});
  return seats;
}
// AFTER DRINK 존(2층): 2인 테이블. 의자 두 개가 마주 본다.
function afterSeats(cx, cz) {
  return [{x: cx - .58, z: cz, heading: Math.PI / 2, y: AFTER_SEAT, kind: 'after'}, {x: cx + .58, z: cz, heading: -Math.PI / 2, y: AFTER_SEAT, kind: 'after'}];
}
export const SOFA = {x: 6.7, z: 1.85, coffee: {x: 5.35, z: 1.85}};
function sofaSeats() {
  return [
    {x: SOFA.x - .1, z: 1.1, heading: -Math.PI / 2, y: SEAT_HEIGHT.sofa, kind: 'sofa'},
    {x: SOFA.x - .1, z: 1.85, heading: -Math.PI / 2, y: SEAT_HEIGHT.sofa, kind: 'sofa'},
    {x: SOFA.x - .1, z: 2.6, heading: -Math.PI / 2, y: SEAT_HEIGHT.sofa, kind: 'sofa'},
    {x: SOFA.coffee.x - 1.25, z: 1.15, heading: Math.PI / 2 + .25, y: SEAT_HEIGHT.lounge, kind: 'leather'},
    {x: SOFA.coffee.x - 1.25, z: 2.55, heading: Math.PI / 2 - .25, y: SEAT_HEIGHT.lounge, kind: 'leather'}
  ];
}

// demoResponse: 체험에서 이 테이블이 참여 요청에 어떻게 반응하는지 고정한 시나리오(정책 아님).
// memberSeats: 예시 주민이 앉은 좌석 번호. 나머지 좌석이 빈자리이고, freeOrder 순서로 내가 앉는다.
// v2.0 배치: 가운데 원형 바(6) · 안쪽 좌우 부스(6+6) · 가운데 좌우 리빙룸 라운지(6+6) · 입구 좌우 바 테이블(6+6) = 1층 42석
// v2.3 좌우 다르게: 왼쪽 = 러스트 벨벳·브라스(따뜻한 쪽), 오른쪽 = 딥 그린·코냑 가죽·월넛(서재 같은 쪽)
export const BOOTHS = [{x: -5.0, z: -3.55, style: 'rust'}, {x: 5.0, z: -3.35, style: 'green'}];
export const LOUNGES = [{x: -6.0, z: 2.0, side: -1, style: 'rust'}, {x: 6.0, z: 2.75, side: 1, style: 'green'}]; // 원형 바 양옆으로 넓게, 높이도 살짝 다르게
function booth6Seats(cx, cz) {
  return [-160, -132, -104, -76, -48, -20].map(d => {
    const a = d * Math.PI / 180, x = cx + Math.cos(a) * 1.18, z = cz + Math.sin(a) * 1.18;
    return {x, z, heading: face(x, z, cx, cz), y: SEAT_HEIGHT.booth, kind: 'booth'};
  });
}
// 리빙룸: 뒤쪽 3인 소파 + 앞쪽 라운지 체어 2 + 바깥쪽 체어 1, 가운데 커피 테이블
function lounge6Seats(cx, cz, side) {
  const s = [-.72, 0, .72].map(dx => ({x: cx + dx, z: cz - 1.08, heading: 0, y: SEAT_HEIGHT.sofa, kind: 'sofa'}));
  for (const [x, z] of [[cx - 1.05, cz + 1.1], [cx + 1.05, cz + 1.1], [cx + side * 1.62, cz + .05]]) s.push({x, z, heading: face(x, z, cx, cz), y: SEAT_HEIGHT.lounge, kind: 'leather'});
  return s;
}
export const COUNTER = {x: 7.45, z: 7.65, len: 4.2};
function counterSeats() { return [-1.75, -1.05, -.35, .35, 1.05, 1.75].map(dz => ({x: COUNTER.x - .78, z: COUNTER.z + dz, heading: Math.PI / 2, y: SEAT_HEIGHT.stool, kind: 'stool'})); }
const emptyTable = {memberSeats: [], colors: [], members: [], species: [], furs: [], demoResponse: 'accept', opener: '', open: true};
export const TABLES = [
  {id: 'table5', number: 1, type: 'ring', title: 'JAY의 바 · 자유석', tag: '방장 없이 누구나 바로 · 6인 원형 바', x: RING.x, z: RING.z,
    approach: {x: -1.25, z: RING.z + 2.8}, seats: ringSeats(), memberSeats: [], freeOrder: [2, 3, 1, 4, 0, 5],
    colors: [], members: [], species: [], furs: [], demoResponse: 'accept', opener: 'JAY: 오늘 기분을 술 한 잔으로 표현하면, 뭐예요?'},
  ...BOOTHS.map((b, i) => ({id: i ? 'boothR' : 'boothL', number: 2 + i, type: 'booth6', title: '빈 부스', tag: b.style === 'green' ? '딥 그린 벨벳 부스 · 6인' : '러스트 벨벳 부스 · 6인', style: b.style, x: b.x, z: b.z,
    approach: {x: b.x + (i ? -2.05 : 2.05), z: b.z + 1.35}, seats: booth6Seats(b.x, b.z), freeOrder: [2, 3, 1, 4, 0, 5], rug: '#cfc6b8', ...emptyTable})),
  ...LOUNGES.map((l, i) => ({id: i ? 'loungeR' : 'loungeL', number: 4 + i, type: 'lounge', side: l.side, title: '빈 라운지', tag: l.style === 'green' ? '서재 라운지 · 6인' : '리빙룸 소파 · 6인', style: l.style, x: l.x, z: l.z,
    approach: {x: l.x - l.side * 2.2, z: l.z + .2}, seats: lounge6Seats(l.x, l.z, l.side), freeOrder: [1, 0, 2, 3, 4, 5], ...emptyTable})),
  {id: 'bar1', number: 6, type: 'bar', title: '빈 바 테이블', tag: '마주 보는 바 테이블 · 6인', x: -4.6, z: 7.3,
    approach: {x: -2.35, z: 7.3}, seats: barSeats(-4.6, 7.3), freeOrder: [0, 3, 1, 4, 2, 5], ...emptyTable},
  // 오른쪽 앞: 벽을 따라 빛나는 앰버 카운터 바(나란히 6석)
  {id: 'bar2', number: 7, type: 'counter', title: '빈 카운터', tag: '앰버 카운터 바 · 6인', x: COUNTER.x, z: COUNTER.z,
    approach: {x: 5.3, z: COUNTER.z}, seats: counterSeats(), freeOrder: [2, 3, 1, 4, 0, 5], ...emptyTable},
  // 2층 AFTER DRINK 존(2인)
  {id: 'after1', number: 8, type: 'after', level: 2, title: '2차 대화', tag: 'AFTER DRINK · 2인', x: -4.0, z: -6.75,
    approach: {x: -4.0, z: -5.45}, seats: afterSeats(-4.0, -6.75), memberSeats: [0, 1], freeOrder: [],
    colors: ['#a7b98a', '#d38b5d'], members: ['IAN', 'SEO'], species: ['dog', 'cat'], furs: ['#d9a066', '#f6d2a2'], demoResponse: 'accept',
    opener: '아까 테이블에서 못 다 한 얘기, 이어서 해요.'},
  {id: 'after2', number: 9, type: 'after', level: 2, title: '2차 대화', tag: 'AFTER DRINK · 2인', x: .8, z: -6.75,
    approach: {x: .8, z: -5.45}, seats: afterSeats(.8, -6.75), memberSeats: [0, 1], freeOrder: [],
    colors: ['#9daccc', '#ca858d'], members: ['HARU', 'ELLA'], species: ['bear', 'rabbit'], furs: ['#c08a5c', '#fbf3ea'], demoResponse: 'accept',
    opener: '오늘 제일 웃겼던 순간 하나만.'},
  {id: 'after3', number: 10, type: 'after', level: 2, open: true, title: '빈 2인석', tag: '먼저 앉으면 방장 · AFTER 2인', x: 5.2, z: -6.75,
    approach: {x: 5.2, z: -5.45}, seats: afterSeats(5.2, -6.75), memberSeats: [], freeOrder: [0, 1],
    colors: [], members: [], species: [], furs: [], demoResponse: 'accept', opener: ''}
];

// 빈 테이블에서 방장이 고를 수 있는 판(주제)
export const OPEN_TOPICS = [
  ['그냥 수다', '오늘 하루, 한 문장으로 요약하면?'],
  ['연애관 토크', '연애할 때 절대 양보 못 하는 거 하나는?'],
  ['창업 vs 직장', '돈 많이 벌고 주 1일 휴무 vs 적당히 벌고 주 4일, 뭐 골라요?'],
  ['여행 썰', '다시 가고 싶은 여행지 한 곳만!'],
  ['네트워킹', '요즘 하는 일, 30초로 소개하면?']
];

// 이동 장애물(내비게이션). 원: [x, z, r] · 사각형: {minX, maxX, minZ, maxZ}
// v2.0: 실제 가구 크기에 맞춘 이동 장애물
export const OBSTACLES = {
  circles: [
    [RING.x, RING.z, 2.38],                                          // 원형 바 + 스툴
    ...BOOTHS.map(b => [b.x, b.z - .15, 1.7]),                       // 부스(뒤쪽 반원 + 테이블)
    ...LOUNGES.flatMap(l => [[l.x - 1.05, l.z + 1.1, .42], [l.x + 1.05, l.z + 1.1, .42], [l.x + l.side * 1.62, l.z + .05, .42]]), // 라운지 체어
    [-7.9, -6.4, .45], [7.9, -6.4, .45], [-8.0, 10.4, .4], [8.0, 10.4, .4], // 모서리 화분
    [7.8, -.2, .45], [-7.8, 5.6, .4], [3.3, 9.75, .35],               // 벽 쪽 나무 · 좌대
    [-3.6, 5.0, .3], [3.6, 5.0, .3],                                 // 플로어 램프
    ...LOUNGES.map(l => [l.x - l.side * 1.62, l.z - 1.17, .32]),     // 노란 사이드 테이블
    ...LOUNGES.map(l => [l.x + l.side * 1.75, l.z - 1.45, .3]),      // 아크 램프 받침
    [-2.9, -5.4, .42], [2.9, -5.4, .42],                             // 트라이포드 램프
    [-2.0, 9.55, .55],                                               // 하이엔드 스피커
    [7.6, -4.6, .5], [-6.9, -5.6, .45], [7.7, -2.0, .45], [-7.75, 8.6, .35] // 야자 · 이젤 · 좌대
  ],
  rects: [
    ...LOUNGES.map(l => ({minX: l.x - 1.38, maxX: l.x + 1.38, minZ: l.z - 1.6, maxZ: l.z - .62})), // 소파
    ...LOUNGES.map(l => ({minX: l.x - .9, maxX: l.x + .9, minZ: l.z - .12, maxZ: l.z + .82})),     // 커피 테이블
    {minX: -7.65, maxX: -5.55, minZ: -7.5, maxZ: -6.95}, {minX: 5.55, maxX: 7.65, minZ: -7.5, maxZ: -6.95}, // 뒤 모서리 크롬 선반
    {minX: -6.3, maxX: -2.9, minZ: 6.25, maxZ: 8.35},   // 바 테이블 1 + 스툴
    {minX: COUNTER.x - 1.05, maxX: 8.5, minZ: COUNTER.z - COUNTER.len / 2 - .1, maxZ: COUNTER.z + COUNTER.len / 2 + .1}, // 앰버 카운터 + 스툴
    {minX: -8.5, maxX: -7.25, minZ: -5.2, maxZ: -1.3}   // 계단
  ]
};
// 2층 장애물
export const OBSTACLES_UPPER = {
  circles: [[-4.0, -6.75, .95], [.8, -6.75, .95], [5.2, -6.75, .95], [-1.7, -6.9, .4], [3.0, -6.9, .4]],
  rects: [{minX: 4.65, maxX: 8.2, minZ: -7.5, maxZ: -7.08}] // 2층 오른쪽 병 선반
};

// 테스트판: 예시 주민(NPC) 없이 실제 접속한 사람만. 모든 테이블이 빈 판이 되고, 먼저 앉는 사람이 방장이다.
export const NO_NPC = true;
if (NO_NPC) for (const t of TABLES) {
  t.members = []; t.memberSeats = []; t.colors = []; t.species = []; t.furs = [];
  t.freeOrder = t.seats.map((_, i) => i); t.open = true; t.demoResponse = 'accept';
  t.title = t.type === 'after' ? '빈 2인석' : t.type === 'bar' ? '빈 바 테이블' : t.type === 'counter' ? '빈 카운터' : t.type === 'booth6' ? '빈 부스' : t.type === 'lounge' ? '빈 라운지' : '빈 테이블'; t.opener = '';
  // 가운데 링 바는 방장 없는 자유석: 누구나 바로 앉고, JAY가 첫 질문을 던진다
  if (t.type === 'ring') { t.freeOrder = [2, 3, 1, 4, 0, 5]; t.free = true; t.open = false; t.title = 'JAY의 바 · 자유석'; t.tag = '방장 없이 누구나 바로 · 6인 링 바'; t.opener = 'JAY: 오늘 기분을 술 한 잔으로 표현하면, 뭐예요?'; }
}

export const SPOTS = [
  {id: 'host', title: 'HOST JAY', x: 1.05, z: -1.05, kind: 'host'},
  {id: 'exit', title: '입구', x: ENTRY.x, z: DOOR_Z + .2, kind: 'exit'},
  {id: 'stairs', title: '계단 · 2층', x: STAIRS.ground.x, z: STAIRS.ground.z, kind: 'stairs'},
  {id: 'stairsDown', title: '계단 · 1층', x: STAIRS.upper.x, z: STAIRS.upper.z, kind: 'stairs', level: 2},
  ...TABLES.map(t => ({id: t.id, title: t.title, x: t.approach.x, z: t.approach.z, kind: 'table', level: t.level ?? 1}))
];

// mood: talk(대화 환영) · look(구경만) · rest(혼자 쉬는 중)
export const WANDERERS = [
  {id: 'nari', name: 'NARI', color: '#dc987b', species: 'rabbit', fur: '#fff7ee', x: 0, z: 2.5, mood: 'talk',
    topic: '이 공간 처음이에요. 같이 한 바퀴 둘러볼까요?',
    route: [{x: 0, z: .2}, {x: 3.2, z: -.6}, {x: 3.4, z: 4.6}, {x: -1, z: 4.8}]},
  {id: 'jun', name: 'JUN', color: '#81b8c2', species: 'dog', fur: '#d9a066', x: 3.4, z: -1.2, mood: 'look',
    topic: '오늘은 구경하면서 좋은 영화 얘기 들으러 왔어요.',
    route: [{x: 3.3, z: -1.4}, {x: 7.6, z: -1.5}, {x: 6.8, z: 4.6}, {x: 1.5, z: 4.4}]},
  {id: 'hae', name: 'HAE', color: '#c7a1cf', species: 'cat', fur: '#9e98a6', x: -6.6, z: -1.2, mood: 'rest',
    topic: '저는 오늘 천천히 쉬었다 가려고요.',
    route: [{x: -6.9, z: -.7}, {x: -1.4, z: -.6}, {x: -1.4, z: 3.2}, {x: -5.8, z: 6.5}]}
];

// 혼술 코너의 가죽 라운지 체어에 앉아 혼자 쉬는 예시 주민.
export const LOUNGERS = [
  {id: 'yun', name: 'YUN', color: '#9fb6d8', species: 'panda', fur: '#fbfbf6', x: -7.55, z: 4.2, heading: Math.PI / 2 + .35, mood: 'rest',
    topic: '오늘은 혼자 한잔하는 날이에요.', y: SEAT_HEIGHT.lounge}
];

// 오늘의 상태(게임처럼). id는 그대로 두고 이름만 바꿨다.
export const MOODS = {
  talk: {label: '놀자', short: '놀자', hint: '합석 요청과 인사를 받아요'},
  look: {label: '천천히', short: '천천히', hint: '인사는 받고, 합석은 내가 원할 때만'},
  rest: {label: '혼술 중', short: '혼술 중', hint: '인사와 초대를 받지 않아요'}
};

export const JACKETS = [
  {id: 'lime', name: '라임', color: '#cddc83'},
  {id: 'plum', name: '자두', color: '#b98bc9'},
  {id: 'sky', name: '하늘', color: '#8fc0d8'},
  {id: 'coral', name: '코랄', color: '#ff9b84'},
  {id: 'navy', name: '네이비', color: '#3d4a73'},
  {id: 'mustard', name: '머스터드', color: '#e3b23c'},
  {id: 'mint', name: '민트', color: '#9ed9c4'},
  {id: 'black', name: '블랙', color: '#2b2a2f'},
  {id: 'hanbok', name: '한복 연분홍', color: '#f4b6c8'},
  {id: 'denim', name: '데님', color: '#5f7fa8'}
];

export const ACCESSORIES = [
  {id: 'none', name: '없음'},
  {id: 'beret', name: '베레모'},
  {id: 'shades', name: '선글라스'},
  {id: 'ribbon', name: '리본'}
];

// glass: 미니미 손에 들리는 잔 모양
export const DRINKS = [
  {id: 'highball', name: '하이볼', price: 15000, color: '#e0a640', note: '위스키 · 탄산', glass: 'tall'},
  {id: 'negroni', name: '네그로니', price: 18000, color: '#c2362c', note: '진 · 캄파리', glass: 'coupe'},
  {id: 'wine', name: '레드 와인', price: 13000, color: '#8e2338', note: '글라스', glass: 'wine'},
  {id: 'soda', name: '라임 소다', price: 8000, color: '#b9d37e', note: '무알코올', glass: 'tall'},
  {id: 'whisky', name: '오늘의 싱글몰트', price: 19000, color: '#b8742f', note: '니트 30ml', glass: 'rocks', soldOut: true},
  {id: 'mojito', name: '모히토', price: 15000, color: '#bfe39a', note: '럼 · 민트 · 라임', glass: 'tall'},
  {id: 'margarita', name: '마가리타', price: 16000, color: '#e9e48a', note: '데킬라 · 라임 · 소금', glass: 'coupe'},
  {id: 'gintonic', name: '진토닉', price: 14000, color: '#dcefe9', note: '진 · 토닉 · 레몬', glass: 'tall'},
  {id: 'oldfashioned', name: '올드패션드', price: 18000, color: '#c47a2c', note: '버번 · 비터스', glass: 'rocks'},
  {id: 'espresso', name: '에스프레소 마티니', price: 17000, color: '#4a2c1e', note: '보드카 · 커피', glass: 'coupe'},
  {id: 'kahlua', name: '깔루아 밀크', price: 13000, color: '#c9a27c', note: '커피 리큐어 · 우유', glass: 'rocks'},
  {id: 'sangria', name: '상그리아', price: 14000, color: '#a9283e', note: '와인 · 과일', glass: 'wine'},
  {id: 'yuzu', name: '유자 막걸리', price: 12000, color: '#f3e3a4', note: '막걸리 · 유자청', glass: 'rocks'},
  {id: 'omija', name: '오미자 하이볼', price: 14000, color: '#e04f63', note: '오미자 · 위스키 · 탄산', glass: 'tall'},
  {id: 'soju', name: '자몽 소주 칵테일', price: 11000, color: '#f7a99a', note: '소주 · 자몽', glass: 'tall'},
  {id: 'somaek', name: '소맥 한 잔', price: 9000, color: '#f2c14e', note: '소주 · 맥주 · 황금비율', glass: 'tall'},
  {id: 'omijaade', name: '오미자 에이드', price: 8000, color: '#f07a8a', note: '무알코올', glass: 'tall'},
  {id: 'virgin', name: '버진 모히토', price: 8000, color: '#d6f0b4', note: '무알코올', glass: 'tall'}
];
export const DRINK_MINUTES = 3; // 체험: 한 잔을 이만큼 들고 있다가 다 마신다

// 주민 카드에 보이는 취향(사진·나이 대신 미니미와 취향만 보여준다)
export const PROFILE_TAGS = {
  MOMO: ['칵테일 입문', '새로운 사람 좋아요'], TAE: ['위스키', '조용한 대화'], HANA: ['여행 얘기', '웃음 많음'], RAY: ['재즈', '창업 중'],
  MOON: ['새로운 사람 좋아요', '음악 얘기'], MIMI: ['패션', '딥토크'], JUNE: ['책', '천천히 친해져요'],
  LILY: ['플레이리스트 공유', 'K-인디'], BO: ['힙합', '맥주'], WOO: ['피아노', '아이돌 덕질'], LEO: ['LP 수집', '밤 산책'],
  SOL: ['퇴사 준비 중', '사이드 프로젝트'], ROO: ['커리어 고민', '러닝'], KIM: ['개발자', '보드게임'],
  SORA: ['영화광', '팝콘은 카라멜'], DAN: ['다큐멘터리', '리뷰 쓰기'],
  NARI: ['처음 왔어요', '새로운 사람 좋아요'], JUN: ['영화', '구경 좋아함'], HAE: ['혼술', '조용한 밤'], YUN: ['혼술', '책 한 권']
};

// 주민 프로필: 이름표에는 닉네임·성별만, 누르면 나이·직업·MBTI.
// praise: 받은 칭찬 수(본인만 보는 값, 화면에 공개하지 않음) · pet: 단골의 상징 · visits: 방문 횟수
export const PEOPLE = {
  MOMO: {gender: 'F', age: 27, job: '바리스타', mbti: 'ENFP', praise: 12, visits: 4},
  TAE: {gender: 'M', title: 'JAY가 믿고 맡기는', age: 33, job: '건축가', mbti: 'ISTJ', praise: 48, visits: 21, pet: {species: 'dog', fur: '#e8bd85'}},
  HANA: {gender: 'F', title: '말보다 귀가 따뜻한', age: 29, job: '여행 작가', mbti: 'ENFJ', praise: 31, visits: 9},
  RAY: {gender: 'M', age: 31, job: '스타트업 대표', mbti: 'ENTP', praise: 22, visits: 6},
  MOON: {gender: 'M', age: 28, job: '음악 프로듀서', mbti: 'INFP', praise: 9, visits: 3},
  MIMI: {gender: 'F', age: 28, job: '패션 MD', mbti: 'ESFP', praise: 17, visits: 5},
  JUNE: {gender: 'F', age: 25, job: '대학원생', mbti: 'INTJ', praise: 4, visits: 1},
  LILY: {gender: 'F', title: '낯선 사이를 녹이는', age: 30, job: '라디오 PD', mbti: 'ENFP', praise: 36, visits: 15, pet: {species: 'cat', fur: '#f2b675'}},
  BO: {gender: 'M', age: 32, job: '사운드 엔지니어', mbti: 'ISFP', praise: 14, visits: 7},
  WOO: {gender: 'M', age: 26, job: '피아노 강사', mbti: 'INFJ', praise: 8, visits: 2},
  LEO: {gender: 'M', age: 34, job: 'LP숍 사장', mbti: 'ESTP', praise: 27, visits: 11},
  SOL: {gender: 'F', age: 31, job: '마케터', mbti: 'ENTJ', praise: 19, visits: 6},
  ROO: {gender: 'M', age: 30, job: '회계사', mbti: 'ISTP', praise: 6, visits: 2},
  KIM: {gender: 'M', age: 29, job: '개발자', mbti: 'INTP', praise: 11, visits: 4},
  SORA: {gender: 'F', age: 27, job: '영상 편집자', mbti: 'ISFJ', praise: 15, visits: 5},
  DAN: {gender: 'M', title: '엔딩 크레딧까지 남는', age: 35, job: '다큐 감독', mbti: 'INTJ', praise: 33, visits: 13, pet: {species: 'hamster', fur: '#f3c48e'}},
  NARI: {gender: 'F', age: 26, job: '간호사', mbti: 'ESFJ', praise: 2, visits: 1},
  JUN: {gender: 'M', age: 28, job: '영화 마케터', mbti: 'INFP', praise: 7, visits: 3},
  HAE: {gender: 'F', age: 32, job: '일러스트레이터', mbti: 'ISFP', praise: 10, visits: 8},
  YUN: {gender: 'M', title: '자기 자리가 있는', age: 36, job: '변호사', mbti: 'INTJ', praise: 5, visits: 18, pet: {species: 'cat', fur: '#3b3640'}},
  IAN: {gender: 'M', age: 30, job: 'UX 디자이너', mbti: 'ENFP', praise: 24, visits: 7},
  SEO: {gender: 'F', age: 29, job: '약사', mbti: 'ISTJ', praise: 13, visits: 4},
  HARU: {gender: 'M', age: 27, job: '요리사', mbti: 'ESFP', praise: 18, visits: 5},
  ELLA: {gender: 'F', age: 30, job: '번역가', mbti: 'INFJ', praise: 29, visits: 9}
};
// 칭찬은 퇴장한 뒤에만(마을 규칙). 같은 테이블에서 실제로 만난 사람에게만.
export const PRAISE_TAGS = ['잘 들어줬어요', '편안했어요', '새로운 생각을 얻었어요', '배려가 좋았어요', '좋은 질문이었어요'];

// 코인: 음료(칵테일·논알코올 포함)를 주문하면 충전된다. 현금 충전은 없고 꾸미기 전용.
export const COIN_RULES = {drink: 100};
// 데모 스탬프: 주문 1건당 1개(한 번에 여러 잔을 시켜도 1개), 5개면 무료 한 잔 쿠폰.
export const STAMP_GOAL = 5;
export const SHOP = [
  {id: 'jacket-plum', icon: '🧥', kind: 'jacket', value: 'plum', name: '자두 재킷', price: 150},
  {id: 'jacket-sky', icon: '🧥', kind: 'jacket', value: 'sky', name: '하늘 재킷', price: 150},
  {id: 'jacket-coral', icon: '🧥', kind: 'jacket', value: 'coral', name: '코랄 재킷', price: 150},
  {id: 'jacket-navy', icon: '🧥', kind: 'jacket', value: 'navy', name: '네이비 재킷', price: 200},
  {id: 'jacket-mustard', icon: '🧥', kind: 'jacket', value: 'mustard', name: '머스터드 재킷', price: 200},
  {id: 'jacket-mint', icon: '🧥', kind: 'jacket', value: 'mint', name: '민트 재킷', price: 200},
  {id: 'jacket-black', icon: '🧥', kind: 'jacket', value: 'black', name: '블랙 재킷', price: 250},
  {id: 'jacket-denim', icon: '🧥', kind: 'jacket', value: 'denim', name: '데님 재킷', price: 250},
  {id: 'jacket-hanbok', icon: '🧥', kind: 'jacket', value: 'hanbok', name: '한복 저고리 색', price: 400},
  {id: 'acc-ribbon', icon: '🎀', kind: 'accessory', value: 'ribbon', name: '리본', price: 200},
  {id: 'acc-shades', icon: '🕶️', kind: 'accessory', value: 'shades', name: '선글라스', price: 250},
  {id: 'acc-beret', icon: '🎨', kind: 'accessory', value: 'beret', name: '베레모', price: 300},
  {id: 'acc-tophat', icon: '🎩', kind: 'accessory', value: 'tophat', name: '실크햇', price: 400},
  {id: 'acc-bucket', icon: '👒', kind: 'accessory', value: 'bucket', name: '버킷햇', price: 250},
  {id: 'acc-party', icon: '🥳', kind: 'accessory', value: 'party', name: '파티 고깔', price: 200},
  {id: 'acc-chef', icon: '🍳', kind: 'accessory', value: 'chef', name: '셰프 모자', price: 300},
  {id: 'acc-flowercrown', icon: '🌸', kind: 'accessory', value: 'flowercrown', name: '꽃 화관', price: 350},
  {id: 'acc-bandana', icon: '🧣', kind: 'accessory', value: 'bandana', name: '반다나', price: 200},
  {id: 'acc-bowtie', icon: '🎗️', kind: 'accessory', value: 'bowtie', name: '나비넥타이', price: 200},
  {id: 'acc-heartglasses', icon: '💖', kind: 'accessory', value: 'heartglasses', name: '하트 안경', price: 300},
  {id: 'acc-mask', icon: '🎭', kind: 'accessory', value: 'mask', name: '가면무도회 가면', price: 350},
  {id: 'acc-starpin', icon: '⭐', kind: 'accessory', value: 'starpin', name: '별 머리핀', price: 150},
  {id: 'acc-earmuff', icon: '🎧', kind: 'accessory', value: 'earmuff', name: '귀마개', price: 250},
  {id: 'acc-sakura', icon: '💮', kind: 'accessory', value: 'sakura', name: '벚꽃 핀', price: 150},
  // v2.2 머리 장식(예전엔 무료) — 이제 상점에서 사서 가방에서 착용
  {id: 'extra-gat', icon: '🏮', kind: 'extra', value: 'gat', name: '갓', price: 400},
  {id: 'extra-cap', icon: '🧢', kind: 'extra', value: 'cap', name: '야구모자', price: 150},
  {id: 'extra-beanie', icon: '🧶', kind: 'extra', value: 'beanie', name: '비니', price: 150},
  {id: 'extra-headband', icon: '🎀', kind: 'extra', value: 'headband', name: '머리띠', price: 120},
  {id: 'extra-glasses', icon: '👓', kind: 'extra', value: 'glasses', name: '동그란 안경', price: 180},
  {id: 'extra-headset', icon: '🎧', kind: 'extra', value: 'headset', name: '헤드셋', price: 250},
  {id: 'extra-scarf', icon: '🧣', kind: 'extra', value: 'scarf', name: '목도리', price: 180},
  {id: 'extra-halo', icon: '😇', kind: 'extra', value: 'halo', name: '천사 링', price: 450},
  {id: 'extra-devil', icon: '😈', kind: 'extra', value: 'devil', name: '작은 뿔', price: 350},
  {id: 'extra-crown', icon: '👑', kind: 'extra', value: 'crown', name: '왕관', price: 600},
  {id: 'extra-flower', icon: '🌼', kind: 'extra', value: 'flower', name: '꽃', price: 120},
  {id: 'extra-unicorn', icon: '🦄', kind: 'extra', value: 'unicorn', name: '유니콘 뿔', price: 500},
  {id: 'extra-wings', icon: '🪽', kind: 'extra', value: 'wings', name: '날개', price: 700},
  {id: 'extra-batwings', icon: '🦇', kind: 'extra', value: 'batwings', name: '박쥐 날개', price: 600},
  // v1.9 펫: 네 발로 기어다니는 꼬마 동물 다섯
  {id: 'pet-puppy', icon: '🐶', kind: 'pet', value: 'puppy', fur: '#e8bd85', name: '아기 강아지', price: 800},
  {id: 'pet-kitty', icon: '🐱', kind: 'pet', value: 'kitty', fur: '#f2b675', name: '아기 고양이', price: 800},
  {id: 'pet-bunny', icon: '🐰', kind: 'pet', value: 'bunny', fur: '#fbf3ea', name: '아기 토끼', price: 900},
  {id: 'pet-piglet', icon: '🐷', kind: 'pet', value: 'piglet', fur: '#f6b6b0', name: '아기 돼지', price: 900},
  {id: 'pet-hedgehog', icon: '🦔', kind: 'pet', value: 'hedgehog', fur: '#c9a27c', name: '아기 고슴도치', price: 1000}
];
// 테스트판: 코인 무한(사도 줄지 않음) · 펫 방문일 잠금 해제
export const TEST_MODE = {infiniteCoins: true, petsOpen: true};
export const DEMO_WALLET = {coins: 1000, visits: 0}; // 테스트판: 시작 코인 1,000

// 마을 규칙(첫 방문 때 한 번 확인)
export const VILLAGE_RULES = ['오늘은 이름과 이야기만으로 충분해요.', '현장에서는 연락처를 묻거나 친구 신청·칭찬을 부탁하지 않아요.', '다시 만나고 싶은 마음은, 퇴장한 뒤 전해주세요.'];

// 선택형 감정 말풍선(채팅 없음). 집계하지 않는다.
export const EMOTES = [
  {id: 'laugh', icon: '😂', label: '빵 터짐', text: 'ㅋㅋㅋㅋ', bg: '#fff3c4'},
  {id: 'agree', icon: '✨', label: '공감', text: '내 말이!', bg: '#e2f6d5'},
  {id: 'clap', icon: '👏', label: '박수', text: '짝짝짝', bg: '#ffffff'},
  {id: 'cheers', icon: '🥂', label: '짠', text: '짠!', bg: '#ffe7c4'},
  {id: 'wave', icon: '🙌', label: '반가워요', text: '반가워요!', bg: '#ffdbe8'},
  {id: 'rest', icon: '☕', label: '잠깐 쉬는 중', text: '잠깐 쉬어요', bg: '#d9cff7'}
];

// 칭호: 이름 앞에 붙는다. 조건 횟수는 조정 가능한 초안.
export const TITLES = [
  {id: 'arrived', name: '마을에 막 도착한', how: '첫 체크인'},
  {id: 'firstnight', name: '첫 번째 밤을 함께한', how: '오픈 기간에 방문(체험판 참여자)'},
  {id: 'nonalc', name: '한 잔보다 이야기가 좋았던', how: '논알코올 음료로 판에 참여'},
  {id: 'jay', name: 'JAY가 믿고 맡기는', how: '체험 조건: 방장으로 합석 요청을 수락 · 실제 호스트 인정 기능은 아직 없어요'},
  {id: 'credits', name: '엔딩 크레딧까지 남는', how: '영화 이야기 판에 5번 참여(방문당 1번)', goal: 5, key: 'movieVisits'},
  {id: 'regular', name: '자기 자리가 있는', how: '서로 다른 10일 방문(한국 날짜 기준)', goal: 10, key: 'visitDays'},
  {id: 'listener', name: '말보다 귀가 따뜻한', how: '‘잘 들어줬어요’ 칭찬 20회', goal: 20, key: 'praise:잘 들어줬어요'},
  {id: 'loved', name: '모든 이가 좋아하는', how: '칭찬 100회', goal: 100, key: 'praiseTotal'},
  {id: 'weekend', name: '주말을 여기 두고 간', how: '같은 주 금·토·일 세 날 모두 방문'}
];

// 판 타이머: 남은 시간이 끝나면 새로운 판(주제)이 열린다. 첫 값은 체험용으로 짧게 둔다.
export const ROUND_MINUTES = {table5: 6, table1: 3, table4: 14, table3: 9, table2: 22, table6: 25, after1: 18, after2: 11, after3: 25};
export const NEXT_TOPICS = {
  table5: [['한 달 휴가 vs 연봉 20%', 'JAY: 지금 당장 둘 중 하나 고르면, 뭐예요?'], ['인생 술 한 잔', 'JAY: 마셔본 술 중 아직도 생각나는 한 잔은요?']],
  table1: [['30대에 다시 시작한다면', '지금 나이로 딱 하나 다시 배운다면 뭘 배울래요?'], ['돈 vs 시간', '주 4일 적당히 vs 주 6일 많이, 뭐가 더 끌려요?']],
  table4: [['요즘 꽂힌 노래', '요즘 하루에 세 번 이상 듣는 노래 있어요?']],
  table3: [['첫 월급 썰', '첫 월급으로 뭐 했는지 기억나요?']],
  table2: [['인생 드라마', '정주행을 세 번 이상 한 드라마가 있나요?']],
  after1: [['2차 대화', '오늘 처음 만난 사람 중 기억에 남는 한 마디는?']],
  after2: [['2차 대화', '다음에 또 온다면 누구랑 오고 싶어요?']]
};

// 매장 밖에서 보는 오늘의 마을들. 숫자와 분위기만 보여주고 사람·미니미는 체크인해야 보인다.
// 성수 외 지점은 화면 예시다.
export const VILLAGES = [
  {id: 'seongsu', name: '성수', open: true, stay: '1h 20m', vibe: '좋아요'},
  {id: 'hannam', name: '한남', open: false, live: 29, solo: 11, friends: 18, tables: 5, stay: '1h 42m', vibe: '북적'},
  {id: 'cheongdam', name: '청담', open: false, live: 18, solo: 7, friends: 11, tables: 3, stay: '1h 05m', vibe: '여유'}
];

if (NO_NPC) { WANDERERS.length = 0; LOUNGERS.length = 0; }
export const RESIDENT_COUNT = TABLES.reduce((n, t) => n + t.members.length, 0) + WANDERERS.length + LOUNGERS.length + 1;

// ── 캐릭터 꾸미기(오리지널 디자인) ─────────────────────
export const CHAR_SPECIES = [
  ['fox', '여우', '🦊'], ['cat', '고양이', '🐱'], ['rabbit', '토끼', '🐰'], ['dog', '강아지', '🐶'], ['bear', '곰', '🐻'], ['panda', '판다', '🐼'], ['hamster', '햄스터', '🐹'],
  ['tiger', '호랑이', '🐯'], ['sheep', '양', '🐑'], ['koala', '코알라', '🐨'], ['raccoon', '너구리', '🦝'], ['mouse', '생쥐', '🐭'],
  ['dragon', '꼬마 용', '🐲'], ['dokkaebi', '꼬마 도깨비', '👹'], ['robot', '로봇', '🤖'], ['ghost', '유령', '👻'], ['alien', '외계인', '👽'], ['frog', '개구리', '🐸'], ['penguin', '펭귄', '🐧']
];
export const BASIC_SPECIES = ['fox', 'cat', 'rabbit', 'dog', 'bear', 'hamster']; // 첫 입장에서 고르는 기본 외형
export const CHAR_FURS = ['#f08a3c', '#f2b675', '#fbf3ea', '#8a8290', '#2f2b30', '#9ad3b5', '#a9b8f0', '#f5a3c0', '#cfe86b', '#7fc8e8', '#c9a2e8', '#e8584a'];
export const CHAR_EXTRAS = [['none', '없음'], ['gat', '갓'], ['cap', '야구모자'], ['beanie', '비니'], ['headband', '머리띠'], ['glasses', '동그란 안경'], ['headset', '헤드셋'], ['scarf', '목도리'], ['halo', '천사 링'], ['devil', '작은 뿔'], ['crown', '왕관'], ['flower', '꽃'], ['unicorn', '유니콘 뿔'], ['wings', '날개'], ['batwings', '박쥐 날개']];
export const CHAR_DEFAULT = {species: 'fox', fur: '#f08a3c', extra: 'none'};
export const SPECIES_FUR = {tiger: '#f2a03c', sheep: '#f6f1e6', koala: '#a9a6ad', raccoon: '#8a7a6c', mouse: '#c9bdb4', dokkaebi: '#e8735a', fox: '#f08a3c', cat: '#f2b675', rabbit: '#fbf3ea', dog: '#e8bd85', bear: '#c08a5c', panda: '#fbfbf6', hamster: '#f3c48e', dragon: '#7fc99a', robot: '#a9b8c8', ghost: '#f6f2ff', alien: '#b8e86b', frog: '#8fcf6a', penguin: '#2f2b30'};

// ── 술게임 ─────────────────────────────────────────────
export const PENALTIES = ['원샷!', '반 잔', '러브샷', '다같이 짠', '왼쪽 사람이 마시기', '오른쪽 사람이 마시기', '벌칙 면제 🎉', '안주 한 입'];
// 사다리·룰렛에서 아이콘으로 골라 넣는 벌칙
export const PENALTY_ICONS = [
  ['🍺', '원샷'], ['🥃', '반 잔'], ['💕', '러브샷'], ['🥂', '다같이 짠'], ['🎤', '노래 한 소절'], ['💃', '댄스 10초'],
  ['🤳', '단체 셀카'], ['🍢', '안주 쏘기'], ['🙊', '비밀 하나'], ['🫡', '건배사'], ['💧', '물 한 잔'], ['🎉', '면제']
];
