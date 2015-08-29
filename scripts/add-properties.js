// takes a json string, stream in GeoJSON features and stream out features with
// the json merged into the properties

import es from 'event-stream';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import merge from 'lodash.merge';


const argv = minimist(process.argv.slice(2));
const mergeObject = JSON.parse(argv['_'][0]);

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    feature.properties = merge(mergeObject, feature.properties);
    cb(null, feature);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);

