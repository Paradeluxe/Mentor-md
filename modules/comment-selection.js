/**
 * Runtime multi-select state for comment threads (not persisted).
 */
export function createCommentSelection() {
  const selected = new Set();
  return {
    has(id) {
      return selected.has(id);
    },
    toggle(id) {
      if (id == null || id === '') return selected.size;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return selected.size;
    },
    setAll(ids) {
      selected.clear();
      for (const id of ids || []) {
        if (id != null && id !== '') selected.add(id);
      }
      return selected.size;
    },
    clear() {
      selected.clear();
    },
    ids() {
      return [...selected];
    },
    size() {
      return selected.size;
    },
    pruneTo(existingIds) {
      const allow = new Set(existingIds || []);
      for (const id of [...selected]) {
        if (!allow.has(id)) selected.delete(id);
      }
      return selected.size;
    },
  };
}
