// stream in GeoJSON building features and stream out features with height
// conversion to feet (or non-existant if no height)

import es from 'event-stream';
import JSONStream from 'JSONStream';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const original = feature.properties['MAX_HEIGHT'];
    // negative values indicate no available height
    if (original > 0) {
      const meters = original * 0.3048;
      const rounded = meters.toFixed(2);
      feature.properties['height'] = rounded;
    }
    cb(null, feature);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);
