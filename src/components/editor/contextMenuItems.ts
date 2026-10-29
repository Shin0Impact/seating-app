import type { Key } from '@/lib/i18n';
import { Element, Layout, LIMITS, TableEl, newColumn } from '@/lib/layout';
import { inviteDrafts } from '@/lib/invites';
import type { MenuItem } from '../ContextMenu';

export type MenuState = {
  x: number;
  y: number;
  wx: number;
  wy: number;
  target: { kind: 'blank' } | { kind: 'element'; id: string } | { kind: 'chair'; tableId: string; seat: number };
};

/** What the right-click / long-press menu needs from the editor. */
export type MenuContext = {
  t: (k: Key) => string;
  layout: Layout;
  selection: string[];
  seatsToAdd: number;
  snapV: (v: number) => number;
  commit: (next: Layout) => void;
  setSelectedId: (id: string | null) => void;
  setPicker: (p: { tableId: string; seat: number; x: number; y: number }) => void;
  setPeopleSel: (ids: string[]) => void;
  setPeopleTool: (on: boolean) => void;
  setSelectTool: (on: boolean) => void;
  setToast: (msg: string) => void;
  emptyChair: (guestId: string) => void;
  emptyTable: (tableId: string) => void;
  duplicateSelected: () => void;
  rotateSelected: () => void;
  setShape: (ids: string[], shape: 'round' | 'rect') => void;
  removeSelected: () => void;
  addTableAt: (shape: 'round' | 'rect', seats: number, x: number, y: number) => void;
  selectAll: () => void;
};

export function buildMenuItems(m: MenuState, c: MenuContext): MenuItem[] {
  const l = c.layout;
  if (m.target.kind === 'chair') {
    const { tableId, seat } = m.target;
    const occ = l.guests.find((g) => g.tableId === tableId && g.seat === seat);
    const party = occ
      ? inviteDrafts(l.guests).find((d) => d.guestId === occ.id || d.memberIds.includes(occ.id))
      : undefined;
    const partyIds = party
      ? [party.guestId, ...party.memberIds].filter((id) => l.guests.some((g) => g.id === id && g.tableId))
      : [];
    return [
      {
        label: occ ? c.t('changeGuest') : c.t('seatGuestHere'),
        onClick: () => c.setPicker({ tableId, seat, x: m.x, y: m.y }),
      },
      ...(occ ? [{ label: `${c.t('emptyChair')} (${occ.name})`, onClick: () => c.emptyChair(occ.id) }] : []),
      ...(partyIds.length > 1
        ? [
            {
              label: `${c.t('selectParty')} (${partyIds.length})`,
              onClick: () => {
                c.setPeopleSel(partyIds);
                c.setPeopleTool(true);
                c.setSelectTool(false);
                c.setToast(c.t('partySelected'));
              },
            },
          ]
        : []),
    ];
  }
  if (m.target.kind === 'element') {
    const sel = c.selection;
    const many = sel.length > 1;
    const only = !many ? l.elements.find((e) => e.id === sel[0]) : undefined;
    const items: MenuItem[] = [
      {
        label: many
          ? `${c.t('duplicate')} (${sel.length})`
          : only?.kind === 'table'
            ? `${c.t('copyTable')} (${only.seats})`
            : c.t('duplicate'),
        onClick: c.duplicateSelected,
      },
      { label: c.t('rotate90'), onClick: c.rotateSelected },
    ];
    const tablesSel = sel
      .map((id) => l.elements.find((e) => e.id === id))
      .filter((e): e is TableEl => !!e && e.kind === 'table');
    if (tablesSel.length > 0) {
      const toRect = tablesSel.some((x) => x.shape === 'round');
      items.push({
        label: toRect ? c.t('makeRect') : c.t('makeRound'),
        onClick: () =>
          c.setShape(
            tablesSel.map((x) => x.id),
            toRect ? 'rect' : 'round',
          ),
      });
    }
    if (only && only.kind === 'table' && l.guests.some((g) => g.tableId === only.id)) {
      items.push({ label: c.t('emptyTable'), onClick: () => c.emptyTable(only.id) });
    }
    items.push('sep', {
      label: many ? `${c.t('remove')} (${sel.length})` : c.t('remove'),
      danger: true,
      onClick: c.removeSelected,
    });
    return items;
  }
  const at = (make: (x: number, y: number) => Element) => () => {
    if (l.elements.length >= LIMITS.maxElements) return;
    const el = make(c.snapV(m.wx), c.snapV(m.wy));
    c.commit({ ...l, elements: [...l.elements, el] });
    c.setSelectedId(el.id);
  };
  return [
    {
      label: `+ ${c.t('roundTable')} (${c.seatsToAdd})`,
      onClick: () => c.addTableAt('round', c.seatsToAdd, m.wx, m.wy),
    },
    {
      label: `+ ${c.t('rectTable')} (${c.seatsToAdd})`,
      onClick: () => c.addTableAt('rect', c.seatsToAdd, m.wx, m.wy),
    },
    {
      label: `+ ${c.t('roundColumn')}`,
      onClick: at((x, y) => ({ ...newColumn(x, y, 'circle'), label: c.t('column') })),
    },
    {
      label: `+ ${c.t('squareColumn')}`,
      onClick: at((x, y) => ({ ...newColumn(x, y, 'square'), label: c.t('column') })),
    },
    'sep',
    { label: c.t('selectAll'), disabled: l.elements.length === 0, onClick: c.selectAll },
  ];
}
