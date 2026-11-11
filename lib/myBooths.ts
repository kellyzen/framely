// Remembers booths you created on this device, so you can find your edit links again.
export interface MyBooth {
  id: string;
  key: string;
  title: string;
  updatedAt: string;
}

const KEY = 'framely:my-booths';

export function getMyBooths(): MyBooth[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MyBooth[]) : [];
  } catch {
    return [];
  }
}

export function rememberBooth(b: MyBooth) {
  try {
    const list = getMyBooths().filter((x) => x.id !== b.id);
    list.unshift(b);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    // ignore
  }
}

export function forgetBooth(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(getMyBooths().filter((x) => x.id !== id)));
  } catch {
    // ignore
  }
}
