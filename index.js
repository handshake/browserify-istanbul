var through = require('through');
var minimatch = require('minimatch');

var defaultIgnore = ['**/node_modules/**', '**/bower_components/**', '**/test/**', '**/tests/**', '**/*.json'];

function shouldIgnoreFile(file, options) {
  var ignore = options.defaultIgnore === false ? [] : defaultIgnore;
  ignore = ignore.concat(options.ignore || []);

  return ignore.some(function(pattern) {
    return minimatch(file, pattern, options.minimatchOptions);
  });
}

module.exports = function(options, extraOptions) {
  var file;
  options = options || {};

  if (typeof options === 'string') {
    file = options;
    options = extraOptions || {};
    return transform(options, file);
  }

  return transform.bind(null, options);
};

function transform(options, file) {
  if (shouldIgnoreFile(file, options))
    return through();

  var instrumenterConfig = options.instrumenterConfig || {};

  if (options.sourceMap) {
    instrumenterConfig = Object.assign({}, options.instrumenterConfig || {});
    instrumenterConfig.codeGenerationOptions = Object.assign({},
      (options.instrumenterConfig || {}).codeGenerationOptions || {});
    instrumenterConfig.codeGenerationOptions.sourceMap = file;
    instrumenterConfig.codeGenerationOptions.sourceMapWithCode = true;
  }

  var instrumenter = new (options.instrumenter || require('istanbul')).Instrumenter(instrumenterConfig);

  var data = '';
  return through(function(buf) {
    data += buf;
  }, function() {
    var self = this;
    if (options.sourceMap) {
      instrumenterConfig.codeGenerationOptions.sourceContent = data;
    }
    instrumenter.instrument(data, file, function(err, code) {
      if (!err) {
        if (options.sourceMap === 'inline') {
          // TODO: we have 2 sourcemaps from the instrumenter
          // - `_babelMap` is from compiling the es2015 code
          // - `lastSourceMap` is from instrumenting the compiled code
          // Given these 2 sourcemaps, we should be able to compose those
          // to get a sourcemap from the original source to the instrumented code

          // // Stuff that didn't actually work, but might provide a starting point:
          // var SourceMapGenerator = instrumenter.lastSourceMap().constructor;
          // var SourceMapConsumer = instrumenter._babelMap.constructor;
          // var sourceMap = SourceMapGenerator.fromSourceMap(instrumenter._babelMap);
          // console.log(sourceMap.toJSON());
          // sourceMap.applySourceMap(new SourceMapConsumer(instrumenter.lastSourceMap().toJSON()), file);
          // console.log(sourceMap.toJSON());
          // console.log(instrumenter._babelMap);
          // instrumenter.lastSourceMap().applySourceMap(instrumenter._babelMap);

          var sourceMap = instrumenter.lastSourceMap();
          // console.log(sourceMap.toJSON());
          var inlineSourceMap = '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' +
            new Buffer(sourceMap.toString()).toString('base64');
          self.queue(code + inlineSourceMap);
        } else {
          self.queue(code);
        }
      } else {
        self.emit('error', err);
      }
      self.queue(null);
    });
  });
}
