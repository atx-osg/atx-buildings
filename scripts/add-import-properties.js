// takes a json string, stream in GeoJSON features and stream out features with
// the json merged into the properties

import es from 'event-stream';
import JSONStream from 'JSONStream';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const blockGroup = feature.properties.GEOID;
    feature.properties.import_url = `https://github.com/atx-osg/atx-buildings/raw/master/xml/${blockGroup}-buildings.xml`;
    cb(null, feature);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);


