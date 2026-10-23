let renderer = () => {};

export function setRenderer(fn) {
  renderer = fn;
}

export function renderApp() {
  renderer();
}
