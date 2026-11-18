import { JSDOM } from 'jsdom';

// A DOM for the tests. Import it first, before anything that reads `document`.
const { window } = new JSDOM('<!doctype html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) Object.defineProperty(globalThis, key, { value: window[key] });
}
