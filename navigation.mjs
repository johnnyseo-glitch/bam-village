// 밤마을 — 가구를 피해 걷는 격자 경로 찾기(1층·2층 따로) + 계단으로 층 잇기.
import {ROOM, OBSTACLES, OBSTACLES_UPPER, MEZZ, MEZZ_Y, STAIRS} from './map-data.mjs?v=1791364165';

export const STEP = .25;

function createNav(bounds, {circles, rects}) {
  function valid(x, z) {
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
    for (const r of rects) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return false;
    for (const [cx, cz, r] of circles) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    return true;
  }
  const cells = [], lookup = new Map();
  const jMax = Math.floor((bounds.maxZ + 6.75) / STEP);
  for (let i = 0; i <= 66; i++) for (let j = 0; j <= jMax; j++) {
    const x = -8.25 + i * STEP, z = -6.75 + j * STEP;
    if (valid(x, z)) { const c = {i, j, x, z, key: i + ',' + j}; cells.push(c); lookup.set(c.key, c); }
  }
  function nearest(x, z) {
    let best = cells[0], dist = Infinity;
    for (const c of cells) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < dist) { best = c; dist = d; } }
    return best;
  }
  function lineClear(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .06);
    for (let i = 0; i <= n; i++) { const k = n ? i / n : 0; if (!valid(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; }
    return true;
  }
  function route(from, to) {
    const start = nearest(from.x, from.z), goal = nearest(to.x, to.z);
    const queue = [start], parents = new Map([[start.key, null]]);
    let found = false;
    for (let p = 0; p < queue.length; p++) {
      const c = queue[p];
      if (c.key === goal.key) { found = true; break; }
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = lookup.get((c.i + di) + ',' + (c.j + dj));
        if (!next || parents.has(next.key) || !lineClear(c, next)) continue;
        parents.set(next.key, c.key); queue.push(next);
      }
    }
    if (!found) return [];
    const chain = [];
    for (let c = goal; c; c = lookup.get(parents.get(c.key))) chain.push({x: c.x, z: c.z});
    chain.reverse();
    const result = []; let origin = from, index = 0;
    while (index < chain.length) {
      let furthest = index;
      for (let j = index; j < chain.length; j++) { if (lineClear(origin, chain[j])) furthest = j; else break; }
      result.push(chain[furthest]); origin = chain[furthest]; index = furthest + 1;
    }
    return result;
  }
  return {valid, route};
}

const ground = createNav({minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ}, OBSTACLES);
const upper = createNav(MEZZ.walk, OBSTACLES_UPPER);
export const navs = {1: ground, 2: upper};
export const levelY = level => level === 2 ? MEZZ_Y : 0;

// 1층 경로(기존 코드 호환)
export const valid = ground.valid;
export const route = ground.route;

// 계단 오르내리기 점(y 포함)
function stairPoints(up) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    pts.push({x: STAIRS.x, z: STAIRS.bottomZ + (STAIRS.topZ - STAIRS.bottomZ) * k, y: MEZZ_Y * k, stair: true});
  }
  const list = [{...STAIRS.ground, y: 0}, ...pts, {...STAIRS.upper, y: MEZZ_Y}];
  return up ? list : list.reverse();
}

// 층이 다를 때는 계단을 거쳐 간다. 모든 점에 y가 들어 있다.
export function levelRoute(from, to) {
  const fl = from.level ?? 1, tl = to.level ?? 1;
  const tagY = (pts, l) => pts.map(p => ({...p, y: levelY(l)}));
  if (fl === tl) return tagY(navs[fl].route(from, to), fl);
  const a = fl === 1 ? STAIRS.ground : STAIRS.upper, b = tl === 1 ? STAIRS.ground : STAIRS.upper;
  return [...tagY(navs[fl].route(from, a), fl), ...stairPoints(fl === 1), ...tagY(navs[tl].route(b, to), tl)];
}
