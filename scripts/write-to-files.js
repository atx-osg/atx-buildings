// stream in GeoJSON features and write them to individual files, named after a
// feature property

import es from 'event-stream';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';


const argv = minimist(process.argv.slice(2));
const propertyName = argv['propertyName'];
const pre = argv['pre'];
const clean = argv['clean'];

process.stdin
  .pipe(JSONStream.parse())
  .pipe(es.map((data, cb) => {
    const property = data.properties[propertyName];

    // delete properties if featureCollection - was just added to pass group
    // name downstream
    if (clean && data.type === 'FeatureCollection') {
      delete data.properties;
    }
    const filepath = `${pre}${property}.json`;
    const msg = `file written: ${filepath}\n`;

    fs.writeFile(filepath, JSON.stringify(data), (error, data) => {
      if (error) throw error;
      cb(null, msg);
    });
  }))
  .pipe(process.stdout);
