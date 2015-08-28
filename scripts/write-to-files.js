// stream in GeoJSON features and write them to individual files, named after a
// feature property

import es from 'event-stream';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';


var argv = minimist(process.argv.slice(2));
var propertyName = argv['propertyName'];
var pre = argv['pre'];

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map((feature, cb) => {
    const property = feature.properties[propertyName];
    const filepath = `${pre}${property}.json`;
    const msg = `file written: ${filepath}\n`;

    fs.writeFile(filepath, JSON.stringify(feature), (error, data) => {
      if (error) throw error;
      cb(null, msg);
    });
  }))
  .pipe(process.stdout);
