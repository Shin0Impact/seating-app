// The door desk keeps working without signal: the last guest list is kept on the phone, and every tap (arrived,
// count, undo, scan, walk-in) goes into a queue that is sent as soon as there is a connection. Until then the screen
// shows the list as if the taps had already gone through.

export type HelperInvite = {
  token: string;
  guest_id: string;
  member_ids: string[];
  party_size: number;
  status: string;
  confirmed_count: number | null;
  checked_in_at: string | null;
};
export type HelperData = { name: string; layout: unknown; invites: HelperInvite[] };

export type HelperOp =
  | { id: string; kind: 'checkin'; invite: string; count: number; undo: boolean; at: string }
  | { id: string; kind: 'scan'; invite: string; at: string }
  | { id: string; kind: 'walkin'; key: string; name: string; count: number; at: string };

/** The invite token a walk-in will get on the server (made from its key, so the phone knows it in advance). */
export const walkinToken = (key: string) => key.replace(/-/g, '');

/**
 * Add a tap to the queue. For the same invite only the newest arrived/undo/scan matters (the server takes the
 * latest), so an older one waiting for the same invite is dropped.
 */
export function enqueue(queue: HelperOp[], op: HelperOp): HelperOp[] {
  if (op.kind === 'walkin') return [...queue, op];
  if (op.kind === 'scan') {
    // a scan never undoes anything: if this invite already has a check-in waiting, that one stands
    if (queue.some((q) => q.kind !== 'walkin' && q.invite === op.invite)) return queue;
    return [...queue, op];
  }
  return [...queue.filter((q) => q.kind === 'walkin' || q.invite !== op.invite), op];
}

/** The list as it will be once the queue has gone through. */
export function overlay(data: HelperData, queue: HelperOp[]): HelperData {
  if (queue.length === 0) return data;
  let invites = data.invites;
  let layout = data.layout as { guests?: Record<string, unknown>[] } & Record<string, unknown>;
  for (const op of queue) {
    if (op.kind === 'walkin') {
      const token = walkinToken(op.key);
      if (invites.some((i) => i.token === token)) continue; // already on the server
      layout = {
        ...layout,
        guests: [
          ...(layout.guests ?? []),
          { id: op.key, name: op.name, group: '', tableId: null, seat: null, stepFree: false },
        ],
      };
      invites = [
        ...invites,
        {
          token,
          guest_id: op.key,
          member_ids: [],
          party_size: op.count,
          status: 'confirmed',
          confirmed_count: op.count,
          checked_in_at: op.at,
        },
      ];
      continue;
    }
    invites = invites.map((i) => {
      if (i.token !== op.invite) return i;
      if (op.kind === 'scan') return { ...i, checked_in_at: i.checked_in_at ?? op.at };
      if (op.undo) return { ...i, checked_in_at: null };
      return { ...i, checked_in_at: i.checked_in_at ?? op.at, status: 'confirmed', confirmed_count: op.count };
    });
  }
  return { ...data, layout, invites };
}

/** Which invites still have a tap waiting to be sent. */
export function pendingInvites(queue: HelperOp[]): Set<string> {
  return new Set(queue.map((q) => (q.kind === 'walkin' ? walkinToken(q.key) : q.invite)));
}

const dataKey = (token: string) => `helper:${token}:data`;
const queueKey = (token: string) => `helper:${token}:queue`;

export function loadSaved(token: string): { data: HelperData | null; savedAt: string | null; queue: HelperOp[] } {
  try {
    const d = JSON.parse(localStorage.getItem(dataKey(token)) ?? 'null');
    const q = JSON.parse(localStorage.getItem(queueKey(token)) ?? '[]');
    return {
      data: d && d.data && Array.isArray(d.data.invites) ? (d.data as HelperData) : null,
      savedAt: d && typeof d.savedAt === 'string' ? d.savedAt : null,
      queue: Array.isArray(q) ? (q as HelperOp[]) : [],
    };
  } catch {
    return { data: null, savedAt: null, queue: [] };
  }
}

export function saveData(token: string, data: HelperData, savedAt: string) {
  try {
    localStorage.setItem(dataKey(token), JSON.stringify({ data, savedAt }));
  } catch {
    /* storage full or blocked: the desk still works while the page stays open */
  }
}

export function saveQueue(token: string, queue: HelperOp[]) {
  try {
    localStorage.setItem(queueKey(token), JSON.stringify(queue));
  } catch {
    /* as above */
  }
}

/** Forget everything kept for a link that no longer works. */
export function forget(token: string) {
  try {
    localStorage.removeItem(dataKey(token));
    localStorage.removeItem(queueKey(token));
  } catch {
    /* nothing kept */
  }
}
