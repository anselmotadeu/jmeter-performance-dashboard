require('@testing-library/jest-dom');

if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
}

if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn(() => 'blob:mock');
if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = jest.fn();
