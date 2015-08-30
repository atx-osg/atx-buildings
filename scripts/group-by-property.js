// stream in GeoJSON features stream out feature groups of features grouped
// based on a shared property

import es from 'event-stream';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import turf from 'turf';


const argv = minimist(process.argv.slice(2));
const propertyName = argv['propertyName'];
const drop = argv['drop'];

let groups = {};

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.through(
    function write(feature) {
      const property = feature.properties[propertyName];
      if (!groups[property]) {
        groups[property] = [];
      }
      if (drop) {
        delete feature.properties[propertyName];
      }
      groups[property].push(feature);
    }, function end() {
      Object.keys(groups).forEach((property) => {
        const fc = turf.featurecollection(groups[property]);
        // not strictly forbidden, but a stepping outside of GeoJSON spec for a
        // second to add group property to featureCollection so it can
        // be written to file downstream (properties will be dropped)
        fc.properties = {};
        fc.properties[propertyName] = property;
        this.emit('data', fc);
      });

      this.emit('end');
    }
  ))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);
