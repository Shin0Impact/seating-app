export type InviteRow = {
  token: string;
  guest_id: string;
  party_size: number;
  status: string;
  confirmed_count: number | null;
  checked_in_at: string | null;
  sent_at: string | null;
};

export type InviteState = 'unsent' | 'waiting' | 'confirmed' | 'declined' | 'arrived';

/** One state per invite, in the order a family moves through them. */
export function inviteState(r: Pick<InviteRow, 'status' | 'checked_in_at' | 'sent_at'>): InviteState {
  if (r.checked_in_at) return 'arrived';
  if (r.status === 'confirmed') return 'confirmed';
  if (r.status === 'declined') return 'declined';
  return r.sent_at ? 'waiting' : 'unsent';
}

export const STATE_LABEL: Record<InviteState, string> = {
  unsent: 'لم تُرسل',
  waiting: 'بانتظار الرد',
  confirmed: 'أكّدوا',
  declined: 'اعتذروا',
  arrived: 'وصلوا',
};

export type Totals = { families: number; people: number; sent: number; confirmedFamilies: number; confirmedPeople: number; declined: number; arrived: number };

export function totals(rows: InviteRow[]): Totals {
  const t: Totals = { families: rows.length, people: 0, sent: 0, confirmedFamilies: 0, confirmedPeople: 0, declined: 0, arrived: 0 };
  for (const r of rows) {
    t.people += r.party_size;
    if (r.sent_at || r.status !== 'pending') t.sent++;
    if (r.status === 'confirmed') {
      t.confirmedFamilies++;
      t.confirmedPeople += r.confirmed_count ?? r.party_size;
    }
    if (r.status === 'declined') t.declined++;
    if (r.checked_in_at) t.arrived++;
  }
  return t;
}

export const DEFAULT_TEMPLATE = 'أهلاً {name}،\nيسعدنا دعوتكم إلى {event}.\nالرجاء تأكيد حضوركم عبر هذا الرابط:\n{link}';

export function fillMessage(template: string, v: { name: string; event: string; link: string; people: number }): string {
  return template
    .replace(/\{name\}/g, v.name)
    .replace(/\{event\}/g, v.event)
    .replace(/\{link\}/g, v.link)
    .replace(/\{people\}/g, String(v.people));
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
