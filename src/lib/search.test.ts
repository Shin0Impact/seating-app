import { describe, expect, it } from 'vitest';
import { matches, normalize } from './search';

describe('normalize', () => {
  it('unifies Arabic letter variants and drops diacritics', () => {
    expect(normalize('أحمد')).toBe(normalize('احمد'));
    expect(normalize('إبراهيم')).toBe(normalize('ابراهيم'));
    expect(normalize('فاطمة')).toBe(normalize('فاطمه'));
    expect(normalize('مصطفى')).toBe(normalize('مصطفي'));
    expect(normalize('مُحَمَّد')).toBe(normalize('محمد'));
  });
  it('lowercases Latin and converts Arabic-Indic digits', () => {
    expect(normalize('  Sarah   KHAN ')).toBe('sarah khan');
    expect(normalize('طاولة ٣')).toBe(normalize('طاولة 3'));
    expect(normalize('٣')).toBe('3');
  });
});

describe('matches', () => {
  it('matches first or last name only, in any order', () => {
    expect(matches('محمد', 'محمد أحمد خليل')).toBe(true);
    expect(matches('خليل احمد', 'محمد أحمد خليل')).toBe(true);
    expect(matches('سعيد', 'محمد أحمد خليل')).toBe(false);
  });
  it('searches across several fields and accepts an empty query', () => {
    expect(matches('عائلة', 'سامي', 'عائلة الخوري')).toBe(true);
    expect(matches('', 'anyone')).toBe(true);
  });
});
