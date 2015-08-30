// stream in feature collections -> stream out an OSM XML file
import es from 'event-stream';
import JSONStream from 'JSONStream';
import osm_geojson from 'osm-and-geojson';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const xml = osm_geojson.geojson2osm(feature);
    cb(null, xml);
  }))
  .pipe(process.stdout);

