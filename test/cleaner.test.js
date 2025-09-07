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

// Should preserve spacing when removing ellipsis by default
assert.deepStrictEqual(
  cleanOutsideCode('Hello...World', true),
  { text: 'Hello World', removed: 3 }
);

// Should allow removing ellipsis without inserting space
assert.deepStrictEqual(
  cleanOutsideCode('Hello...World', true, false),
  { text: 'HelloWorld', removed: 3 }
);

// Should remove trailing space when not preserving space
assert.deepStrictEqual(
  cleanOutsideCode('Hello... World', true, false),
  { text: 'HelloWorld', removed: 4 }
);

// Should remove ellipsis before quotes or asterisks without adding space
['"', "'", '*'].forEach(sym => {
  assert.deepStrictEqual(
    cleanOutsideCode(`Test...${sym}`, true),
    { text: `Test${sym}`, removed: 3 }
  );
  assert.deepStrictEqual(
    cleanOutsideCode(`Test...${sym}`, true, false),
    { text: `Test${sym}`, removed: 3 }
  );
});

console.log('Tests passed');

