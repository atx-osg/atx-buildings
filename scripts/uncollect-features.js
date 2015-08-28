// stream in feature collections -> stream out individual features

import JSONStream from 'JSONStream';

process.stdin
  .pipe(JSONStream.parse('features.*'))
  .pipe(JSONStream.stringify(false))
  .pipe(process.stdout);
