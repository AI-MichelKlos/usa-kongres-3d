import { geoAlbersUsa, geoCentroid, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { FIPS_TO_ABBR, fipsCode, stateName } from './fips.js';

const WIDTH = 960;
const HEIGHT = 600;

/**
 * Project us-atlas with d3-geo Albers USA, including the Alaska and Hawaii insets.
 * Each state is one SVG path in a shared viewBox.
 */
export function buildStateGeometries(topo) {
  const collection = feature(topo, topo.objects.states);
  const features = collection.features.filter((item) => FIPS_TO_ABBR[fipsCode(item.id)]);
  const projected = { type: 'FeatureCollection', features };
  const projection = geoAlbersUsa().fitExtent([[12, 12], [WIDTH - 12, HEIGHT - 12]], projected);
  const path = geoPath(projection);
  const stats = { dropped: 0, failed: 0, failures: [] };
  const states = [];

  for (const item of features) {
    const abbr = FIPS_TO_ABBR[fipsCode(item.id)];
    const d = path(item);
    if (!d) {
      stats.failed += 1;
      stats.failures.push({ abbr });
      continue;
    }
    const [lon] = geoCentroid(item);
    const [x, y] = path.centroid(item);
    const [[x0, y0], [x1, y1]] = path.bounds(item);
    states.push({
      abbr,
      name: stateName(abbr, item.properties?.name),
      lon,
      d,
      anchor: { x, y },
      bounds: { minX: x0, maxX: x1, minY: y0, maxY: y1 },
    });
  }

  return {
    states,
    stats,
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    width: WIDTH,
    height: HEIGHT,
  };
}
