// takes a json string for properties to match, stream in GeoJSON features and
// stream out only matching features

import es from 'event-stream';
import JSONStream from 'JSONStream';
import minimist from 'minimist';


const argv = minimist(process.argv.slice(2));
const filterObj = JSON.parse(argv['_'][0]);

function matchesFilter (feature) {
  const keys = Object.keys(filterObj)
  for (var i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    if (filterObj[key] !== feature.properties[key]) {
      return false
    }
  }
  return true;
};

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    if (matchesFilter(feature)) {
      cb(null, feature);
    } else {
      cb(null);
    }
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);


