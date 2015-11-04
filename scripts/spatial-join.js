// take a feature collection of features (joinFeatures), then stream in
// polygons (targetFeatures) and stream out the same feature, but with a
// property from the joinFeature attached to it

import es from 'event-stream';
import extent from 'geojson-extent';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import turf from 'turf';
import rbush from 'rbush';

const argv = minimist(process.argv.slice(2));

const joinFeaturesPath = argv['join'];

let properties = argv['property'];
if(!Array.isArray(properties)) {
  properties = [properties];
}

class Index {
  constructor (joinFeatures) {
    this.tree = rbush(16);
    const loadArrays = joinFeatures.features.map((feature) => {
      return extent(feature).concat({'feature': feature});
    });
    this.tree.load(loadArrays);
  }

  find (feature) {
    let found;
    const matches = this.tree.search(extent(feature.geometry));
    if (matches.length === 1) {
      // only one bbox match, we can assume this is a valid intersection
      // NOTE: assumption holds only if joinFeatures completely covers targets
      return matches[0][4].feature;
    }
    // more than one bbox match, so loop through until you find one that legit
    // spatially intersects
    for (var i = 0, len = matches.length; i < len; i++) {
      const match = matches[i];
      let intersection; 
      try {
        intersection = turf.intersect(feature.geometry, match[4].feature.geometry);
      } catch (e) {
        throw `invalid topology found: ${feature.id}`;
      }
      if (intersection !== undefined) {
        return match[4].feature;
      }
    }
  }
}


fs.createReadStream(joinFeaturesPath)
  .pipe(JSONStream.parse())
  .pipe(es.writeArray((err, joinFeatures) => {
    let index = new Index(joinFeatures[0]);

    process.stdin
      .pipe(JSONStream.parse())
      .pipe(es.map((feature, cb) => {
        const match = index.find(feature);
        if (match) {
          properties.forEach((propertyName) => {
            feature.properties[propertyName] = match.properties[propertyName];
          });
        }
        cb(null, feature);
      }))
      .pipe(JSONStream.stringify(false))
      .pipe(process.stdout)
      .on('error', (err) => {
        console.log(err);
      });
  }));
