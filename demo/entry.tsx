import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-arabic';
import '../src/app/globals.css';
import Editor from '../src/components/Editor';
import { sampleLayout } from './sample';
import { GUESTS_CSV } from './guests';
import { parseCsv, guessMapping, buildGuests } from '../src/lib/csv';
import type { TableEl } from '../src/lib/layout';

try {
  // The first load of this version swaps in the real hall plan and the converted guest list.
  if (!localStorage.getItem('seating-demo-seed-v4')) {
    const next = sampleLayout();
    const rows = parseCsv(GUESTS_CSV);
    const { mapping } = guessMapping(rows[0]);
    next.guests = buildGuests(rows.slice(1), mapping, [], next.elements.filter((e): e is TableEl => e.kind === 'table')).guests;
    localStorage.setItem('seating-layout-v1', JSON.stringify(next));
    localStorage.setItem('seating-demo-seed-v4', '1');
  }
} catch {
  /* storage unavailable: the editor starts empty */
}
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';
createRoot(document.getElementById('root')!).render(<Editor />);
