// take a feature collection of buildings (maskFeatures), then stream in address
// points (targetFeatures) and stream to stdout only address points that do not
// uniquely identify a building - the other addresses will be streamed to stderr
// as a feature collection

import es from 'event-stream';
import extent from 'geojson-extent';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import turf from 'turf';
import rbush from 'rbush';

const argv = minimist(process.argv.slice(2));

const maskFeaturesPath = argv['mask'];


class Index {
  constructor (maskFeatures) {
    this.tree = rbush(16);
    const loadArrays = maskFeatures.features.map((feature) => {
      feature.properties = feature.properties || {};
      feature.properties._hits = [];
      return extent(feature).concat({'feature': feature});
    });
    this.tree.load(loadArrays);
    this.misses = [];
  }

  find_hit (feature) {
    let found;

    // get bbox matches (fast)
    const matches = this.tree.search(extent(feature.geometry));

    // loop through bbox matches, doing more thorough intersection test (slow)
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

    return undefined;
  }

  register (feature) {
    let intersection_feature = this.find_hit(feature);
    if (intersection_feature) {
      intersection_feature.properties._hits.push(feature);
    } else {
      this.misses.push(feature);
    }
  }

  // call after all addresses have been registered to get only the addresses
  // that are unique to a building
  uniques () {
    let uniqueAddresses = [];

    this.tree.all().forEach((treeObj) => {
      const feature = treeObj[4].feature;

      if (feature.properties._hits.length == 1) {
        uniqueAddresses.push(feature.properties._hits[0]);
      }
    });
    return uniqueAddresses;
  }

  // call after all addresses have been registered to get only the addresses
  // that are not unique to a building or did not hit intersect a building at
  // all
  nonuniques () {
    let nonuniqueAddresses = [];

    this.misses.forEach((miss) => {
      nonuniqueAddresses.push(miss);
    });

    this.tree.all().forEach((treeObj) => {
      const feature = treeObj[4].feature;

      if (feature.properties._hits.length > 1) {
        nonuniqueAddresses = nonuniqueAddresses.concat(feature.properties._hits);
      }
    });

    return nonuniqueAddresses;
  }
}


fs.createReadStream(maskFeaturesPath)
  .pipe(JSONStream.parse())
  .pipe(es.writeArray((err, maskFeatures) => {
    let index;
    if(maskFeatures[0]) {
      index = new Index(maskFeatures[0]);
    }

    process.stdin
      .pipe(JSONStream.parse())
      .pipe(es.map((feature, cb) => {
        index.register(feature);
        cb(null);
      }))
      .on('end', () => {
        // write addresses for direct import as points to stdout
        es.readArray(index.nonuniques())
          .pipe(JSONStream.stringify(false))
          .pipe(process.stdout);

        // write single addresses for merging w/buildings to stderr
        es.readArray(index.uniques())
          .pipe(es.writeArray(function(err, features) {
            const fc = turf.featurecollection(features);
            es.readArray([fc])
              .pipe(JSONStream.stringify(false))
              .pipe(process.stderr);
          }));
      })
      .pipe(process.stdout);
  }));
