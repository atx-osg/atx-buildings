// stream in individual features -> stream out a featurecollection
import es from 'event-stream';
import JSONStream from 'JSONStream';
import turf from 'turf';


process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.writeArray(function(err, features) {
    const fc = turf.featurecollection(features);
    es.readArray([fc])
      .pipe(JSONStream.stringify(false))
      .pipe(process.stdout);
  }));
