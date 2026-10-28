import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS } from './analyze.js';

const UNCALLED = COLORS.uncalled;
const WHITE = new THREE.Color('#ffffff');

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

export function createScene(canvas, { onHover, onPick } = {}) {
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
  controls.minDistance = 1.25;
  controls.maxDistance = 18;
  controls.zoomSpeed = 0.72;
  controls.rotateSpeed = coarse ? 0.55 : 0.68;
  controls.screenSpacePanning = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const byAbbr = new Map();
  const pickables = [];
  const tmp = new THREE.Vector3();
  const paintColor = new THREE.Color();
  let footprint = null;
  let currentLook = null;
  let seq = null;
  let seqN = 0;
  let flying = null;
  let selected = null;
  let hovered = null;
  let running = true;
  const badgeMap = makeBadgeTexture();
  const sharedMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

  function resize() {
    const stage = canvas.parentElement;
    const width = stage?.clientWidth || 0;
    const height = stage?.clientHeight || 0;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
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
    state.marker.visible = state.showMarker;
    state.marker.position.set(state.anchor.x, height + 0.015, state.anchor.z);

    const key = `${state.color.r.toFixed(4)}|${state.color.g.toFixed(4)}|${state.color.b.toFixed(4)}|${state.abbr === selected}|${state.abbr === hovered}|${state.showMarker}`;
    if (key === state.paintKey) return;
    state.paintKey = key;
    paintColor.copy(state.color);
    if (state.abbr === selected) paintColor.lerp(WHITE, 0.18);
    else if (state.abbr === hovered) paintColor.lerp(WHITE, 0.1);
    writeColors(state, paintColor);
    if (state.abbr === selected) state.edgeMat.color.setHex(0xf6e2a8);
    else if (state.abbr === hovered) state.edgeMat.color.setHex(0xfffaf2);
    else if (state.showMarker) state.edgeMat.color.setHex(0xe6b34d);
    else state.edgeMat.color.setHex(0x140e0c);
    state.edgeMat.opacity = state.abbr === selected || state.showMarker ? 0.95 : 0.45;
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
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x140e0c,
        transparent: true,
        opacity: 0.45,
      });
      const meshes = [];
      spec.geometries.forEach((geometry) => {
        const mesh = new THREE.Mesh(geometry, sharedMaterial);
        mesh.userData.abbr = spec.abbr;
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 32), edgeMat));
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
      scene.add(group);
      byAbbr.set(spec.abbr, {
        abbr: spec.abbr,
        lon: spec.lon,
        group,
        meshes,
        shades: spec.shades,
        edgeMat,
        marker,
        anchor: spec.anchor,
        color: new THREE.Color(UNCALLED),
        height: 0.03,
        lift: 0,
        showMarker: false,
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
    const { cx, cz, width, depth } = footprint;
    const fov = (camera.fov * Math.PI) / 180;
    const radius = 0.5 * Math.max(width, depth);
    const dist = (radius / Math.tan(fov / 2)) * 1.34;
    return {
      pos: new THREE.Vector3(cx, dist * 0.72, cz + dist * 0.7),
      target: new THREE.Vector3(cx, 0.1, cz),
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
    const state = byAbbr.get(abbr);
    if (!state) return;
    const box = new THREE.Box3();
    for (const mesh of state.meshes) box.expandByObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, size.y, 0.4) * 0.78;
    const fov = (camera.fov * Math.PI) / 180;
    const dist = Math.min(10, Math.max(1.65, (radius / Math.tan(fov / 2)) * 1.5));
    const target = new THREE.Vector3(center.x, Math.min(center.y * 0.3, 0.5), center.z);
    flyTo(
      new THREE.Vector3(center.x, target.y + dist * 0.56, center.z + dist * 0.66),
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
        const target = currentLook[abbr];
        instant(byAbbr.get(abbr), target.color, target.height, target.marker);
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
      };
    });
    hooks?.onProgress?.(0, order.length);
  }

  function stopValgnat() {
    seq = null;
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

  function updateMarkerScale() {
    const viewHeight = canvas.clientHeight || 1;
    const vFov = (camera.fov * Math.PI) / 180;
    for (const state of byAbbr.values()) {
      if (!state.marker.visible) continue;
      const dist = camera.position.distanceTo(state.marker.getWorldPosition(tmp));
      const worldPerPx = (2 * Math.tan(vFov / 2) * dist) / viewHeight;
      const size = Math.min(0.46, Math.max(0.15, worldPerPx * 24));
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
    frameAll() { placeHome(true); },
    setSelected,
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
