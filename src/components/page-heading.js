import { icon } from '../core/icons.js';

export function renderPageHeading({ eyebrow, title, description, image = '', imageClass = '', playAction = '' }) {
  return `<section class="inner-heading ${image ? 'collection-heading' : ''}">${image ? `<img class="${imageClass}" decoding="async" src="${image}" alt="" />` : ''}<div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${playAction ? `<button class="round-play large-play" data-action="${playAction}" aria-label="播放全部">${icon('play', 21)}</button>` : ''}</section>`;
}
