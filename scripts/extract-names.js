// stream in OSM features -> stream out street names
import es from 'event-stream';
import JSONStream from 'JSONStream';

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map(function(feature, cb) {
    const tags = feature.properties.tags;
    const name = tags ? tags.name : undefined;
    if (name) {
      cb(null, name + '\n');
    } else {
      cb();
    }
  }))
  .pipe(process.stdout);
