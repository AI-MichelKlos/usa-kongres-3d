/** Original, simple mascots. Not party logos. */

const DONKEY = `
  <path fill="currentColor" d="M7 18.5c-2.6.6-3.8 2.8-2.2 4.1 1.2-1.6 2.6-2 3.6-1.8-.4 1.6.2 3.2 1.6 4.2V28h3.1v-2.2c1.2.8 3.2.6 4.2-.4V28h3.1v-3.4c2.2-.8 4.4-2.8 4.8-5.4 1.8.2 3.6-.6 4.2-2 .6-1.4-.2-2.6-1.8-2.8l-2.2-.4c.2-1.6-.2-3.4-1.4-4.6l1.2-5.2-2.4-.8-1.2 4.4c-.8-.4-1.8-.4-2.6 0l-.6-5.4-2.4.2.8 5.6c-2.2.2-4.2 1.6-5.2 3.6-1.2-.4-2.6-.2-3.4.6z"/>
`;

const ELEPHANT = `
  <path fill="currentColor" d="M8.2 16.2c-2.4 1.2-3.6 3.6-2.8 6.2.6 2.2 2.2 3.8 4.2 4.4-.2 1.2.2 2.6 1.4 3.2V28h3.2v-2.4c1 .6 2.4.6 3.4 0V28h3.2v-2.2c1.2.2 2.6-.2 3.4-1.2 2.4-.4 4.6-2.2 5.4-4.6 1.6.6 3.4 0 4-1.6.6-1.6-.4-3-2-3.4-1.2-3.2-4-5.6-7.6-6.2-1.2-2.4-3.6-4-6.4-4-3.2 0-5.8 1.8-7.2 4.4-1.6-.2-3.2.2-4.2 1.6z"/>
  <path d="M6.4 20.6c-.8 2.4-.2 5 1.8 6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
`;

const BODY = { D: DONKEY, R: ELEPHANT };

const LABEL = {
  D: 'Æsel, demokraternes maskot',
  R: 'Elefant, republikanernes maskot',
};

export function mascotSvg(kind) {
  const label = LABEL[kind] || '';
  return `<svg class="mascot mascot-${kind}" viewBox="0 0 32 32" role="img" aria-label="${label}">${BODY[kind] || ''}</svg>`;
}
