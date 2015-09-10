// stream in CoA GeoJSON address point features and stream out point features
// with OSM address tags properly set

import es from 'event-stream';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import _ from 'lodash';

const argv = minimist(process.argv.slice(2));

const namesPath = argv['names'];

const streetTypes = {
  'av': ['avenue'],
  'ave': ['avenue'],
  'blvd': ['boulevard'],
  'ct': ['court'],
  'dr': ['drive'],
  'ln': ['lane'],
  'rd': ['road'],
  'st': ['street'],
  'svrd': ['frontage road', 'service road'],
  'pl': ['place'],
}

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
}


function mapTest(name, map, item, func) {
  const mapped = map[item];
  if (mapped) {
    for (var i = 0, len = mapped.length; i < len; i++) {
      if(func(name.toLowerCase(), mapped[i])) {
        return true;
      }
    }
  } else if (item) {
    console.error(`unmapped direction: ${item}`);
  }

  return false;
}

// find best match for address in an array of OSM names
function bestMatch(address, names) {
  const prefixDirection = address['PREFIX_DIR'] && address['PREFIX_DIR'].toLowerCase();
  const prefixType = address['PRE_TYPE'] && address['PRE_TYPE'].toLowerCase();
  const streetName = address['STREET_NAM'] && address['STREET_NAM'].toLowerCase();
  const streetType = address['STREET_TYP'] && address['STREET_TYP'].toLowerCase();
  const suffixDirection = address['SUFFIX_DIR'] && address['SUFFIX_DIR'].toLowerCase();

  let scores = {};

  names.forEach((name) => {
    let score = 0;

    if (_.includes(name.toLowerCase(), streetName)) {
      score += 1000;
    }

    if(mapTest(name, streetTypes, streetType, _.contains)) {
      score += 100;
    }

    if(mapTest(name, directions, prefixDirection, _.startsWith)) {
      score += 10;
    }

    if(mapTest(name, directions, suffixDirection, _.endsWith)) {
      score += 1;
    }

    scores[name] = score;
  });

  const sorted = _.sortBy(_.pairs(scores), ([name, score]) => -1 * score);
  if (sorted.length && sorted[0][1] > 1000) {
    if (sorted[0][1] !== sorted[1][1]) {
      console.error(`winner: ${sorted[0]}`);
      return sorted[0][0];
    } else {
      const tied = sorted.filter((pair) => pair[1] === sorted[0][1]);
      console.error(`tie: ${tied.join(' | ')}`);
    }
  }
}


fs.createReadStream(namesPath)
  .pipe(es.split())
  .pipe(es.writeArray((err, names) => {
    //process.stdin
    fs.createReadStream('json/blockgroups/484530015034-addresses-raw.json')
      .pipe(JSONStream.parse())
      .pipe(es.map(function(feature, cb) {
        const props = feature.properties;

        feature.properties['addr:country'] = 'US';
        feature.properties['addr:state'] = 'TX';

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
