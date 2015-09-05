// takes a json string, stream in GeoJSON features and stream out features with
// the json merged into the properties

import query_overpass from 'query-overpass';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const type = argv['type'];
const bbox = argv['bbox'];

const query = `
[out:json][timeout:25];
(
  way[${type}](${bbox});
);
out body;
>;
out skel qt;
`;


query_overpass(query, (error, data) => {
  if (error) {
    console.error(error.message);
  }

  console.log(JSON.stringify(data));
});
