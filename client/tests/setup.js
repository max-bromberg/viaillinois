// Test setup file

// jsdom implements no media queries, and the application asks for the dark mode
// preference before it does anything else, so without this every test that
// renders the whole app fails on a browser API rather than on its own subject.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}
