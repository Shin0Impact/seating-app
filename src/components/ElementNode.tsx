'use client';

import type Konva from 'konva';
import { useMemo } from 'react';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { canvasMeasure, fitChairLabel } from '@/lib/chairlabel';
import {
  ChairSlot,
  Element,
  Guest,
  Settings,
  TableEl,
  chairSlots,
  snap,
  tableDims,
  tableFootprint,
} from '@/lib/layout';

export type IssueState = 'overlap' | 'tight' | undefined;
export type ChairTip = { text: string; x: number; y: number };

type Props = {
  el: Element;
  settings: Settings;
  issue: IssueState;
  /** Guests seated at this table; undefined while the guest list is empty. */
  seated?: number;
  /** For a table: the guest at each chair, by chair number. */
  seatGuests?: (Guest | undefined)[];
  /** Chair lit up as the drop target while a guest is dragged over it. */
  highlightSeat?: number | null;
  register: (id: string, node: Konva.Group | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  snapPos?: (x: number, y: number, node?: Konva.Node) => { x: number; y: number };
  /** A seated guest's chair was dropped at this world position (meters). */
  onChairDrop?: (guestId: string, x: number, y: number) => void;
  /** Hovering a seated chair: show the guest's name near the pointer. */
  onChairTip?: (tip: ChairTip | null) => void;
  /** Double-click / double-tap on a chair: open the guest picker for it. */
  onChairOpen?: (tableId: string, seat: number, clientX: number, clientY: number) => void;
  /** Current zoom in screen pixels per meter; more of a guest's name shows as it grows. */
  scale?: number;
  /** Part of a multi-selection: draw a highlight (a lone selection uses the rotate handle). */
  multi?: boolean;
  onSelect: (id: string, toggle: boolean) => void;
  onDragStartEl?: (id: string) => void;
  onDragMoveEl?: (id: string, x: number, y: number) => void;
  onOpenEl?: (id: string) => void;
  /** People picked with the people tool (guest ids), shown with a ring on their chairs. */
  pickedIds?: Set<string>;
  onChairPick?: (guestId: string) => void;
  /** While true elements cannot be dragged (people-picking mode). */
  locked?: boolean;
};

/** Chair name size in screen pixels: readable, growing a little with zoom. */
export const chairFontPx = (scale: number) => Math.min(18, Math.max(13, scale * 0.1));

/** What to print on a chair: an initial when zoomed out, then more of the name as chairs get bigger. */
export function chairText(name: string, scale: number): { text: string; full: boolean } {
  const chars = Array.from(name.trim());
  if (scale < 55) return { text: chars[0] ?? '?', full: false };
  const fontPx = chairFontPx(scale);
  const max = Math.max(2, Math.floor((0.6 * scale) / (fontPx * 0.58)));
  if (chars.length <= max) return { text: chars.join(''), full: true };
  const f = Array.from(name.trim().split(/\s+/)[0]);
  if (f.length <= max) return { text: f.join(''), full: false }; // first name only
  return { text: f.slice(0, max - 1).join('') + '…', full: false };
}

export const FONT = "'Noto Sans Arabic Variable', system-ui, sans-serif";

const LIGHT = {
  ink: '#2b2a28',
  line: '#6b655c',
  table: '#fffdf8',
  chair: '#d9d2c3',
  overlap: '#c0392b',
  tight: '#d98b00',
  chairOverlap: '#f3c4bd',
  chairTight: '#f6e0b0',
  zoneFill: 'rgba(176, 141, 60, 0.14)',
  zoneLine: '#9a7a2e',
  column: '#4a463f',
  noGroup: '#c9d6ee',
  groupS: 60,
  groupL: 80,
};
const DARK: typeof LIGHT = {
  ink: '#ecebe7',
  line: '#9a958a',
  table: '#2f3238',
  chair: '#4a4d55',
  overlap: '#ef7d70',
  tight: '#e0a23a',
  chairOverlap: '#6d3028',
  chairTight: '#6b5420',
  zoneFill: 'rgba(224, 180, 80, 0.14)',
  zoneLine: '#c9a553',
  column: '#b9b4a8',
  noGroup: '#3a4a6e',
  groupS: 42,
  groupL: 34,
};

const MARKER_LIGHT: Record<string, string> = {
  stage: '#e7d7f2',
  dancefloor: '#d6ecec',
  entrance: '#f6d9d0',
  buffet: '#e3edd2',
  other: '#e8e4dc',
  walkway: '#f3e6b8',
  exit: '#bfe8c9',
};
const MARKER_DARK: Record<string, string> = {
  stage: '#473458',
  dancefloor: '#25494a',
  entrance: '#593a30',
  buffet: '#3b4a2a',
  other: '#3b3a37',
  walkway: '#5a4c1f',
  exit: '#1f5a33',
};

/** Canvas colors are plain values (Konva can't read CSS variables). The editor calls applyPalette() on every
 *  render and remounts the canvas layers when the theme flips, so these objects are always current. */
export const COLORS: typeof LIGHT = { ...LIGHT };
const MARKER_FILL: Record<string, string> = { ...MARKER_LIGHT };
export function applyPalette(theme: 'light' | 'dark') {
  Object.assign(COLORS, theme === 'dark' ? DARK : LIGHT);
  Object.assign(MARKER_FILL, theme === 'dark' ? MARKER_DARK : MARKER_LIGHT);
}

/** A stable pastel color per group, so families are easy to spot around a table. */
function groupColor(group: string): string {
  if (!group) return COLORS.noGroup;
  let h = 0;
  for (const ch of group) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return `hsl(${h}, ${COLORS.groupS}%, ${COLORS.groupL}%)`;
}

type ChairProps = {
  slot: ChairSlot;
  w: number;
  d: number;
  fill: string;
  guest?: Guest;
  tableRotation: number;
  highlight: boolean;
  picked?: boolean;
  onPick?: () => void;
  onDrop?: (guestId: string, x: number, y: number) => void;
  onTip?: (tip: ChairTip | null) => void;
  onOpen?: (clientX: number, clientY: number) => void;
  scale: number;
  name: string;
};

function Chair({
  name,
  slot,
  w,
  d,
  fill,
  guest,
  tableRotation,
  highlight,
  picked,
  onPick,
  onDrop,
  onTip,
  onOpen,
  scale,
}: ChairProps) {
  const shown = guest ? chairText(guest.name, scale) : null;
  const big = !!shown && scale >= 55;
  // Visible size of the chair on screen (the table body is drawn over anything that spills toward it).
  const th = ((slot.rot + tableRotation) * Math.PI) / 180;
  const extX = Math.abs(w * Math.cos(th)) + Math.abs(d * Math.sin(th));
  const extY = Math.abs(w * Math.sin(th)) + Math.abs(d * Math.cos(th));
  const fontPx = chairFontPx(scale);
  const fontM = fontPx / scale;
  const availM = extX * 1.04;
  const measure = useMemo(() => canvasMeasure(FONT), []);
  const fitted = guest && big ? fitChairLabel(guest.name, availM * scale, extY * scale, fontPx, measure) : null;
  const setCursor = (e: Konva.KonvaEventObject<Event>, value: string) => {
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = value;
  };
  const open = (e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    const st = e.target.getStage();
    const p = st?.getPointerPosition();
    const r = st?.container().getBoundingClientRect();
    if (p && r) onOpen?.(r.left + p.x, r.top + p.y);
  };
  return (
    <Group
      name={name}
      x={slot.x}
      y={slot.y}
      draggable={!!guest}
      onDblClick={open}
      onDblTap={open}
      onClick={() => onPick?.()}
      onTap={() => onPick?.()}
      onMouseEnter={(e) => {
        setCursor(e, guest ? 'grab' : 'pointer');
        if (guest) onTip?.({ text: guest.name, x: (e.evt as MouseEvent).clientX, y: (e.evt as MouseEvent).clientY });
      }}
      onMouseMove={(e) => {
        if (guest) onTip?.({ text: guest.name, x: (e.evt as MouseEvent).clientX, y: (e.evt as MouseEvent).clientY });
      }}
      onMouseLeave={(e) => {
        setCursor(e, '');
        onTip?.(null);
      }}
      onDragStart={(e) => {
        e.cancelBubble = true;
        setCursor(e, 'grabbing');
        onTip?.(null);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        const node = e.target;
        const layer = node.getLayer();
        const p = layer
          ? layer.getAbsoluteTransform().copy().invert().point(node.getAbsolutePosition())
          : { x: 0, y: 0 };
        node.position({ x: slot.x, y: slot.y }); // snap back; the seating change redraws it
        setCursor(e, '');
        if (guest) onDrop?.(guest.id, p.x, p.y);
      }}
    >
      {picked && (
        <Circle
          radius={0.42}
          fill="rgba(217, 72, 15, 0.16)"
          stroke="#d9480f"
          strokeWidth={3}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
      {highlight && (
        <Circle
          radius={0.4}
          fill="rgba(47, 95, 196, 0.18)"
          stroke="#2f5fc4"
          strokeWidth={2}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
      <Rect
        width={w}
        height={d}
        offsetX={w / 2}
        offsetY={d / 2}
        rotation={slot.rot}
        cornerRadius={Math.min(w, d) * 0.3}
        fill={guest ? groupColor(guest.group) : fill}
        stroke={guest ? COLORS.ink : COLORS.line}
        strokeWidth={guest ? 1.25 : 0.75}
        strokeScaleEnabled={false}
        listening={false}
      />
      <Circle radius={0.3} fill="rgba(0,0,0,0.001)" />
      {guest && (
        <>
          {big && fitted ? (
            <>
              <Text
                text={fitted.plus && !fitted.twoLines ? `${fitted.main} ${fitted.plus}` : fitted.main}
                width={availM}
                height={0.4}
                offsetX={availM / 2}
                offsetY={0.2 + (fitted.plus && fitted.twoLines ? fontM * fitted.scale * 0.55 : 0)}
                rotation={-tableRotation}
                align="center"
                verticalAlign="middle"
                wrap="none"
                fontSize={fontM * fitted.scale}
                fontStyle="bold"
                fontFamily={FONT}
                fill={COLORS.ink}
                stroke="rgba(255,255,255,0.95)"
                strokeWidth={3 / scale}
                fillAfterStrokeEnabled
                listening={false}
              />
              {fitted.plus && fitted.twoLines && (
                <Text
                  text={fitted.plus}
                  width={availM}
                  height={0.4}
                  offsetX={availM / 2}
                  offsetY={0.2 - fontM * fitted.scale * 0.6}
                  rotation={-tableRotation}
                  align="center"
                  verticalAlign="middle"
                  wrap="none"
                  fontSize={fontM * fitted.scale * 0.85}
                  fontStyle="bold"
                  fontFamily={FONT}
                  fill="#a33a00"
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth={3 / scale}
                  fillAfterStrokeEnabled
                  listening={false}
                />
              )}
            </>
          ) : (
            <Text
              text={shown!.text}
              width={0.4}
              height={0.4}
              offsetX={0.2}
              offsetY={0.2}
              rotation={-tableRotation}
              align="center"
              verticalAlign="middle"
              wrap="none"
              fontSize={0.32}
              fontStyle="bold"
              fontFamily={FONT}
              fill={COLORS.ink}
              listening={false}
            />
          )}
        </>
      )}
    </Group>
  );
}

function Chairs(props: {
  el: TableEl;
  settings: Settings;
  fill: string;
  seatGuests?: (Guest | undefined)[];
  highlightSeat?: number | null;
  onChairDrop?: ChairProps['onDrop'];
  onChairTip?: ChairProps['onTip'];
  onChairOpen?: Props['onChairOpen'];
  pickedIds?: Set<string>;
  onChairPick?: (guestId: string) => void;
  scale: number;
}) {
  const {
    el,
    settings,
    fill,
    seatGuests,
    highlightSeat,
    onChairDrop,
    onChairTip,
    onChairOpen,
    pickedIds,
    onChairPick,
    scale,
  } = props;
  const cw = settings.seatWidth * 0.75;
  const cd = settings.chairDepth * 0.8;
  return (
    <>
      {chairSlots(el, settings).map((slot, i) => (
        <Chair
          key={i}
          slot={slot}
          w={cw}
          d={cd}
          fill={fill}
          guest={seatGuests?.[i]}
          tableRotation={el.rotation}
          highlight={highlightSeat === i}
          picked={!!seatGuests?.[i] && !!pickedIds?.has(seatGuests[i]!.id)}
          onPick={onChairPick && seatGuests?.[i] ? () => onChairPick(seatGuests[i]!.id) : undefined}
          onDrop={onChairDrop}
          onTip={onChairTip}
          onOpen={(cx, cy) => onChairOpen?.(el.id, i, cx, cy)}
          scale={scale}
          name={`chair|${el.id}|${i}`}
        />
      ))}
    </>
  );
}

/** Text that stays upright however the element is rotated. */
function Label({
  text,
  rotation,
  w,
  h,
  size = 0.36,
}: {
  text: string;
  rotation: number;
  w: number;
  h: number;
  size?: number;
}) {
  return (
    <Text
      text={text}
      width={w}
      height={h}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={-rotation}
      align="center"
      verticalAlign="middle"
      fontSize={size}
      wrap="none"
      fontFamily={FONT}
      fill={COLORS.ink}
      listening={false}
    />
  );
}

export function ElementNode({
  el,
  settings,
  issue,
  seated,
  seatGuests,
  highlightSeat,
  register,
  onSelect,
  onMove,
  snapPos,
  onChairDrop,
  onChairTip,
  onChairOpen,
  scale = 40,
  multi,
  onDragStartEl,
  onDragMoveEl,
  onOpenEl,
  pickedIds,
  onChairPick,
  locked,
}: Props) {
  const stroke = issue === 'overlap' ? COLORS.overlap : issue === 'tight' ? COLORS.tight : COLORS.line;
  const chairFill = issue === 'overlap' ? COLORS.chairOverlap : issue === 'tight' ? COLORS.chairTight : COLORS.chair;

  let body: React.ReactNode = null;
  if (el.kind === 'table') {
    const d = tableDims(el, settings);
    const text = `${el.label}\n${seated === undefined ? el.seats : `${seated}/${el.seats}`}`;
    body =
      d.shape === 'round' ? (
        <>
          <Chairs
            el={el}
            settings={settings}
            fill={chairFill}
            seatGuests={seatGuests}
            highlightSeat={highlightSeat}
            pickedIds={pickedIds}
            onChairPick={onChairPick}
            onChairDrop={onChairDrop}
            onChairTip={onChairTip}
            onChairOpen={onChairOpen}
            scale={scale}
          />
          <Circle
            radius={d.diameter / 2}
            fill={COLORS.table}
            stroke={stroke}
            strokeWidth={issue ? 2 : 1.25}
            strokeScaleEnabled={false}
          />
          <Label
            text={text}
            rotation={el.rotation}
            w={d.diameter * 0.9}
            h={d.diameter * 0.6}
            size={Math.min(0.36, Math.max(0.22, d.diameter * 0.24))}
          />
        </>
      ) : (
        <>
          <Chairs
            el={el}
            settings={settings}
            fill={chairFill}
            seatGuests={seatGuests}
            highlightSeat={highlightSeat}
            pickedIds={pickedIds}
            onChairPick={onChairPick}
            onChairDrop={onChairDrop}
            onChairTip={onChairTip}
            onChairOpen={onChairOpen}
            scale={scale}
          />
          <Rect
            x={-d.length / 2}
            y={-d.width / 2}
            width={d.length}
            height={d.width}
            cornerRadius={0.05}
            fill={COLORS.table}
            stroke={stroke}
            strokeWidth={issue ? 2 : 1.25}
            strokeScaleEnabled={false}
          />
          <Label text={text} rotation={el.rotation} w={Math.min(d.length, 2.2)} h={d.width} />
        </>
      );
  } else if (el.kind === 'column') {
    body =
      el.shape === 'circle' ? (
        <Circle radius={el.size / 2} fill={COLORS.column} />
      ) : (
        <Rect x={-el.size / 2} y={-el.size / 2} width={el.size} height={el.size} fill={COLORS.column} />
      );
  } else if (el.kind === 'zone') {
    const steps = Math.min(el.steps, 10);
    body = (
      <>
        <Rect
          x={-el.w / 2}
          y={-el.h / 2}
          width={el.w}
          height={el.h}
          fill={COLORS.zoneFill}
          stroke={COLORS.zoneLine}
          strokeWidth={1.25}
          dash={[6, 4]}
          strokeScaleEnabled={false}
        />
        {Array.from({ length: steps }, (_, i) => (
          <Line
            key={i}
            points={[-el.w / 2, el.h / 2 + 0.28 * (i + 1), el.w / 2, el.h / 2 + 0.28 * (i + 1)]}
            stroke={COLORS.zoneLine}
            strokeWidth={1}
            strokeScaleEnabled={false}
            listening={false}
          />
        ))}
        <Label text={el.steps > 0 ? `${el.label} ↑${el.steps}` : el.label} rotation={el.rotation} w={el.w} h={el.h} />
      </>
    );
  } else {
    body = (
      <>
        <Rect
          x={-el.w / 2}
          y={-el.h / 2}
          width={el.w}
          height={el.h}
          fill={MARKER_FILL[el.marker]}
          stroke={COLORS.line}
          strokeWidth={1}
          strokeScaleEnabled={false}
          cornerRadius={0.08}
        />
        <Label text={el.label} rotation={el.rotation} w={el.w} h={el.h} />
      </>
    );
  }

  let box: React.ReactNode = null;
  if (multi) {
    const props = {
      fill: 'rgba(59,111,212,0.08)',
      stroke: '#3b6fd4',
      strokeWidth: 1.5,
      dash: [6, 4],
      strokeScaleEnabled: false,
      listening: false,
    };
    if (el.kind === 'table') {
      const f = tableFootprint(el, settings);
      box =
        f.type === 'circle' ? (
          <Circle radius={f.r} {...props} />
        ) : (
          <Rect x={-f.w / 2} y={-f.h / 2} width={f.w} height={f.h} {...props} />
        );
    } else if (el.kind === 'column') {
      box = (
        <Rect x={-el.size / 2 - 0.1} y={-el.size / 2 - 0.1} width={el.size + 0.2} height={el.size + 0.2} {...props} />
      );
    } else {
      box = <Rect x={-el.w / 2 - 0.1} y={-el.h / 2 - 0.1} width={el.w + 0.2} height={el.h + 0.2} {...props} />;
    }
  }

  return (
    <Group
      id={el.id}
      ref={(n) => register(el.id, n)}
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      draggable={!locked}
      onMouseDown={(e) => {
        if ((e.evt as MouseEvent).button === 2) return; // right-click opens the menu
        onSelect(
          el.id,
          (e.evt as MouseEvent).shiftKey || (e.evt as MouseEvent).ctrlKey || (e.evt as MouseEvent).metaKey,
        );
      }}
      onTouchStart={() => onSelect(el.id, false)}
      onDblClick={() => onOpenEl?.(el.id)}
      onDblTap={() => onOpenEl?.(el.id)}
      onDragStart={(e) => {
        if (e.target === e.currentTarget) onDragStartEl?.(el.id);
      }}
      onDragMove={(e) => {
        if (e.target !== e.currentTarget) return;
        if (snapPos) e.target.position(snapPos(e.target.x(), e.target.y(), e.target));
        onDragMoveEl?.(el.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return; // a chair was dragged, not the table
        const node = e.target;
        const { x, y } = snapPos
          ? snapPos(node.x(), node.y(), node)
          : { x: snap(node.x(), 0.1), y: snap(node.y(), 0.1) };
        node.position({ x, y });
        onMove(el.id, x, y);
      }}
    >
      {box}
      {body}
    </Group>
  );
}
