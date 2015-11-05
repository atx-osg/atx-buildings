// takes a json string, stream in GeoJSON features and stream out features with
// the json merged into the properties

import es from 'event-stream';
import JSONStream from 'JSONStream';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const blockGroup = feature.properties.GEOID;
    const remoteControlBase = `http://localhost:8111`;
    const importBase = `${remoteControlBase}/import?url=https://github.com/wilsaj/atx-buildings/raw/with-import-data/osm/${blockGroup}`;
    feature.properties.import_comment = `<p>import links:</p>
- <a href="${importBase}/buildings-to-import.osm">buildings-to-conflate</a>
- <a href="${importBase}/addresses-to-import.osm">addresses-to-import</a>
- <a href="${importBase}/addresses-to-conflate.osm">addresses-to-conflate</a>
</li>
`;

    cb(null, feature);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);


