// takes a json string, stream in GeoJSON features and stream out features with
// the json merged into the properties

import es from 'event-stream';
import extent from 'geojson-extent';
import JSONStream from 'JSONStream';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const bbox = extent(feature.geometry);

    const blockGroup = feature.properties.GEOID;
    const remoteControlBase = `http://localhost:8111`;
    const importBase = `${remoteControlBase}/import?new_layer=true&url=https://github.com/wilsaj/atx-buildings/raw/with-import-data/osm/${blockGroup}`;
    const loadAndZoomURL = `${remoteControlBase}/load_and_zoom?left=${bbox[0]}&bottom=${bbox[1]}&right=${bbox[2]}&top=${bbox[3]}`;

    feature.properties.import_comment = `<p>import links:</p>
- <a target="_blank" href="${loadAndZoomURL}">load existing OSM data</a>
- <a target="_blank" href="${importBase}/buildings-to-import.osm">buildings-to-conflate</a>
- <a target="_blank" href="${importBase}/addresses-to-import.osm">addresses-to-import</a>
- <a target="_blank" href="${importBase}/addresses-to-conflate.osm">addresses-to-conflate</a>
</li>
`;

    cb(null, feature);
  }))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);


