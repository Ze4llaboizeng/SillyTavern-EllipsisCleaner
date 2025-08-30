const assert = require('assert');

const ext = require('../index.js');
const { cleanOutsideCode } = ext.cleaner;

// Should not strip triple dots in numeric ranges when treatTwoDots is false
assert.deepStrictEqual(
  cleanOutsideCode('1...2', false),
  { text: '1...2', removed: 0 }
);

// Should strip ellipsis outside code blocks and inline code should remain
const sample = 'Hello... world `code...` ```block...```';
assert.deepStrictEqual(
  cleanOutsideCode(sample, true),
  { text: 'Hello world `code...` ```block...```', removed: 3 }
);

console.log('Tests passed');

