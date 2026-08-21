import type { SaleKind } from '../data/policy';

const KEY = 'kia-tigers-personal-helper-v1';

export interface StoredPrefs {
  watchIds: string[];
  kinds: SaleKind[];
  autoOpen: boolean;
  notify: boolean;
  seatFirst: string;
  seatSecond: string;
  qty: number;
  checklist: Record<string, boolean>;
}

const DEFAULTS: StoredPrefs = {
  watchIds: [],
  kinds: ['general'],
  autoOpen: true,
  notify: true,
  seatFirst: '응원특별석',
  seatSecond: 'K8',
  qty: 2,
  checklist: {},
};

export function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, checklist: {} };
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      ...DEFAULTS,
      ...parsed,
      kinds: parsed.kinds?.length ? parsed.kinds : DEFAULTS.kinds,
      checklist: parsed.checklist ?? {},
    };
  } catch {
    return { ...DEFAULTS, checklist: {} };
  }
}

export function savePrefs(prefs: StoredPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
