function mergeHooksJson(existing, previousCommandsByEvent, currentHooks) {
  const doc = existing && typeof existing === 'object' ? { ...existing } : {};
  if (typeof doc.version !== 'number') doc.version = 1;
  const hooksObj = { ...(doc.hooks || {}) };
  const priorByEvent = previousCommandsByEvent || {};

  const touchedEvents = new Set([...Object.keys(priorByEvent), ...currentHooks.map((h) => h.event)]);

  for (const event of touchedEvents) {
    const existingArray = Array.isArray(hooksObj[event]) ? hooksObj[event] : [];
    const hasRecordForEvent = Object.prototype.hasOwnProperty.call(priorByEvent, event);
    const previousCommands = new Set(priorByEvent[event] || []);

    const kept = existingArray.filter((entry) => {
      if (!hasRecordForEvent) {
        return !(typeof entry.command === 'string' && entry.command.includes('myrules-'));
      }
      return !previousCommands.has(entry.command);
    });

    const additions = currentHooks
      .filter((h) => h.event === event)
      .map((h) => {
        const entry = { command: h.command };
        if (h.matcher !== undefined) entry.matcher = h.matcher;
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        if (h.failClosed !== undefined) entry.failClosed = h.failClosed;
        return entry;
      });

    const merged = kept.concat(additions);
    if (merged.length) hooksObj[event] = merged;
    else delete hooksObj[event];
  }

  doc.hooks = hooksObj;
  return doc;
}

module.exports = { mergeHooksJson };
