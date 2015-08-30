// stream in GeoJSON features -> stream out same features, with simplified
// geometries; accepts a tolerance value which affects the amount of
// simplification (in the same metric as the point coordinates)

import es from 'event-stream';
import JSONStream from 'JSONStream';
import turf from 'turf';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const tolerance = argv['tolerance'];

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const simplified = turf.simplify(feature, tolerance, true);
    cb(null, simplified);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);


