// stream in CoA GeoJSON address point features and stream out point features
// with OSM address tags properly set

import es from 'event-stream';
import JSONStream from 'JSONStream';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const props = feature.properties;

    feature.properties['addr:country'] = 'US';
    feature.properties['addr:state'] = 'TX';
    feature.properties['addr:housenumber'] = props['ADDRESS'];

    const addressProps = [
      'PREFIX_DIR',
      'PRE_TYPE',
      'STREET_NAM',
      'STREET_TYP',
      'SUFFIX_DIR'
    ]
    const pieces = addressProps
      .filter((addressProp) => props[addressProp])
      .map((addressProp) => props[addressProp]);
    feature.properties['addr:street'] = pieces.join(' ');

    cb(null, feature);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);

