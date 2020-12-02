'use strict';


var assert = require('assert');
var yaml   = require('js-yaml');
var schema = yaml.DEFAULT_SCHEMA.extend(require('../').all);


describe('Alias nodes', function () {
  // Resolving of an alias node should result the resolved and contructed value of the anchored node
  it("JavaScript-specific objects (JS-YAML's own extension)", function () {
    var actual = yaml.load('[&1 !!js/function "function sum(a, b) { return a + b }", *1]', { schema })[1];

    assert.strictEqual(Object.prototype.toString.call(actual), '[object Function]');
    assert.strictEqual(actual(10, 5), 15);
  });
});


describe('Resolving explicit tags on empty nodes', function () {
  it('!!js/function', function () {
    assert.throws(function () { yaml.load('!!js/function', { schema }); }, yaml.YAMLException);
  });

  it('!!js/regexp', function () {
    assert.throws(function () { yaml.load('!!js/regexp', { schema }); }, yaml.YAMLException);
  });

  it('!!js/undefined', function () {
    // Fetch undefined from an array to reduce chance that undefined is returned because of another bug
    assert.strictEqual(yaml.load('- !!js/undefined', { schema })[0], undefined);
  });
});


describe('Security', function () {
  let badThings = [];

  global.makeBadThing = function (thing) {
    badThings.push(thing);
  };

  it('Function constructor must not allow to execute any code while parsing.', function () {
    let contents = `
tests:
  - !!js/function 'makeBadThing("BAD THING 1")'
  - !!js/function 'function () { makeBadThing("BAD THING 2") }.call(this)'
`;

    assert.throws(function () { yaml.load(contents, { schema }); }, yaml.YAMLException);
    assert.deepEqual(badThings, []);
  });
});


describe('Dumper', function () {
  it('construct-javascript-function', function () {
    /*
let sample = `
- !!js/function 'function () { return 42 }'
- !!js/function '() => { return 72 }'
- !!js/function '() => 23'
- !!js/function 'function (x, y) { return x + y; } '
- !!js/function |
  function (foo) {
    var result = 'There is my ' + foo + ' at the table.';

    return {
      first: 42,
      second: 'sum',
      third: result
    };
  }
`;*/

    let expected = [
      function () {
        return 42;
      },
      function () {
        return 72;
      },
      function () {
        return 23;
      },
      function (x, y) {
        return x + y;
      },
      function (foo) {
        var result = 'There is my ' + foo + ' at the table.';

        return {
          first: 42,
          second: 'sum',
          third: result
        };
      }
    ];

    let serialized = yaml.dump(expected, { schema });
    let actual     = yaml.load(serialized, { schema });

    assert.strictEqual(actual.length, expected.length);

    assert.strictEqual(
      actual[0](),
      expected[0]());

    assert.strictEqual(
      actual[1](10, 20),
      expected[1](10, 20));

    assert.deepEqual(
      actual[2]('book'),
      expected[2]('book'));
  });


  it('construct-javascript-regexp', function () {
    /*
let sample = `
- !!js/regexp /fo{2,}/
- !!js/regexp /[wv]orlds?/g
- !!js/regexp /^spec/im
- !!js/regexp '/ba+r/'
- !!js/regexp '/ba.z+/gim'
`;*/

    let data = [
      /fo{2,}/,
      /[wv]orlds?/g,
      /^spec/im,
      /ba+r/,
      /ba.z+/gim
    ];

    let serialized   = yaml.dump(data, { schema });
    let deserialized = yaml.load(serialized, { schema });

    assert.deepEqual(deserialized, data);
  });


  it('construct-javascript-undefined', function () {
    /*
let sample = `
- !!js/undefined
- !!js/undefined ''
- !!js/undefined 'foobar'
- !!js/undefined hello world
`;*/

    let data = [
      undefined,
      undefined,
      undefined,
      undefined
    ];

    let serialized   = yaml.dump(data, { schema });
    let deserialized = yaml.load(serialized, { schema });

    assert.deepEqual(deserialized, data);
  });
});


describe('Issues', function () {
  it('RegExps should be properly closed', function () {
    assert.throws(function () { yaml.load('!!js/regexp /fo'); });
    assert.throws(function () { yaml.load('!!js/regexp /fo/q'); });
    assert.throws(function () { yaml.load('!!js/regexp /fo/giii'); });

    // https://github.com/nodeca/js-yaml/issues/172
    var regexp = yaml.load('!!js/regexp /fo/g/g', { schema });
    assert.ok(regexp instanceof RegExp);
    var regexpStr = regexp.toString();
    // Accept the old (slightly incorrect) V8, as well as the new V8 result
    assert.strictEqual(regexpStr, '/fo\\/g/g');
  });

  describe('Folding', function () {
    // Simplistic check for folded style header at the end of the first line.
    function isFolded(s) {
      return s.search(/^[^\n]*>[\-+]?\n/) !== -1;
    }

    // Runs one cycle of dump then load. Also checks that dumped result is folded.
    function loadAfterDump(input) {
      var output = yaml.dump(input, { schema });
      if (!isFolded(output)) {
        assert.fail(output, '(first line should end with >-, >, or >+)',
          'Test cannot continue: folded style was expected');
      }
      return yaml.load(output, { schema });
    }


    it('Folding Javascript functions preserves content', function () {
      // Tests loading a function, then tests dumping and loading.
      function assertFunctionPreserved(functionString, inputs, expectedOutputs, name) {
        var f = yaml.load('!<tag:yaml.org,2002:js/function> "' + functionString + '"', { schema });
        assert.strictEqual(typeof f, 'function', name + ' should be loaded as a function');

        assert.deepEqual(inputs.map(f), expectedOutputs,
          name + ' should be loaded correctly');

        assert.deepEqual(inputs.map(loadAfterDump(f)), expectedOutputs,
          name + ' should be dumped then loaded correctly');
      }

      // Backslash-escapes double quotes and newlines.
      function escapeFnString(s) {
        return s.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      }

      var fnFactorial = escapeFnString(
        'function factorial(start) {\n' +
        '// Non-indented long line to trigger folding: throw new Error("bad fold"); throw new Error("bad fold");\n' +
        '  var extra_long_string = "try to trick the dumper into creating a syntax error by folding this string";\n' +
        '  var extra_long_string1 = "try to trick the dumper into creating a syntax error by folding this string";\n' +
        'var extra_long_string2 = "this long string is fine to fold because it is not more-indented";\n' +
        'function fac (n) {\n' +
          'if (n <= 0) return 1; return n * fac(n-1); // here is a long line that can be safely folded\n' +
        '}\n' +
        'return fac(start);\n' +
        '}\n');

      var fnCollatz = escapeFnString(
        'function collatz(start) {\n' +
        '  var longString = "another long more-indented string that will cause a syntax error if folded";\n' +
        'var result = [];\n' +
        'function go(n) { result.push(n); return (n === 1) ? result : go(n % 2 === 0  ?  n / 2  :  3 * n + 1); }\n' +
        'return go(start >= 1 ? Math.floor(start) : 1);\n' +
        '}');

      var fnRot13 = escapeFnString(
        // single-line function.
        // note the "{return" is so the line doesn't start with a space.
        'function rot13(s) {return String.fromCharCode.apply(null, s.split("")' +
        '.map(function (c) { return ((c.toLowerCase().charCodeAt(0) - 97) + 13) % 26 + 97; })); }'
      );

      assertFunctionPreserved(fnFactorial,
        [ 0, 1, 2, 3,   5,    7,        12 ],
        [ 1, 1, 2, 6, 120, 5040, 479001600 ],
        'Factorial function');

      assertFunctionPreserved(fnCollatz,
        [ 6, 19 ],
        [ [ 6, 3, 10, 5, 16, 8, 4, 2, 1 ],
          [ 19, 58, 29, 88, 44, 22, 11, 34, 17, 52, 26, 13, 40, 20, 10, 5, 16, 8, 4, 2, 1 ]
        ], 'Hailstone sequence function');

      assertFunctionPreserved(fnRot13,
        [ 'nggnpxngqnja', 'orjnergurvqrfbsznepu' ],
        [ 'attackatdawn', 'bewaretheidesofmarch' ],
        'ROT13');
    });

    it('Folding long regular expressions preserves content', function () {
      // Tests loading a regex, then tests dumping and loading.
      function assertRegexPreserved(string, stringPattern) {
        assert.strictEqual(string.search(stringPattern), 0,
          'The test itself has errors: regex did not match its string');

        var loadedRe = yaml.load('"key": !<tag:yaml.org,2002:js/regexp> /'
          + stringPattern + '/', { schema }).key;
        assert.strictEqual(loadedRe.exec(string)[0], string,
          'Loaded regex did not match the original string');

        assert.strictEqual(
          loadAfterDump({ key: new RegExp(stringPattern) }).key.exec(string)[0],
          string,
          'Dumping and loading did not preserve the regex');
      }

      var s1        =  'This is a very long regular expression. ' +
        'It\'s so long that it is longer than 80 characters per line.';
      var s1Pattern = '^This is a very long regular expression\\. ' +
        'It\'s so long that it is longer than 80 characters per line\\.$';

      assertRegexPreserved(s1, s1Pattern);
    });

    it('Strings are folded as usual', function () {
      var doc = yaml.load('"key": |\n  It is just a very long string. It should be folded because the dumper ' +
        'fold lines that are exceed limit in 80 characters per line.', { schema });
      var dump = yaml.dump(doc);
      assert(Math.max.apply(null, dump.split('\n').map(function (str) { return str.length; })) <= 80);
    });
  });

  describe('Keys', function () {
    it('Should not execute code when object with toString property is used as a key', function () {
      var contents = `
{ toString: !<tag:yaml.org,2002:js/function> 'function (){throw new Error("code execution")}' } : key
`;
      var data = yaml.load(contents, { schema });

      assert.deepEqual(data, { '[object Object]': 'key' });
    });

    it('Should not execute code when object with __proto__ property is used as a key', function () {
      var contents = `
{ __proto__: { toString: !<tag:yaml.org,2002:js/function> 'function(){throw new Error("code execution")}' } } : key
`;
      var data = yaml.load(contents, { schema });

      assert.deepEqual(data, { '[object Object]': 'key' });
    });

    it('Should not execute code when object inside array is used as a key', function () {
      var contents = `
? [
    123,
    { toString: !<tag:yaml.org,2002:js/function> 'function (){throw new Error("code execution")}' }
] : key
`;
      var data = yaml.load(contents, { schema });

      assert.deepEqual(data, { '123,[object Object]': 'key' });
    });

    // this test does not guarantee in any way proper handling of date objects,
    // it just keeps old behavior whenever possible
    it('Should leave non-plain objects as is', function () {
      var contents = `
{ !<tag:yaml.org,2002:timestamp> '2019-04-05T12:00:43.467Z': 123 }
`;
      var data = yaml.load(contents, { schema });

      assert.deepEqual(Object.keys(data).length, 1);
      assert(/2019/.test(Object.keys(data)[0]));
    });
  });
});
