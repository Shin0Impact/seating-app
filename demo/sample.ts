// The hall from the hand-drawn plan. Coordinates were measured off the photo (24 px = 1 m) and rounded.
// It has no guests: add yours with Import list.
import { emptyLayout, newColumn, newMarker, newTable, Layout } from '../src/lib/layout';

const PX = 24; // photo pixels per metre
const OX = 1380;
const OY = 620;
const m = (px: number, origin: number) => Math.round(((px - origin) / PX) * 10) / 10;

// [label number or 0 for unnumbered, seats, x px, y px, rotation deg]  (rotation 90 = standing, 0 = lying)
const TABLES: [number, number, number, number, number][] = [
  // bottom group, standing
  [1, 30, 1388, 604, 90], [2, 30, 1254, 608, 90], [3, 30, 1130, 608, 90], [4, 20, 965, 648, 66],
  // right block, lying
  [5, 30, 1790, 1039, 0], [6, 30, 1780, 909, 0], [7, 30, 1771, 801, 0], [8, 30, 1761, 682, 0], [9, 26, 1755, 587, 0],
  [10, 20, 1700, 477, -32], [11, 10, 2022, 980, 9], [12, 20, 2005, 841, 0], [13, 20, 1976, 650, 0], [14, 10, 1925, 447, -22],
  // middle row, standing
  [15, 20, 1642, 372, 96], [16, 20, 1548, 380, 90], [17, 16, 1484, 361, 90], [18, 20, 1383, 390, 90], [19, 20, 1296, 392, 90],
  [20, 20, 1193, 392, 90], [21, 20, 1080, 392, 90], [22, 20, 957, 392, 90], [23, 20, 844, 410, 80], [24, 20, 756, 438, 78], [25, 20, 670, 470, 73],
  // top row, standing
  [26, 14, 1415, 196, 90], [27, 18, 1333, 182, 90], [28, 18, 1260, 182, 90], [29, 20, 1188, 172, 90], [30, 10, 1110, 182, 90],
  [31, 20, 1015, 217, 97], [32, 20, 938, 225, 95], [33, 20, 852, 238, 92], [34, 20, 785, 245, 92], [35, 20, 702, 260, 92],
  [36, 20, 935, 48, 81], [37, 20, 835, 60, 62], [38, 20, 748, 62, 62], [39, 20, 662, 72, 60],
  // top right, no number on the plan
  [40, 20, 1723, 210, 90],
  // fan of unnumbered tables, bottom left
  [41, 20, 658, 642, 39], [42, 20, 796, 672, 41], [43, 20, 720, 762, 31], [44, 20, 960, 815, 43], [45, 20, 920, 900, 24], [46, 20, 718, 924, 8],
];

// grey circles on the plan
const COLUMNS: [number, number][] = [[1060, 191], [747, 281], [910, 660], [1442, 629], [1904, 560], [1941, 917]];

export function sampleLayout(): Layout {
  const l = emptyLayout();
  const tables = TABLES.map(([n, seats, x, y, rot]) => ({
    ...newTable(m(x, OX), m(y, OY), 'rect', seats, n),
    label: `طاولة ${n}`,
    rotation: rot,
  }));
  const columns = COLUMNS.map(([x, y]) => ({ ...newColumn(m(x, OX), m(y, OY), 'circle', 0.5), label: 'عمود' }));
  const dance = { ...newMarker(m(1375, OX), m(880, OY), 'dancefloor'), label: 'ساحة الرقص', w: 21, h: 11 };
  const stage = { ...newMarker(m(978, OX), m(1074, OY), 'stage'), label: 'العرسان', w: 8.3, h: 2.2 };
  const door = { ...newMarker(m(1995, OX), m(160, OY), 'entrance'), label: 'المدخل', w: 3, h: 0.7 };
  const area = { ...newMarker(m(1603, OX), m(187, OY), 'other'), label: 'منطقة', w: 12, h: 7.3 };
  const box = { ...newMarker(m(2017, OX), m(246, OY), 'other'), label: 'منطقة', w: 3.1, h: 3.5 };
  l.elements = [dance, stage, door, area, box, ...columns, ...tables];
  l.guests = [];
  return l;
}
