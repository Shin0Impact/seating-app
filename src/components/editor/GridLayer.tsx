import { Layer, Line } from 'react-konva';

export type GridLine = { key: string; points: number[]; major: boolean };

/** Background grid in meters, plus the small cross at the origin. */
export function GridLayer({ lines, dark }: { lines: GridLine[]; dark: boolean }) {
  const originColor = dark ? '#7d796f' : '#9a9283';
  return (
    <Layer listening={false}>
      {lines.map((l) => (
        <Line
          key={l.key}
          points={l.points}
          stroke={dark ? (l.major ? '#3f424a' : '#2b2d33') : l.major ? '#cfc8b8' : '#e6e1d4'}
          strokeWidth={l.major ? 1.25 : 1}
          strokeScaleEnabled={false}
        />
      ))}
      <Line points={[0, -0.25, 0, 0.25]} stroke={originColor} strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[-0.25, 0, 0.25, 0]} stroke={originColor} strokeWidth={1} strokeScaleEnabled={false} />
    </Layer>
  );
}
