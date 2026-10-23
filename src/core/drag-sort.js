const DRAG_THRESHOLD = 4;
const EDGE_SCROLL = 52;

function findScrollBox(node) {
  let element = node?.parentElement || null;
  while (element) {
    const style = getComputedStyle(element);
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return element;
    element = element.parentElement;
  }
  return null;
}

function isBeforePointer(event, rect, mode) {
  if (mode === 'grid') {
    const middleY = rect.top + rect.height / 2;
    const sameRow = Math.abs(event.clientY - middleY) < rect.height * 0.28;
    return sameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < middleY;
  }
  return event.clientY < rect.top + rect.height / 2;
}

/**
 * 通过拖拽手柄重排容器内的元素。
 * 元素需要带 data-sort-id，手柄需要带 data-drag-handle。
 */
export function enableDragSort(container, { mode = 'list', itemSelector = '[data-sort-id]', handleSelector = '[data-drag-handle]', onEnd } = {}) {
  if (!container) return () => {};
  let item = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let active = false;
  let scrollBox = null;

  const move = event => {
    if (!item || event.pointerId !== pointerId) return;
    if (!active) {
      if (Math.abs(event.clientX - startX) < DRAG_THRESHOLD && Math.abs(event.clientY - startY) < DRAG_THRESHOLD) return;
      active = true;
      item.classList.add('is-sorting');
      document.body.classList.add('is-sorting');
      scrollBox = findScrollBox(item);
    }
    event.preventDefault();

    if (scrollBox) {
      const box = scrollBox.getBoundingClientRect();
      if (event.clientY < box.top + EDGE_SCROLL) scrollBox.scrollTop -= 14;
      else if (event.clientY > box.bottom - EDGE_SCROLL) scrollBox.scrollTop += 14;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(itemSelector);
    if (!target || target === item || !container.contains(target) || target.parentElement !== item.parentElement) return;
    const before = isBeforePointer(event, target.getBoundingClientRect(), mode);
    if (before) {
      if (target.previousElementSibling === item) return;
      target.before(item);
    } else {
      if (target.nextElementSibling === item) return;
      target.after(item);
    }
  };

  const end = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', end);
    document.removeEventListener('pointercancel', end);
    const finished = active;
    const moved = item;
    item?.classList.remove('is-sorting');
    document.body.classList.remove('is-sorting');
    item = null;
    pointerId = null;
    active = false;
    scrollBox = null;
    if (finished && moved) {
      const ids = [...container.querySelectorAll(itemSelector)].map(node => node.dataset.sortId);
      onEnd?.(ids);
    }
  };

  const down = event => {
    if (!(event.target instanceof Element)) return;
    const handle = event.target.closest(handleSelector);
    if (!handle || !container.contains(handle)) return;
    const node = handle.closest(itemSelector);
    if (!node || !container.contains(node)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    item = node;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    active = false;
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  };

  container.addEventListener('pointerdown', down);
  return () => {
    container.removeEventListener('pointerdown', down);
    end();
  };
}
