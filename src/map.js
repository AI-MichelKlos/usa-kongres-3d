/** Flat SVG map. States are buttons: hover, tap and keyboard all select them. */

const UNCALLED = '#e4d9c8';

export function createMap(svg, { onHover, onPick, onPollBadges } = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paths = new Map();
  const order = [];
  let look = null;
  let selected = null;
  let hovered = null;
  let revealed = new Set();
  let timer = null;
  let seq = 0;

  const stage = svg.parentElement;
  let marks = stage?.querySelector('#state-marks');
  if (stage && !marks) {
    marks = document.createElement('div');
    marks.id = 'state-marks';
    stage.appendChild(marks);
  }

  function paint(abbr) {
    const path = paths.get(abbr);
    const target = look?.[abbr];
    if (!path || !target) return;
    const show = revealed.has(abbr);
    path.style.fill = show ? target.color : UNCALLED;
    path.classList.toggle('is-selected', abbr === selected);
    path.classList.toggle('is-hover', abbr === hovered && show);
    if (target.label) path.setAttribute('aria-label', target.label);
  }

  function paintAll() {
    for (const abbr of paths.keys()) paint(abbr);
    layoutChrome();
  }

  function point(x, y) {
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const ctm = svg.getScreenCTM();
    if (!ctm || !stage) return null;
    const mapped = pt.matrixTransform(ctm);
    const origin = stage.getBoundingClientRect();
    return { x: mapped.x - origin.left, y: mapped.y - origin.top };
  }

  function layoutChrome() {
    if (!marks || !look) return;
    marks.replaceChildren();
    const badges = [];
    for (const spec of order) {
      const target = look[spec.abbr];
      if (!target || !revealed.has(spec.abbr)) continue;
      const at = point(spec.anchor.x, spec.anchor.y);
      if (!at) continue;
      if (target.marker) {
        const mark = document.createElement('span');
        mark.className = 'u-mark';
        mark.textContent = 'U';
        mark.style.left = `${at.x}px`;
        mark.style.top = `${at.y}px`;
        marks.appendChild(mark);
      }
      if (target.poll) {
        const box = paths.get(spec.abbr)?.getBoundingClientRect();
        const origin = stage.getBoundingClientRect();
        badges.push({
          abbr: spec.abbr,
          x: box ? box.left - origin.left + box.width / 2 : at.x,
          y: box ? box.top - origin.top + Math.min(18, box.height * 0.35) : at.y,
        });
      }
    }
    onPollBadges?.(badges);
  }

  function bind(path, abbr) {
    path.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = abbr;
      paint(abbr);
      onHover?.(abbr, event);
    });
    path.addEventListener('pointermove', (event) => {
      if (hovered !== abbr || event.pointerType !== 'mouse') return;
      onHover?.(abbr, event);
    });
    path.addEventListener('pointerleave', (event) => {
      if (hovered !== abbr) return;
      hovered = null;
      paint(abbr);
      onHover?.(null, event);
    });
    path.addEventListener('focus', () => {
      hovered = abbr;
      paint(abbr);
    });
    path.addEventListener('blur', () => {
      if (hovered === abbr) hovered = null;
      paint(abbr);
    });
    const choose = () => onPick?.(abbr);
    path.addEventListener('click', choose);
    path.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      choose();
    });
  }

  function setGeometries(built) {
    svg.setAttribute('viewBox', built.viewBox);
    svg.replaceChildren();
    paths.clear();
    order.length = 0;
    const sorted = [...built.states].sort((a, b) => a.abbr.localeCompare(b.abbr, 'en'));
    for (const spec of sorted) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', spec.d);
      path.classList.add('state');
      path.dataset.abbr = spec.abbr;
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', spec.name);
      svg.appendChild(path);
      paths.set(spec.abbr, path);
      order.push(spec);
      bind(path, spec.abbr);
    }
    revealed = new Set(built.states.map((state) => state.abbr));
  }

  function applyLook(next, { intro = false } = {}) {
    look = next;
    window.clearTimeout(timer);
    timer = null;
    seq += 1;
    revealed = new Set(paths.keys());
    if (intro && !reduced) {
      revealed = new Set();
      paintAll();
      const id = seq;
      const list = [...paths.keys()];
      let index = 0;
      const step = () => {
        if (id !== seq) return;
        const abbr = list[index];
        if (abbr) revealed.add(abbr);
        index += 1;
        if (index < list.length) timer = window.setTimeout(step, 8);
        else paintAll();
        paint(abbr);
      };
      timer = window.setTimeout(step, 20);
      return;
    }
    paintAll();
  }

  function eastToWest() {
    return [...order].sort((a, b) => b.lon - a.lon || a.abbr.localeCompare(b.abbr)).map((state) => state.abbr);
  }

  function playValgnat(hooks) {
    if (!look) return;
    window.clearTimeout(timer);
    const id = ++seq;
    const list = eastToWest();
    if (reduced) {
      revealed = new Set(list);
      paintAll();
      hooks?.onProgress?.(list.length, list.length);
      hooks?.onDone?.();
      return;
    }
    revealed = new Set();
    paintAll();
    hooks?.onProgress?.(0, list.length);
    let index = 0;
    const step = () => {
      if (id !== seq) return;
      const abbr = list[index];
      revealed.add(abbr);
      paint(abbr);
      index += 1;
      hooks?.onProgress?.(index, list.length);
      if (index >= list.length) {
        layoutChrome();
        hooks?.onDone?.();
        return;
      }
      timer = window.setTimeout(step, 68);
    };
    timer = window.setTimeout(step, 280);
  }

  function stopValgnat() {
    seq += 1;
    window.clearTimeout(timer);
    timer = null;
    revealed = new Set(paths.keys());
    paintAll();
  }

  function setSelected(abbr) {
    const previous = selected;
    selected = abbr;
    if (previous) paint(previous);
    if (abbr) paint(abbr);
  }

  const observer = new ResizeObserver(() => layoutChrome());
  if (stage) observer.observe(stage);

  return {
    setGeometries,
    setLook: applyLook,
    animateLook: (next) => applyLook(next),
    setSelected,
    playValgnat,
    stopValgnat,
    clearMascots() {},
    frameAll() {},
    focus() {},
    setBottomInset() {},
    resize: layoutChrome,
  };
}
