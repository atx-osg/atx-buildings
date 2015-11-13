// stream in CoA GeoJSON address point features and stream out point features
// with OSM address tags properly set
'use strict';

import es from 'event-stream';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import _ from 'lodash';

const argv = minimist(process.argv.slice(2));

const namesPath = argv.names;

// street type abbreviations found in STREET_TYP field, along with expanded
// versions to test for in OSM street names
const streetTypes = {
  'aly': ['alley'],
  'ave': ['avenue'],
  'blvd': ['boulevard'],
  'bnd': ['bend'],
  'br': ['branch'],
  'brg': ['bridge'],
  'cir': ['circle'],
  'cres': ['crescent'],
  'ct': ['court'],
  'ctof': ['cut off', 'cutoff'],
  'cv': ['cove'],
  'dr': ['drive'],
  'expy': ['expressway'],
  'gln': ['glen'],
  'holw': ['hollow'],
  'hwy': ['highway'],
  'ln': ['lane'],
  'loop': ['loop'],
  'park': ['park', 'parks'],
  'pass': ['pass'],
  'path': ['path'],
  'pkwy': ['parkway'],
  'pl': ['place'],
  'plz': ['plaza'],
  'pt': ['point'],
  'race': ['race', 'raceway'],
  'rd': ['road'],
  'row': ['row'],
  'run': ['run'],
  'skwy': ['skyway'],
  'sq': ['square'],
  'st': ['street'],
  'svrd': ['frontage road', 'service road'],
  'ter': ['terrace'],
  'trce': ['trace'],
  'trl': ['trail'],
  'vw': ['view'],
  'walk': ['walk', 'walks'],
  'way': ['way'],
  'xing': ['crossing'],
};

// direction abbreviations found in SUFFIX_DIR and PREFIX_DIR, along with
// expanded versions to test for in OSM street names
const directions = {
  'n': ['north'],
  'nb': ['northbound', 'north bound', 'north'],
  'ne': ['northeast'],
  'neb': ['northeastbound', 'northeast bound', 'northeast'],
  'e': ['east'],
  'eb': ['eastbound', 'east bound', 'east'],
  'se': ['southeast'],
  'seb': ['southeastbound', 'southeast bound', 'southeast'],
  's': ['south'],
  'sb': ['southbound', 'south bound', 'south'],
  'sw': ['southwest'],
  'swb': ['southwestbound', 'southwest bound', 'southwest'],
  'w': ['west'],
  'wb': ['westbound', 'west bound', 'west'],
  'nw': ['northwest'],
  'nwb': ['northwestbound', 'northwest bound', 'northwest'],
};

// common abbreviations found in STREETNAM that should be expanded when
// comparing to OSM names
const expansions = {
  'st': ['saint'],
};

function mapTest(name, map, item, func) {
  const mapped = map[item];
  if (mapped) {
    for (var i = 0, len = mapped.length; i < len; i++) {
      if (func(name.toLowerCase(), mapped[i])) {
        return true;
      }
    }
  } else if (item) {
    console.error(`unmapped direction: ${item}`);
  }

  return false;
}

function normalize(str) {
  return str.toLowerCase().replace(/['\.-]/g, '');
}

function expansionPossibilities(name) {
  let possibilities = [name];
  const normed = normalize(name);

  _.pairs(expansions).forEach(([abbreviation, expansionList]) => {
    expansionList.forEach((expansion) => {
      const index = normed.split(' ').indexOf(abbreviation);
      if (index !== -1) {
        let copy = _.cloneDeep(normed).split(' ');
        copy[index] = expansion;
        possibilities.push(copy.join(' '));
      }
    });
  });

  return possibilities;
}

function matchStreet(name, streetName) {
  const possibilities = expansionPossibilities(streetName);

  for (var i = 0, len = possibilities.length; i < len; i++) {
    const possibility = possibilities[i];
    if (_.includes(normalize(name), normalize(possibility))) {
      return true;
    }
  }
  return false;
}

// find best match for address in an array of OSM names
function bestMatch(address, names) {
  const prefixDirection = address['PREFIX_DIR'] && normalize(address['PREFIX_DIR']);
  const prefixType = address['PRE_TYPE'] && normalize(address['PRE_TYPE']);
  const streetName = address['STREET_NAM'] && normalize(address['STREET_NAM']);
  const streetType = address['STREET_TYP'] && normalize(address['STREET_TYP']);
  const suffixDirection = address['SUFFIX_DIR'] && normalize(address['SUFFIX_DIR']);

  let scores = {};

  names.forEach((name) => {
    let score = 0;

    // test if address.STREET_NAM is in OSM street name
    // (eg. "KOENIG" matches "Koenig Lane")
    if (matchStreet(name, streetName)) {
      matchStreet(name, streetName);
      score += 1000;
    }

    // test if normalized address.STREET_TYP is in OSM street name
    // (eg. "LN" matches "Koenig Lane")
    if (mapTest(name, streetTypes, streetType, _.contains)) {
      score += 100;
    }

    // test if normalized address.PREFIX_DIR is at start of OSM street name
    // (eg. "E" matches "East Sixth Street")
    if (mapTest(name, directions, prefixDirection, _.startsWith)) {
      score += 10;
    }

    // test if normalized address.SUFFIX_DR is at start of OSM street name
    // (eg. "SB" matches "I 35 Southbound")
    if (mapTest(name, directions, suffixDirection, _.endsWith)) {
      score += 1;
    }

    scores[name] = score;
  });

  const sorted = _.sortBy(_.pairs(scores), ([name, score]) => -1 * score);
  if (sorted.length && sorted[0][1] > 1000) {
    if (sorted[0][1] !== sorted[1][1]) {
      return sorted[0][0];
    } else {
      const tied = sorted.filter((pair) => pair[1] === sorted[0][1]);
      const shortest = _.sortBy(tied, (name) => -1 * name.length)[0][0];
      return shortest;
    }
  } else {
    console.error(`skipping CoA address, could not match street name: ${streetName}`);
  }
}


fs.createReadStream(namesPath)
  .pipe(es.split())
  .pipe(es.writeArray((err, allNames) => {
    // filter out empty string, if any
    const names = allNames.filter((name) => name.length);

    process.stdin
      .pipe(JSONStream.parse())
      .pipe(es.map(function(feature, cb) {
        const props = feature.properties;

        let housenumber = props['ADDRESS'];
        if (props['ADDRESS_FR']) {
          housenumber += ' ' + props['ADDRESS_FR'];
        }
        feature.properties['addr:housenumber'] = housenumber;

        const street = bestMatch(feature.properties, names);
        if (street) {
          feature.properties['addr:street'] = street;
          cb(null, feature);
        } else {
          // filter out if we can't determine street name
          cb();
        }
      }))
      .pipe(JSONStream.stringify(false))
      .pipe(process.stdout)
      .on('error', (err) => {
        console.log(err);
      });
  }));
