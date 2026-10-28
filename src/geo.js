import * as THREE from 'three';
import { geoAlbersUsa, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import { FIPS_TO_ABBR, fipsCode, stateName } from './fips.js';

const MAP_W = 10;
const MAP_H = 6.15;

function ringArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function openRing(ring) {
  if (!ring?.length) return null;
  let points = ring;
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-7) {
    points = points.slice(0, -1);
  }
  const cleaned = [];
  for (const point of points) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 1e-6) cleaned.push(point);
  }
  return cleaned.length >= 3 ? cleaned : null;
}

function projectRing(ring, projection, stats) {
  const parts = [];
  let current = [];
  let prev = null;
  for (const coord of ring) {
    const projected = projection(coord);
    if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) {
      stats.dropped += 1;
      if (current.length) parts.push(current);
      current = [];
      prev = null;
      continue;
    }
    if (prev && Math.hypot(projected[0] - prev[0], projected[1] - prev[1]) > 1.5) {
      if (current.length) parts.push(current);
      current = [];
    }
    current.push(projected);
    prev = projected;
  }
  if (current.length) parts.push(current);
  return parts.map(openRing).filter(Boolean);
}

function projectPolygon(polygon, projection, stats) {
  const outers = projectRing(polygon[0], projection, stats);
  const holes = [];
  for (const hole of polygon.slice(1)) {
    const parts = projectRing(hole, projection, stats);
    if (parts.length === 1) holes.push(parts[0]);
  }
  if (outers.length === 1) return [{ outer: outers[0], holes }];
  return outers.map((outer) => ({ outer, holes: [] }));
}

function toShape(ring, cx, cy) {
  return ring.map(([x, y]) => [x - cx, cy - y]);
}

function extrude(outer, holes) {
  if (ringArea(outer) < 0) outer.reverse();
  if (Math.abs(ringArea(outer)) < 1e-8) return null;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) {
    const cleaned = hole.slice();
    if (ringArea(cleaned) > 0) cleaned.reverse();
    if (cleaned.length >= 3 && Math.abs(ringArea(cleaned)) > 1e-8) {
      shape.holes.push(new THREE.Path(cleaned.map(([x, y]) => new THREE.Vector2(x, y))));
    }
  }
  let geometry;
  try {
    geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 });
  } catch {
    return null;
  }
  const positions = geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i += 1) {
    if (!Number.isFinite(positions[i])) {
      geometry.dispose();
      return null;
    }
  }
  if (!geometry.attributes.position.count) {
    geometry.dispose();
    return null;
  }
  return geometry;
}

function shadeGeometry(geometry) {
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const normals = geometry.attributes.normal;
  const shade = new Float32Array(normals.count);
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i += 1) {
    const up = normals.getY(i);
    const tone = up > 0.72 ? 1 : up < -0.72 ? 0.34 : 0.52;
    shade[i] = tone;
    colors[i * 3] = tone;
    colors[i * 3 + 1] = tone;
    colors[i * 3 + 2] = tone;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return shade;
}

function boundsOf(geometry) {
  const box = geometry.boundingBox;
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
    count: geometry.attributes.position.count,
  };
}

/**
 * Project us-atlas TopoJSON with d3-geo Albers USA and extrude each state.
 * Returns plain geometry data; the scene wraps it in meshes.
 */
export function buildStateGeometries(topo) {
  const collection = feature(topo, topo.objects.states);
  const features = collection.features.filter((item) => FIPS_TO_ABBR[fipsCode(item.id)]);
  const projectedCollection = { type: 'FeatureCollection', features };
  const projection = geoAlbersUsa();
  projection.fitExtent([[0, 0], [MAP_W, MAP_H]], projectedCollection);

  const stats = { dropped: 0, failed: 0, failures: [] };
  const prepared = [];
  for (const item of features) {
    const abbr = FIPS_TO_ABBR[fipsCode(item.id)];
    const [lon] = geoCentroid(item);
    const geometry = item.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : [];
    const projected = [];
    for (const polygon of polygons) projected.push(...projectPolygon(polygon, projection, stats));
    prepared.push({
      abbr,
      name: stateName(abbr, item.properties?.name),
      lon,
      polygons: projected,
    });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const state of prepared) {
    for (const polygon of state.polygons) {
      for (const [x, y] of polygon.outer) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!Number.isFinite(minX) || maxX - minX < 1) {
    throw new Error('Albers USA-projektionen gav ingen brugbar udstrækning');
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const states = [];
  for (const state of prepared) {
    const geometries = [];
    const shades = [];
    for (const polygon of state.polygons) {
      const outer = toShape(polygon.outer, cx, cy);
      const holes = polygon.holes.map((hole) => toShape(hole, cx, cy));
      let geometry = extrude(outer, holes);
      if (!geometry && holes.length) geometry = extrude(outer, []);
      if (!geometry) {
        stats.failed += 1;
        stats.failures.push({ abbr: state.abbr, points: outer.length });
        continue;
      }
      shades.push(shadeGeometry(geometry));
      geometries.push(geometry);
    }
    if (!geometries.length) continue;

    let best = null;
    let footMinX = Infinity;
    let footMaxX = -Infinity;
    let footMinZ = Infinity;
    let footMaxZ = -Infinity;
    geometries.forEach((geometry, index) => {
      const box = boundsOf(geometry);
      footMinX = Math.min(footMinX, box.minX);
      footMaxX = Math.max(footMaxX, box.maxX);
      footMinZ = Math.min(footMinZ, box.minZ);
      footMaxZ = Math.max(footMaxZ, box.maxZ);
      if (!best || box.count > best.count) best = { ...box, index };
    });

    states.push({
      abbr: state.abbr,
      name: state.name,
      lon: state.lon,
      geometries,
      shades,
      anchor: { x: (best.minX + best.maxX) / 2, z: (best.minZ + best.maxZ) / 2 },
      bounds: { minX: footMinX, maxX: footMaxX, minZ: footMinZ, maxZ: footMaxZ },
    });
  }

  let minFX = Infinity;
  let maxFX = -Infinity;
  let minFZ = Infinity;
  let maxFZ = -Infinity;
  for (const state of states) {
    minFX = Math.min(minFX, state.bounds.minX);
    maxFX = Math.max(maxFX, state.bounds.maxX);
    minFZ = Math.min(minFZ, state.bounds.minZ);
    maxFZ = Math.max(maxFZ, state.bounds.maxZ);
  }

  return {
    states,
    stats,
    footprint: {
      minX: minFX,
      maxX: maxFX,
      minZ: minFZ,
      maxZ: maxFZ,
      cx: (minFX + maxFX) / 2,
      cz: (minFZ + maxFZ) / 2,
      width: maxFX - minFX,
      depth: maxFZ - minFZ,
    },
  };
}
