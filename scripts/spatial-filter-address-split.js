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
import buffer from 'turf-buffer';
import rbush from 'rbush';
import _ from 'lodash';

const argv = minimist(process.argv.slice(2));

const maskFeaturesPath = argv['mask'];


class Index {
  constructor (maskFeatures) {
    this.tree = rbush(16);
    const loadArrays = maskFeatures.features.map((feature) => {
      feature.properties = feature.properties || {};
      feature.properties._hits = [];
      feature.properties._nearHits = [];
      return extent(feature).concat({'feature': feature});
    });
    this.tree.load(loadArrays);
    this.misses = [];
  }

  findHit (feature) {
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
    let intersectionFeature = this.findHit(feature);
    if (intersectionFeature) {
      intersectionFeature.properties._hits.push(feature);
    } else {
      const buffered = buffer(feature, 3, 'meters');

      let nearFeature = this.findHit(buffered);
      if (nearFeature) {
        nearFeature.properties._nearHits.push(feature);
      }

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

  // run through the buildings and check for near misses
  // - if there is no hit, but a single near miss then move it to be on top of
  //   the building
  // - if there is a single hit and any near misses, then invalidate the hit (so
  //   both points will be directly imported)
  //
  // IMPORTANT: should be only called after all points have been register()'d
  processNearMisses () {
    this.tree.all().forEach((treeObj) => {
      const feature = treeObj[4].feature;

      // if there are no hits, and only one near hit, place the point on the
      // building and call it a hit
      if (feature.properties._hits.length === 0 && feature.properties._nearHits.length === 1) {
        let pt = feature.properties._nearHits[0];
        if (pt.geometry.type !== 'Point') {
          return;
        }

        // remove from this.misses since this is no longer a miss
        const idx = _.findIndex(this.misses, (obj) => {
          return obj.geometry.coordinates[0] === pt.geometry.coordinates[0] && obj.geometry.coordinates[1] === pt.geometry.coordinates[1];
        });
        this.misses.splice(idx, 1);

        // pick a point somewhere on the feature to be the new address pt
        // representation - this is okay because the point will be merged into
        // the building later
        let ptOnFeature = turf.pointOnSurface(feature);
        ptOnFeature.properties = pt.properties;
        feature.properties._hits = [ptOnFeature];
        feature.properties._nearHits = [];
      }

      // invalidate a hit if there are any near misses close by
      if (feature.properties._hits.length === 1 && feature.properties._nearHits.length !== 0 ) {
        this.misses.push(feature.properties._hits[0]);
        feature.properties._hits = [];
      };
    });
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
        index.processNearMisses();

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
