/**
 * fix-mentor supervision mode — lock unprocessed annotation paragraphs while
 * an external agent is rewriting the .mentor package.
 *
 * Sidecar (written by mentor_io): <path.mentor>.supervision.json
 * Server: GET /supervision?path=&token=
 *
 * v1.47.1: currentThreadId + inline "pet" widget + signal-light phase.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const supervisionKey = new PluginKey("mentor-supervision");
export const SUPERVISION_VERSION = 1;
export const SUPERVISION_BYPASS_META = "supervisionBypass";

/** @returns {object} */
export function emptySupervisionState() {
  return {
    version: SUPERVISION_VERSION,
    active: false,
    health: "ok",
    error: "",
    lockMode: "pending-paragraphs",
    pendingThreadIds: [],
    processedThreadIds: [],
    currentThreadId: "",
    phase: "idle", // idle | working | waiting
    message: "",
    tool: "",
    startedAt: "",
    updatedAt: "",
    lockedRanges: [],
    currentRange: null,
    missingThreadIds: [],
    decos: DecorationSet.empty,
  };
}

/**
 * Normalize raw sidecar / API JSON into a stable client state (no decos/ranges).
 *
 * Contract (v1):
 *   - active:    whether supervision is in effect right now
 *   - phase:     "idle" (active=false) | "working" | "waiting" (active=true)
 *                "working" requires a currentThreadId; "waiting" otherwise
 *   - health:    "ok" | "stale" | "degraded" | "missing" | "unsupported" | "unreadable"
 *                ok/stale/degraded require active; missing/unsupported/unreadable
 *                are inactive-only failure signals
 *   - error:     human-readable cause for non-ok health (empty when health=ok)
 *   - currentThreadId: ONLY from explicit sidecar value; never auto-promoted
 *                      from pending (old writers using `working_on` are fine —
 *                      they always set currentThreadId)
 *   - lockMode:  only "document" is honored as explicit; everything else is
 *               "pending-paragraphs". Empty pending alone does NOT force
 *               document lock (downstream materialize handles degraded case)
 *
 * @param {any} raw
 */
export function normalizeSupervisionPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return inactivePayload("missing", "");
  }
  const version = Number(raw.v || SUPERVISION_VERSION);
  if (version !== SUPERVISION_VERSION) {
    return inactivePayload(
      "unsupported",
      `protocol v${raw.v} not supported (expected v${SUPERVISION_VERSION})`
    );
  }

  const active = raw.active === true || raw.active === 1 || raw.active === "true";
  const pendingThreadIds = uniqueStrings(raw.pendingThreadIds || raw.pending || []);
  const processedThreadIds = uniqueStrings(raw.processedThreadIds || raw.processed || []);
  const currentThreadId = active
    ? String(raw.currentThreadId || raw.current || raw.workingThreadId || "").trim()
    : "";
  const lockMode = raw.lockMode === "document" ? "document" : "pending-paragraphs";

  // Phase: explicit writer value wins; otherwise derive.
  const requestedPhase = String(raw.phase || "").trim();
  let phase;
  if (!active) {
    phase = "idle";
  } else if (requestedPhase === "working" || requestedPhase === "waiting") {
    phase = requestedPhase;
  } else {
    phase = currentThreadId ? "working" : "waiting";
  }

  // Health: active payloads use ok/stale/degraded; inactive (raw==null / bad v)
  // uses missing/unsupported/unreadable per helper.
  const health = resolveActiveHealth(raw.health, active);

  return {
    version,
    active,
    health,
    error: String(raw.error || ""),
    lockMode,
    pendingThreadIds,
    processedThreadIds,
    currentThreadId,
    phase,
    message: String(raw.message || ""),
    tool: String(raw.tool || raw.source || ""),
    startedAt: String(raw.startedAt || ""),
    updatedAt: String(raw.updatedAt || raw.startedAt || ""),
  };
}

function inactivePayload(health, error) {
  return {
    version: SUPERVISION_VERSION,
    active: false,
    health,
    error: error || "",
    lockMode: "pending-paragraphs",
    pendingThreadIds: [],
    processedThreadIds: [],
    currentThreadId: "",
    phase: "idle",
    message: "",
    tool: "",
    startedAt: "",
    updatedAt: "",
  };
}

const ACTIVE_HEALTH_VALUES = new Set(["ok", "stale", "degraded"]);

function resolveActiveHealth(rawHealth, active) {
  if (active) {
    if (ACTIVE_HEALTH_VALUES.has(rawHealth)) return rawHealth;
    return "ok";
  }
  // Inactive payloads: missing/unsupported/unreadable are the only valid
  // failure signals; treat anything else (including 'ok') as 'ok' (the helper
  // sets the right value at the call site).
  if (rawHealth === "missing" || rawHealth === "unsupported" || rawHealth === "unreadable") {
    return rawHealth;
  }
  return "ok";
}

function uniqueStrings(arr) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(arr)) return out;
  for (const x of arr) {
    const s = x == null ? "" : String(x).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * First contiguous mark span for a threadId (for pet widget placement).
 * @returns {{from:number,to:number}|null}
 */
export function findThreadMarkRange(doc, markType, threadId) {
  const pieces = findThreadMarkRanges(doc, markType, threadId);
  if (!pieces.length) return null;
  return { from: pieces[0].from, to: pieces[0].to };
}

/**
 * All coalesced mark spans for one logical threadId (may be disjoint).
 * @returns {Array<{from:number,to:number,threadId:string}>}
 */
export function findThreadMarkRanges(doc, markType, threadId) {
  if (!doc || !markType || !threadId) return [];
  const want = String(threadId);
  const pieces = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks || []) {
      if (m.type !== markType) continue;
      const tid = m.attrs && m.attrs.threadId;
      if (String(tid) !== want) continue;
      pieces.push({ from: pos, to: pos + node.nodeSize, threadId: want });
    }
  });
  return mergeRanges(pieces);
}

export function collectLockedRanges(doc, markType, pendingThreadIds) {
  const want = new Set(uniqueStrings(pendingThreadIds));
  if (!doc || !markType || !want.size) return [];
  const pieces = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks || []) {
      if (m.type !== markType) continue;
      const tid = m.attrs && m.attrs.threadId;
      if (!tid || !want.has(String(tid))) continue;
      pieces.push({ from: pos, to: pos + node.nodeSize, threadId: String(tid) });
    }
  });
  return mergeRanges(pieces);
}

function sanitizeRanges(ranges) {
  if (!ranges || !ranges.length) return [];
  return ranges
    .map((r) => ({ from: r.from | 0, to: r.to | 0, threadId: String(r.threadId || "") }))
    .filter((r) => r.to > r.from);
}

function coalesceContiguous(list, threadId) {
  const sorted = list.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      out.push({ from: r.from, to: r.to, threadId });
    }
  }
  return out;
}

export function mergeRanges(ranges) {
  const sanitized = sanitizeRanges(ranges);
  if (!sanitized.length) return [];
  const byThread = new Map();
  for (const range of sanitized) {
    const list = byThread.get(range.threadId) || [];
    list.push(range);
    byThread.set(range.threadId, list);
  }
  return [...byThread.entries()]
    .flatMap(([threadId, list]) => coalesceContiguous(list, threadId))
    .sort((a, b) => a.from - b.from || a.to - b.to || a.threadId.localeCompare(b.threadId));
}

export function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom < bTo && aTo > bFrom;
}

export function transactionTouchesRanges(tr, lockedRanges) {
  if (!tr || !tr.docChanged) return false;
  if (!lockedRanges || !lockedRanges.length) return false;
  const steps = tr.steps || [];
  if (!steps.length) return false;
  for (const step of steps) {
    const span = stepSpan(step);
    if (!span) return true;
    for (const r of lockedRanges) {
      if (rangesOverlap(span.from, span.to, r.from, r.to)) return true;
    }
  }
  return false;
}

/**
 * True when tr is a full-document load/replace (setContent / open / external reload).
 * Must not be blocked by supervision locks — empty editor + early poll otherwise stays blank.
 */
export function isFullDocumentLoad(tr, state) {
  if (!tr || !tr.docChanged || !state || !state.doc) return false;
  const size = state.doc.content.size;
  // Empty / near-empty doc: any content write is a load.
  if (size <= 4) return true;
  const steps = tr.steps || [];
  for (const step of steps) {
    const from = typeof step.from === "number" ? step.from : null;
    const to = typeof step.to === "number" ? step.to : null;
    if (from === 0 && to != null && to >= size) return true;
    // Some ReplaceAround / slice steps expose slice size instead
    if (from === 0 && to != null && to >= size - 1 && tr.doc && tr.doc.content.size > size) {
      return true;
    }
  }
  // Heuristic: old doc wiped and new is much larger (typical open of paper).
  try {
    if (tr.doc && tr.doc.content.size > Math.max(64, size * 2) && size < 32) return true;
  } catch (_) {}
  return false;
}

function stepSpan(step) {
  if (!step) return null;
  if (typeof step.from === "number" && typeof step.to === "number") {
    return { from: step.from, to: step.to };
  }
  try {
    const j = typeof step.toJSON === "function" ? step.toJSON() : null;
    if (j && typeof j.from === "number" && typeof j.to === "number") {
      return { from: j.from, to: j.to };
    }
    if (j && typeof j.from === "number") {
      const gap = typeof j.gapTo === "number" ? j.gapTo : j.from;
      return { from: j.from, to: Math.max(gap, j.from) };
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/** Tiny inline SVG critter (owl) — no external assets. */
export function createSupervisionPetElement(opts = {}) {
  const phase = opts.phase || "working";
  const threadId = opts.threadId || "";
  const el = document.createElement("span");
  el.className = `supervision-pet is-${phase}`;
  el.setAttribute("contenteditable", "false");
  el.setAttribute("aria-hidden", "true");
  if (threadId) el.setAttribute("data-thread-id", String(threadId));
  el.title = phase === "working" ? "AI 正在改这里" : "AI 监管中";
  el.innerHTML =
    '<span class="supervision-pet-body" aria-hidden="true">' +
    '<svg viewBox="0 0 32 28" width="22" height="19" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="16" cy="16" rx="12" ry="10" fill="#7dd3fc"/>' +
    '<circle cx="11" cy="14" r="4" fill="#0c4a6e"/>' +
    '<circle cx="21" cy="14" r="4" fill="#0c4a6e"/>' +
    '<circle cx="12.2" cy="13.5" r="1.3" fill="#e0f2fe"/>' +
    '<circle cx="22.2" cy="13.5" r="1.3" fill="#e0f2fe"/>' +
    '<path d="M14 19 Q16 22 18 19" fill="none" stroke="#0369a1" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M7 8 Q11 2 14 9" fill="#38bdf8"/>' +
    '<path d="M25 8 Q21 2 18 9" fill="#38bdf8"/>' +
    "</svg>" +
    '<span class="supervision-pet-label">改这里</span>' +
    "</span>";
  return el;
}

/**
 * Build lock + current + pet decorations.
 */
export function buildSupervisionDecos(doc, lockedRanges, lockMode, currentRange, currentThreadId, phase) {
  if (!doc) return DecorationSet.empty;
  const decos = [];
  if (lockMode === "document") {
    doc.forEach((node, offset) => {
      decos.push(
        Decoration.node(offset, offset + node.nodeSize, {
          class: "supervision-locked-block",
          "data-supervision-lock": "document",
        })
      );
    });
  } else {
    for (const r of lockedRanges || []) {
      if (!(r.to > r.from)) continue;
      const isCurrent =
        currentThreadId &&
        (r.threadId === currentThreadId ||
          String(r.threadId || "")
            .split(",")
            .includes(String(currentThreadId)));
      decos.push(
        Decoration.inline(r.from, r.to, {
          class: isCurrent ? "supervision-locked supervision-current" : "supervision-locked",
          "data-supervision-lock": isCurrent ? "current" : "pending",
          title: isCurrent ? "AI 正在处理此段" : "AI 监管处理中 — 此段暂不可编辑",
        })
      );
    }
  }

  // Pet widget at the start of the current mark range
  if (currentRange && currentRange.from != null && currentThreadId) {
    const pos = Math.max(0, Math.min(currentRange.from, doc.content.size));
    decos.push(
      Decoration.widget(
        pos,
        () =>
          createSupervisionPetElement({
            phase: phase || "working",
            threadId: currentThreadId,
          }),
        {
          side: -1,
          ignoreSelection: true,
          stopEvent: () => true,
          key: `supervision-pet-${currentThreadId}`,
        }
      )
    );
  }

  return DecorationSet.create(doc, decos);
}

export function materializeSupervisionState(doc, markType, payload) {
  const base = { ...emptySupervisionState(), ...normalizeSupervisionPayload(payload) };
  if (!base.active) {
    return {
      ...emptySupervisionState(),
      message: base.message,
      tool: base.tool,
      updatedAt: base.updatedAt,
    };
  }
  let lockedRanges = [];
  let missingThreadIds = [];
  if (base.lockMode === "document") {
    lockedRanges = doc ? [{ from: 0, to: doc.content.size, threadId: "*" }] : [];
  } else {
    lockedRanges = collectLockedRanges(doc, markType, base.pendingThreadIds);
    const locatedIds = new Set(lockedRanges.map((r) => r.threadId));
    missingThreadIds = base.pendingThreadIds.filter((id) => !locatedIds.has(id));
    // Do NOT auto-escalate to full-document lock when marks are missing.
    // Writer must set lockMode:'document' explicitly for whole-doc lock.
    if (missingThreadIds.length) {
      base.health = "degraded";
    }
  }

  let currentRange = null;
  if (base.currentThreadId && doc && markType) {
    currentRange = findThreadMarkRange(doc, markType, base.currentThreadId);
    // Explicit document-lock only: pin pet near top if mark missing.
    if (!currentRange && base.lockMode === "document" && doc.content.size > 1) {
      currentRange = { from: 1, to: Math.min(8, doc.content.size) };
    }
  }

  const decos = buildSupervisionDecos(
    doc,
    lockedRanges,
    base.lockMode,
    currentRange,
    base.currentThreadId,
    base.phase
  );
  return { ...base, lockedRanges, currentRange, missingThreadIds, decos };
}

export function supervisionBannerText(state) {
  if (!state || !state.active) return "";
  const tool = state.tool || "AI";
  const pending = (state.pendingThreadIds || []).length;
  const processed = (state.processedThreadIds || []).length;
  if (state.message) return String(state.message);
  const missing = (state.missingThreadIds || []).length;
  if (state.health === "stale") {
    return `${tool} 监管连接异常 · 保留上次锁定`;
  }
  if (state.health === "degraded" || missing) {
    return `${tool} 监管仍在运行 · 有 ${missing || pending} 条暂未定位`;
  }
  if (state.phase === "working" && state.currentThreadId) {
    return `${tool} 正在改一段 · 剩余 ${pending}`;
  }
  if (state.lockMode === "document") {
    return `${tool} 监管中 · 正文暂时只读`;
  }
  if (pending || processed) {
    return `${tool} 监管中 · 未处理 ${pending} · 已完成 ${processed}`;
  }
  return `${tool} 监管中`;
}

/** Signal-light phase for statusbar: off | working | waiting */
export function supervisionSignalPhase(state) {
  if (!state || !state.active) return "off";
  if (state.phase === "working" && state.currentThreadId) return "working";
  return "waiting";
}

export function createSupervisionPlugin() {
  return new Plugin({
    key: supervisionKey,
    state: {
      init: () => emptySupervisionState(),
      apply(tr, prev, _old, nextState) {
        const meta = tr.getMeta(supervisionKey);
        const markType = nextState.schema.marks.annotation;
        if (meta && typeof meta === "object") {
          return materializeSupervisionState(nextState.doc, markType, meta);
        }
        if (prev.active && tr.docChanged) {
          return materializeSupervisionState(nextState.doc, markType, {
            active: prev.active,
            lockMode: prev.lockMode === "document" ? "document" : "pending-paragraphs",
            pendingThreadIds: prev.pendingThreadIds,
            processedThreadIds: prev.processedThreadIds,
            currentThreadId: prev.currentThreadId,
            message: prev.message,
            tool: prev.tool,
            updatedAt: prev.updatedAt,
          });
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        const ps = supervisionKey.getState(state);
        return ps && ps.decos ? ps.decos : DecorationSet.empty;
      },
      attributes(state) {
        const ps = supervisionKey.getState(state);
        if (ps && ps.active) {
          return {
            "data-supervision": "on",
            "data-supervision-lock": ps.lockMode || "pending-paragraphs",
            "data-supervision-phase": ps.phase || "waiting",
          };
        }
        return { "data-supervision": "off" };
      },
    },
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;
      if (tr.getMeta(SUPERVISION_BYPASS_META) || tr.getMeta(supervisionKey)) return true;
      if (tr.getMeta("externalReload") || tr.getMeta("setContentSuspend")) return true;
      // Full-doc open/reload must never be blocked — otherwise ?open= deep-link
      // can race: poll activates document-lock on empty editor → setContent denied → blank body.
      if (isFullDocumentLoad(tr, state)) return true;
      const ps = supervisionKey.getState(state);
      if (!ps || !ps.active) return true;
      if (ps.lockMode === "document") return false;
      const locked = ps.lockedRanges || [];
      if (!locked.length) return true;
      return !transactionTouchesRanges(tr, locked);
    },
  });
}

export function setSupervisionMeta(tr, payload) {
  return tr.setMeta(supervisionKey, payload == null ? { active: false } : payload);
}
