function applyOrder(list, ids) {
  const byId = new Map(list.map(item => [item.id, item]));
  const next = [];
  const seen = new Set();
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(byId.get(id));
  }
  for (const item of list) if (!seen.has(item.id)) next.push(item);
  return next;
}

module.exports = { applyOrder };
