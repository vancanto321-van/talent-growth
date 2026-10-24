// Content-derived direction IDs keep progress attached to its criterion after reordering.
const LEVEL_LABELS = ['未开始', '试过了', '练习中', '接近完成', '已完成'];

function directionId(text) {
  let hash = 2166136261;
  const normalized = String(text).trim().replace(/\s+/g, ' ');
  for (let i = 0; i < normalized.length; i++) {
    hash = Math.imul(hash ^ normalized.charCodeAt(i), 16777619) >>> 0;
  }
  return 'd_' + hash.toString(36);
}

function directionsOf(milestone) {
  const m = milestone || {};
  const source = Array.isArray(m.complete) && m.complete.length ? m.complete : (Array.isArray(m.guide) ? m.guide : []);
  const used = {};
  return source.slice(0, 32).filter(text => typeof text === 'string' && text.trim()).map((text, index) => {
    const base = directionId(text);
    const repeat = used[base] || 0;
    used[base] = repeat + 1;
    return { id: base + (repeat ? '_' + repeat : ''), title: text.trim(), index };
  });
}

function normalizeLevels(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  Object.keys(raw).slice(0, 32).forEach(id => {
    const value = raw[id];
    if (/^d_[a-z0-9]+(?:_\d+)?$/.test(id) && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4) result[id] = value;
  });
  return result;
}

function progressOf(milestone, entry) {
  const source = entry || {};
  const levels = normalizeLevels(source.directionLevels);
  const legacy = Array.isArray(source.directions) ? source.directions : [];
  const directions = directionsOf(milestone).map(direction => {
    const level = Object.prototype.hasOwnProperty.call(levels, direction.id) ? levels[direction.id] : (legacy.indexOf(direction.index) >= 0 ? 4 : 0);
    return Object.assign({}, direction, { level, percent: level * 25, label: LEVEL_LABELS[level] });
  });
  const total = directions.length;
  const percent = total ? Math.round(directions.reduce((sum, direction) => sum + direction.percent, 0) / total) : 0;
  return { directions, percent, completed: directions.filter(d => d.level === 4).length, started: directions.filter(d => d.level > 0).length, total };
}

module.exports = { directionsOf, normalizeLevels, progressOf };
