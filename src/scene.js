import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS } from './analyze.js';
import { spriteSvg } from './mascots.js';

const UNCALLED = COLORS.uncalled;
const WHITE = new THREE.Color('#ffffff');

function loadSpriteTexture(kind) {
  const url = URL.createObjectURL(new Blob([spriteSvg(kind)], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      canvas.getContext('2d').drawImage(image, 0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      URL.revokeObjectURL(url);
      resolve(texture);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function easeOutBack(t) {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function makeBadgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e6b34d';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2a1d05';
  ctx.stroke();
  ctx.fillStyle = '#2a1d05';
  ctx.font = '700 72px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('U', 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grd = ctx.createRadialGradient(256, 256, 30, 256, 256, 255);
  grd.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  grd.addColorStop(0.6, 'rgba(0, 0, 0, 0.16)');
  grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export async function createScene(canvas, { onHover, onPick } = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 90);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.maxPolarAngle = 1.15;
  controls.minPolarAngle = 0.18;
  controls.minDistance = 1.15;
  controls.maxDistance = 40;
  controls.zoomSpeed = 0.72;
  controls.rotateSpeed = coarse ? 0.75 : 0.68;
  controls.screenSpacePanning = false;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  canvas.style.touchAction = 'none';

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const byAbbr = new Map();
  const pickables = [];
  const tmp = new THREE.Vector3();
  const paintColor = new THREE.Color();
  let footprint = null;
  let userMoved = false;
  let currentLook = null;
  let seq = null;
  let seqN = 0;
  let flying = null;
  let selected = null;
  let hovered = null;
  let running = true;
  let bottomInset = 0;
  const spriteTextures = {
    D: await loadSpriteTexture('D'),
    R: await loadSpriteTexture('R'),
    I: await loadSpriteTexture('I'),
  };
  const spriteMaterials = {};
  for (const kind of ['D', 'R', 'I']) {
    if (!spriteTextures[kind]) continue;
    spriteMaterials[kind] = new THREE.SpriteMaterial({
      map: spriteTextures[kind],
      transparent: true,
      depthWrite: false,
    });
  }
  const badgeMap = makeBadgeTexture();
  const sharedMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

  function applyViewport() {
    const pr = renderer.getPixelRatio();
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, Math.max(1, Math.floor(cssW * pr)), Math.max(1, Math.floor(cssH * pr)));
    camera.aspect = cssW / Math.max(cssH, 1);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const stage = canvas.parentElement;
    const width = stage?.clientWidth || 0;
    const height = stage?.clientHeight || 0;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    applyViewport();
    if (footprint && !userMoved && !flying && !selected) placeHome(false);
  }

  function setBottomInset(px) {
    bottomInset = Math.max(0, px || 0);
    if (canvas.clientWidth) resize();
  }

  function writeColors(state, color) {
    for (let part = 0; part < state.meshes.length; part += 1) {
      const geometry = state.meshes[part].geometry;
      const shade = state.shades[part];
      const array = geometry.attributes.color.array;
      for (let i = 0; i < shade.length; i += 1) {
        const tone = shade[i];
        array[i * 3] = color.r * tone;
        array[i * 3 + 1] = color.g * tone;
        array[i * 3 + 2] = color.b * tone;
      }
      geometry.attributes.color.needsUpdate = true;
    }
  }

  function applyVisual(state) {
    const height = Math.max(0.02, state.height);
    for (const mesh of state.meshes) {
      if (mesh.scale.y !== height) mesh.scale.y = height;
    }
    state.group.position.y = state.lift;
    state.marker.visible = state.showMarker && state.mascotScale < 0.2;
    state.marker.position.set(state.anchor.x, height + 0.015, state.anchor.z);
    placeMascots(state, height);

    const key = `${state.color.r.toFixed(4)}|${state.color.g.toFixed(4)}|${state.color.b.toFixed(4)}|${state.abbr === selected}|${state.abbr === hovered}|${state.showMarker}`;
    if (key === state.paintKey) return;
    state.paintKey = key;
    paintColor.copy(state.color);
    if (state.abbr === selected) paintColor.lerp(WHITE, 0.18);
    else if (state.abbr === hovered) paintColor.lerp(WHITE, 0.1);
    writeColors(state, paintColor);
  }

  function instant(state, hex, height, marker) {
    state.color.set(hex);
    state.height = height;
    state.showMarker = !!marker;
    state.tween = null;
    state.paintKey = '';
    applyVisual(state);
  }

  function setGeometries(built) {
    footprint = built.footprint;
    for (const spec of built.states) {
      const group = new THREE.Group();
      const meshes = [];
      spec.geometries.forEach((geometry) => {
        const mesh = new THREE.Mesh(geometry, sharedMaterial);
        mesh.userData.abbr = spec.abbr;
        group.add(mesh);
        meshes.push(mesh);
        pickables.push(mesh);
      });
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({
        map: badgeMap,
        transparent: true,
        depthWrite: false,
      }));
      marker.center.set(0.5, 0);
      marker.visible = false;
      marker.raycast = () => {};
      group.add(marker);
      const sprites = {};
      for (const kind of ['D', 'R', 'I']) {
        if (!spriteMaterials[kind]) continue;
        const sprite = new THREE.Sprite(spriteMaterials[kind]);
        sprite.center.set(0.5, 0);
        sprite.visible = false;
        sprite.raycast = () => {};
        group.add(sprite);
        sprites[kind] = sprite;
      }
      scene.add(group);
      byAbbr.set(spec.abbr, {
        abbr: spec.abbr,
        lon: spec.lon,
        group,
        meshes,
        shades: spec.shades,
        marker,
        sprites,
        anchor: spec.anchor,
        color: new THREE.Color(UNCALLED),
        height: 0.03,
        lift: 0,
        showMarker: false,
        mascotKind: null,
        mascotScale: 0,
        tween: null,
        paintKey: '',
      });
    }

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(footprint.width * 1.5, footprint.depth * 1.65),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(footprint.cx, -0.045, footprint.cz);
    shadow.raycast = () => {};
    scene.add(shadow);
    resize();
    placeHome(false);
  }

  function homePose() {
    const { width, depth, aimX, aimZ } = footprint;
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(camera.aspect || 1.2, 0.6);
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * aspect;
    const dist = Math.max((depth * 0.78) / tanV, (width * 0.56) / tanH) * 0.92;
    return {
      pos: new THREE.Vector3(aimX, dist * 0.74, aimZ + dist * 0.5),
      target: new THREE.Vector3(aimX, 0.18, aimZ),
    };
  }

  function placeHome(animate) {
    if (!footprint) return;
    const { pos, target } = homePose();
    if (!animate || reduced) {
      flying = null;
      controls.enabled = true;
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      return;
    }
    flyTo(pos, target, 750);
  }

  function flyTo(pos, target, ms) {
    if (reduced) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      flying = null;
      controls.enabled = true;
      return;
    }
    flying = {
      fromPos: camera.position.clone(),
      toPos: pos.clone(),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      t0: performance.now(),
      ms,
    };
    controls.enabled = false;
  }

  function focus(abbr) {
    userMoved = true;
    const state = byAbbr.get(abbr);
    if (!state) return;
    const box = new THREE.Box3();
    for (const mesh of state.meshes) box.expandByObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, 0.45);
    const fov = (camera.fov * Math.PI) / 180;
    const cover = bottomInset / Math.max(canvas.clientHeight, 1);
    const ax = state.anchor.x;
    const az = state.anchor.z;
    if (cover > 0.08) {
      const span = Math.max(radius * 2.2, 1.5);
      const dist = span / Math.tan(fov / 2);
      const target = new THREE.Vector3(ax, 0, az + span * 0.08);
      flyTo(new THREE.Vector3(ax, dist * 0.96, target.z + dist * 0.1), target, 700);
      return;
    }
    const dist = Math.min(10, Math.max(1.8, (radius / Math.tan(fov / 2)) * 1.15));
    const target = new THREE.Vector3(ax, Math.min(center.y * 0.25, 0.4), az);
    flyTo(
      new THREE.Vector3(ax, target.y + dist * 0.62, az + dist * 0.55),
      target,
      900,
    );
  }

  function eastToWest() {
    return [...byAbbr.values()]
      .sort((a, b) => b.lon - a.lon || a.abbr.localeCompare(b.abbr))
      .map((state) => state.abbr);
  }

  function setLook(look, { intro = false } = {}) {
    currentLook = look;
    seq = null;
    const order = eastToWest();
    order.forEach((abbr, index) => {
      const state = byAbbr.get(abbr);
      const target = look[abbr];
      if (!state || !target) return;
      if (intro && !reduced) {
        state.color.set(target.color);
        state.height = 0.03;
        state.showMarker = false;
        state.tween = {
          t0: performance.now() + index * 16,
          dur: 700,
          fromC: state.color.clone(),
          toC: new THREE.Color(target.color),
          fromH: 0.03,
          toH: target.height,
          marker: !!target.marker,
          ease: 'back',
        };
      } else {
        instant(state, target.color, target.height, target.marker);
      }
    });
  }

  function animateLook(look) {
    currentLook = look;
    seq = null;
    for (const [abbr, target] of Object.entries(look)) {
      const state = byAbbr.get(abbr);
      if (!state) continue;
      if (reduced) {
        instant(state, target.color, target.height, target.marker);
        continue;
      }
      state.tween = {
        t0: performance.now(),
        dur: 520,
        fromC: state.color.clone(),
        toC: new THREE.Color(target.color),
        fromH: state.height,
        toH: target.height,
        marker: !!target.marker,
        ease: 'cubic',
      };
    }
  }

  function playValgnat(hooks) {
    if (!currentLook) return;
    const id = ++seqN;
    const order = eastToWest();
    if (reduced) {
      for (const abbr of order) {
        const state = byAbbr.get(abbr);
        const target = currentLook[abbr];
        instant(state, target.color, target.height, target.marker);
        state.mascotKind = target.mascot || null;
        state.mascotScale = target.mascot ? 1 : 0;
      }
      hooks?.onProgress?.(order.length, order.length);
      hooks?.onDone?.();
      return;
    }
    seq = { id, total: order.length, done: 0, hooks, finished: false };
    order.forEach((abbr, index) => {
      const state = byAbbr.get(abbr);
      const target = currentLook[abbr];
      state.color.set(UNCALLED);
      state.height = 0.045;
      state.showMarker = false;
      state.paintKey = '';
      state.tween = {
        id,
        t0: performance.now() + 460 + index * 86,
        dur: 340,
        fromC: new THREE.Color(UNCALLED),
        toC: new THREE.Color(target.color),
        fromH: 0.045,
        toH: target.height,
        marker: !!target.marker,
        ease: 'back',
        count: true,
        revealMascot: true,
      };
    });
    hooks?.onProgress?.(0, order.length);
  }

  function stopValgnat() {
    seq = null;
    clearMascots();
    if (!currentLook) return;
    for (const [abbr, target] of Object.entries(currentLook)) {
      const state = byAbbr.get(abbr);
      if (state) instant(state, target.color, target.height, target.marker);
    }
  }

  function setSelected(abbr) {
    if (selected === abbr) return;
    selected = abbr;
    if (selected && byAbbr.get(selected)) byAbbr.get(selected).paintKey = '';
    for (const state of byAbbr.values()) state.paintKey = '';
  }

  function updateTweens(now) {
    let finishedNow = 0;
    for (const state of byAbbr.values()) {
      const tween = state.tween;
      if (!tween || now < tween.t0) continue;
      const u = Math.min(1, (now - tween.t0) / tween.dur);
      const shaped = tween.ease === 'back' ? easeOutBack(u) : easeOutCubic(u);
      state.color.copy(tween.fromC).lerp(tween.toC, Math.min(1, u));
      state.height = tween.fromH + (tween.toH - tween.fromH) * shaped;
      state.showMarker = tween.marker ? u > 0.7 : false;
      if (tween.revealMascot) {
        state.mascotKind = currentLook?.[state.abbr]?.mascot || null;
        state.mascotScale = reduced ? 1 : Math.min(1.18, easeOutBack(u));
      }
      if (u >= 1) {
        state.color.copy(tween.toC);
        state.height = tween.toH;
        state.showMarker = !!tween.marker;
        if (tween.count && seq && tween.id === seq.id) finishedNow += 1;
        state.tween = null;
      }
    }
    if (seq && finishedNow) {
      seq.done += finishedNow;
      seq.hooks?.onProgress?.(seq.done, seq.total);
      if (seq.done >= seq.total && !seq.finished) {
        seq.finished = true;
        const hooks = seq.hooks;
        seq = null;
        hooks?.onDone?.();
      }
    }
  }

  function updateLifts() {
    for (const state of byAbbr.values()) {
      const target = state.abbr === selected ? 0.1 : state.abbr === hovered ? 0.04 : 0;
      if (reduced) state.lift = target;
      else state.lift += (target - state.lift) * 0.18;
      if (Math.abs(state.lift - target) < 0.001) state.lift = target;
    }
  }

  function placeMascots(state, height) {
    const show = state.mascotScale > 0.02 && state.mascotKind;
    const y = height + 0.04;
    const kinds = state.mascotKind === 'split' ? ['D', 'R'] : state.mascotKind ? [state.mascotKind] : [];
    for (const kind of ['D', 'R', 'I']) {
      const sprite = state.sprites[kind];
      if (!sprite) continue;
      const visible = show && kinds.includes(kind);
      sprite.visible = visible;
      if (!visible) continue;
      const offset = state.mascotKind === 'split' ? (kind === 'D' ? -0.22 : 0.22) : 0;
      sprite.position.set(state.anchor.x + offset, y, state.anchor.z);
      const viewHeight = Math.max(1, (canvas.clientHeight || 1) - bottomInset);
      const dist = camera.position.distanceTo(sprite.getWorldPosition(tmp));
      const vFov = (camera.fov * Math.PI) / 180;
      const worldPerPx = (2 * Math.tan(vFov / 2) * dist) / viewHeight;
      const size = Math.min(0.48, Math.max(0.16, worldPerPx * 26)) * Math.min(state.mascotScale, 1.12);
      sprite.scale.set(size, size, 1);
    }
  }

  function clearMascots() {
    for (const state of byAbbr.values()) {
      state.mascotKind = null;
      state.mascotScale = 0;
    }
  }

  function updateMarkerScale() {
    const viewHeight = canvas.clientHeight || 1;
    const vFov = (camera.fov * Math.PI) / 180;
    for (const state of byAbbr.values()) {
      if (!state.marker.visible) continue;
      const dist = camera.position.distanceTo(state.marker.getWorldPosition(tmp));
      const worldPerPx = (2 * Math.tan(vFov / 2) * dist) / viewHeight;
      const size = Math.min(0.5, Math.max(0.16, worldPerPx * 30));
      state.marker.scale.set(size, size, 1);
    }
  }

  function pickAt(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit?.object.userData.abbr || null;
  }

  let down = null;
  controls.addEventListener('start', () => { userMoved = true; });
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    down = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const abbr = pickAt(event);
    if (abbr !== hovered) {
      hovered = abbr;
      if (hovered && byAbbr.get(hovered)) byAbbr.get(hovered).paintKey = '';
      for (const state of byAbbr.values()) state.paintKey = '';
    }
    if (!down) canvas.style.cursor = abbr ? 'pointer' : 'grab';
    onHover?.(abbr, event);
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    for (const state of byAbbr.values()) state.paintKey = '';
    canvas.style.cursor = 'grab';
    onHover?.(null);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!down || !event.isPrimary) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    down = null;
    canvas.style.cursor = 'grab';
    if (dx * dx + dy * dy > 49) return;
    const abbr = pickAt(event);
    if (abbr) onPick?.(abbr);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('touchmove', (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  const resizeObserver = new ResizeObserver(() => resize());
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    updateTweens(now);
    updateLifts();
    if (flying) {
      const u = Math.min(1, (now - flying.t0) / flying.ms);
      const eased = easeInOutCubic(u);
      camera.position.lerpVectors(flying.fromPos, flying.toPos, eased);
      controls.target.lerpVectors(flying.fromTarget, flying.toTarget, eased);
      if (u >= 1) {
        flying = null;
        controls.enabled = true;
      }
    } else {
      controls.update();
    }
    for (const state of byAbbr.values()) applyVisual(state);
    updateMarkerScale();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    setGeometries,
    setLook,
    animateLook,
    playValgnat,
    stopValgnat,
    focus,
    frameAll() { userMoved = false; placeHome(true); },
    setSelected,
    setBottomInset,
    clearMascots,
    resize,
    dispose() {
      running = false;
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      badgeMap.dispose();
      sharedMaterial.dispose();
    },
  };
}
