(function(module) {
  var content_template, destination, docco_styles, docco_template, dox, dox_template, ensure_directory, exec, ext, file_exists, fs, generate_source_html, get_language, gravatar, highlight, highlight_end, highlight_start, jade, l, languages, parse, parse_markdown, path, relative_base, showdown, spawn, walk, write_file, _, _ref;

  var generate_documentation = function(source, context, callback) {
    var escapeHTML = require('escape-html');
    return fs.readFile(source, "utf-8", function(error, code) {
      var sections;
      if (error) throw error;
      sections = parse(source, code);
      var section;
      for (var i = 0, _len = sections.length; i < _len; i++) {
        section = sections[i];
        section.code_html = '<pre class="source-block"><code>' + escapeHTML(section.code_text) + '</code></pre>'; //highlight_start + fragments[i] + highlight_end;
        section.docs_html = showdown.makeHtml(section.docs_text);
      }
      generate_source_html(source, context, sections);
      callback();
    });
  };

  parse = function(source, code) {
    var code_text, docs_text, has_code, in_multi, language, line, lines, multi_accum, parsed, save, sections, _i, _len;
    lines = code.split('\n');
    sections = [];
    language = get_language(source);
    has_code = docs_text = code_text = '';
    in_multi = false;
    multi_accum = "";
    save = function(docs, code) {
      return sections.push({
        docs_text: docs,
        code_text: code
      });
    };
    for (_i = 0, _len = lines.length; _i < _len; _i++) {
      line = lines[_i];
      line = line.replace(/\/\/\s*region/g, function () {
        console.log('Replacing //region marks');
        return '//';
      });
      line = line.replace(/\/\/\s*endregion/g, function () {
        console.log('Replacing //endregion marks');
        return '//';
      });

      if (line.match(language.multi_start_matcher) || in_multi) {
        if (has_code) {
          save(docs_text, code_text);
          has_code = docs_text = code_text = '';
        }
        in_multi = true;
        multi_accum += line + '\n';
        if (line.match(language.multi_end_matcher)) {
          in_multi = false;
          try {
            parsed = dox.parseComments(multi_accum)[0];
            docs_text += dox_template(parsed);
          } catch (error) {
            console.log("Error parsing comments with Dox: " + error);
            docs_text = multi_accum;
          }
          multi_accum = '';
        }
      } else if (line.match(language.comment_matcher) && !line.match(language.comment_filter)) {

        if (has_code) {
          save(docs_text, code_text);
          has_code = docs_text = code_text = '';
        }
        docs_text += line.replace(language.comment_matcher, '') + '\n';
      } else {
        has_code = true;
        code_text += line + '\n';
      }
    }
    save(docs_text, code_text);
    return sections;
  };

  highlight = function(source, sections, callback) {
    var language, output, pygments, section;
    language = get_language(source);
    pygments = spawn('pygmentize', ['-l', language.name, '-f', 'html', '-O', 'encoding=utf-8,tabsize=2']);
    output = '';
    pygments.stderr.addListener('data', function(error) {
      if (error) return console.error(error.toString());
    });
    pygments.stdin.addListener('error', function(error) {
      console.error("Could not use Pygments to highlight the source.");
      return process.exit(1);
    });
    pygments.stdout.addListener('data', function(result) {
      if (result) return output += result;
    });
    pygments.addListener('exit', function() {
      var fragments, i, section, _len;
      output = output.replace(highlight_start, '').replace(highlight_end, '');
      fragments = output.split(language.divider_html);
      for (i = 0, _len = sections.length; i < _len; i++) {
        section = sections[i];
        section.code_html = highlight_start + fragments[i] + highlight_end;
        section.docs_html = showdown.makeHtml(section.docs_text);
      }
      return callback();
    });
    if (pygments.stdin.writable) {
      pygments.stdin.write(((function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = sections.length; _i < _len; _i++) {
          section = sections[_i];
          _results.push(section.code_text);
        }
        return _results;
      })()).join(language.divider_text));
      return pygments.stdin.end();
    }
  };

  generate_source_html = function(source, context, sections) {
    var dest, html, title;
    title = path.basename(source);
    dest = destination(source, context);
    html = docco_template({
      title: title,
      file_path: source,
      sections: sections,
      context: context,
      path: path,
      relative_base: relative_base
    });
    console.log("docco: " + source + " -> " + dest);
    return write_file(dest, html);
  };

  var generate_readme = function(context, package_json, cb) {
    var content, content_index, content_index_path, dest, readme_path, readme_template, source, title;
    title = "README";
    dest = "" + context.config.output_dir + "/index.html";
    readme_template = jade.compile(fs.readFileSync(__dirname + '/../resources/readme.jade').toString(), {
      filename: __dirname + '/../resources/readme.jade'
    });

    content_index_path = "" + (process.cwd()) + "/" + context.config.content_dir + "/content_index.md";

    if (file_exists(content_index_path)) {
      content_index = parse_markdown(context, content_index_path);
    } else {
      content_index = "";
    }

    ['README.md', 'readme.md', 'README.MD', 'Readme.md'].some(function(source) {
      readme_path = "" + (process.cwd()) + "/" + source;

      if (file_exists(readme_path)) {
        console.log('### generating readme ' + readme_path);
        content = parse_markdown(context, readme_path);
        return true;
      }
    });

    if (! content) {
      content = "There is no " + source + " for this project yet :( ";
    }

    var html;
    html = readme_template({
      title: title,
      context: context,
      content: content,
      content_index: content_index,
      file_path: source,
      path: path,
      relative_base: relative_base,
      package_json: package_json,
      gravatar: gravatar
    });
    console.log("docco: " + source + " -> " + dest);
    write_file(dest, html, cb);
  };

  var generate_content = function(context, dir) {
    var expand = require('glob-expand');
    var files = expand(dir + '/**/*.md');

    context.mds = context.mds || files;

    context.mds.forEach(function(file) {
      var dest, html, src;

      //src = "" + root + "/" + file;
      dest = destination(file, context);
      console.log("markdown: " + file + " --> " + dest);
      html = parse_markdown(context, file);

      html = content_template({
        title: file,
        context: context,
        content: html,
        file_path: file,
        path: path,
        relative_base: relative_base
      });
      write_file(dest, html);
    });
  };

  write_file = function(dest, contents, cb) {
    var target_dir, write_func;
    target_dir = path.dirname(dest);
    write_func = function() {
      console.log('writing dest: ', dest);
      return fs.writeFile(dest, contents, function(err) {
        if (err) throw err;
        cb && cb();
      });
    };
    return fs.stat(target_dir, function(err, stats) {
      if (err && err.code !== 'ENOENT') throw err;
      if (!err) return write_func();
      if (err) {
        return exec("mkdir -p " + target_dir, function(err) {
          if (err) throw err;
          return write_func();
        });
      }
    });
  };

  parse_markdown = function(context, src) {
    var markdown;
    markdown = fs.readFileSync(src).toString();

    markdown = markdown.replace(/\[([^\[]+)\]\(([^\)]+)\)/g, function(match, c1, c2) {
      var markdownLink = (c2 || '').trim();
      // check this only for relative urls
      if (/\.md$/i.test(markdownLink)) {
        return '[' + c1 + '](' + c2 + '.html)';
      }
      return match;
    });

    return showdown.makeHtml(markdown);
  };

  fs = require('fs');

  path = require('path');

  var marked = require('marked');
  showdown = {
    makeHtml: function (str) {
      return marked(str);
    }
  };

  jade = require('jade');

  dox = require('dox');

  gravatar = require('gravatar');

  _ = require('underscore');



  _ref = require('child_process'), spawn = _ref.spawn, exec = _ref.exec;

  languages = {
    '.coffee': {
      name: 'coffee-script',
      symbol: '#'
    },
    '.js': {
      name: 'javascript',
      symbol: '//',
      multi_start: "/*",
      multi_end: "*/"
    },
    '.less': {
      name: 'less',
      symbol: '//',
      multi_start: "/*",
      multi_end: "*/"
    },
    '.rb': {
      name: 'ruby',
      symbol: '#'
    },
    '.py': {
      name: 'python',
      symbol: '#'
    },
    '.java': {
      name: 'java',
      symbol: '//',
      multi_start: "/*",
      multi_end: "*/"
    }
  };

  for (ext in languages) {
    l = languages[ext];
    l.comment_matcher = new RegExp('^\\s*' + l.symbol + '\\s?');
    l.comment_filter = new RegExp('(^#![/]|^\\s*#\\{)');
    l.divider_text = '\n' + l.symbol + 'DIVIDER\n';
    l.divider_html = new RegExp('\\n*<span class="c1?">' + l.symbol + 'DIVIDER<\\/span>\\n*');
    if (l.multi_start === "/*") {
      l.multi_start_matcher = new RegExp(/^[\s]*\/\*[.]*/);
    } else {
      l.multi_start_matcher = new RegExp(/a^/);
    }
    if (l.multi_end === "*/") {
      l.multi_end_matcher = new RegExp(/.*\*\/.*/);
    } else {
      l.multi_end_matcher = new RegExp(/a^/);
    }
  }

  get_language = function(source) {
    return languages[path.extname(source)];
  };

  relative_base = function(filepath, context) {
    var result;
    result = path.dirname(filepath) + '/';
    if (result === '/' || result === '//') {
      return '';
    } else {
      return result;
    }
  };

  destination = function(filepath, context) {
    var base_path;
    base_path = relative_base(filepath, context);
    return path.join(context.config.output_dir, filepath + '.html'); //("" + context.config.output_dir + "/") + filepath + '.html';
  };

  ensure_directory = function(dir, callback) {
    return exec("mkdir -p " + dir, function() {
      return callback();
    });
  };

  file_exists = function(path) {
    try {
      return fs.lstatSync(path).isFile;
    } catch (ex) {
      return false;
    }
  };

  docco_template = jade.compile(fs.readFileSync(__dirname + '/../resources/docco.jade').toString(), {
    filename: __dirname + '/../resources/docco.jade'
  });

  dox_template = jade.compile(fs.readFileSync(__dirname + '/../resources/dox.jade').toString(), {
    filename: __dirname + '/../resources/dox.jade'
  });

  content_template = jade.compile(fs.readFileSync(__dirname + '/../resources/content.jade').toString(), {
    filename: __dirname + '/../resources/content.jade'
  });

  docco_styles = fs.readFileSync(__dirname + '/../resources/docco.css').toString();

  highlight_start = '<div class="highlight"><pre>';

  highlight_end = '</pre></div>';

  var parse_args = function(args, config, callback) {
    var a, ext, lang_filter, project_name, roots;

    project_name = "";
    if (args[0] === "-name") {
      args.shift();
      project_name = args.shift();
    }
    args = args.sort();
    if (!args.length) return;
    roots = (function() {
      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        a = args[_i];
        _results.push(a.replace(/\/+$/, ''));
      }
      return _results;
    })();
    roots = roots.join(" ");
    lang_filter = (function() {
      var _results;
      _results = [];
      for (ext in languages) {
        _results.push(" -name '*" + ext + "' ");
      }
      return _results;
    })();
    lang_filter = lang_filter.join(' -o ');

    console.log('finding roots...', roots, lang_filter  );

    return exec("find " + roots + " -type f \\( " + lang_filter + " \\)", function(err, stdout) {
      var sources;
      if (err) throw err;
      sources = stdout.split("\n").filter(function(file) {
        return file !== '' && path.basename(file)[0] !== '.';
      });
      console.log("docco: Recursively generating documentation for " + roots);
      return callback(sources, project_name, args);
    });
  };

  var check_config = function(context, pkg, config) {
    var defaults;
    defaults = {
      css: __dirname + '/../resources/docco.css',
      assets: __dirname + '/../resources/assets',
      show_timestamp: true,
      output_dir: "docs",
      project_name: context.options.project_name || '',
      content_dir: null
    };
    return context.config = _.extend(defaults, pkg.docco_husky || {}, config || {});
  };

  module.exports.generateDocs = function (options, callback) {
    var opts = {
      css: __dirname + '/../resources/docco.css',
      assets: __dirname + '/../resources/assets',
      show_timestamp: true,
      output_dir: "documentation",
      docFiles: [],
      project_name: "Unknown Project",
      package_path: process.cwd() + '/package.json',
      sources: []
    };

    opts = _.extend(opts, options);

    var context = {
      sources: opts.sources,
      options: {
        project_name: opts.project_name
      },
      config: opts,
      mds: opts.docFiles
    };

    var package_json;
    try {
      package_json = file_exists(opts.package_path) ? JSON.parse(fs.readFileSync(opts.package_path).toString()) : {};
    } catch (err) {
      console.error("Error parsing package.json", err);
    }

    var sources = opts.sources;
    var config = context.config;

    ensure_directory(config.output_dir, function() {
      var files, next_file;

      fs.writeFile("" + config.output_dir + "/docco.css", fs.readFileSync(config.css).toString());
      exec('cp -rv ' + config.assets + ' ' + config.output_dir, function (err) {
        if (err) throw err;
        files = sources.slice(0, sources.length + 1 || 9e9);
        if (context.mds) {
          generate_content(context, context.mds);
        }
        next_file = function() {
          if (files.length) {
            return generate_documentation(files.shift(), context, next_file);
          }
          else {
            generate_readme(context, package_json, callback);
          }
        };
        next_file();
      });
    });

  };

  module.exports.start = function (args, config) {
    parse_args(args, config, function(sources, project_name) {

      var context, package_json, package_path;
      context = {
        sources: sources,
        options: {
          project_name: project_name
        },
        mds: []
      };
      package_path = process.cwd() + '/package.json';
      try {
        package_json = file_exists(package_path) ? JSON.parse(fs.readFileSync(package_path).toString()) : {};
      } catch (err) {
        console.error("Error parsing package.json", err);
      }
      check_config(context, package_json, config);

      return ensure_directory(context.config.output_dir, function() {
        var files, next_file;
        fs.writeFile("" + context.config.output_dir + "/docco.css", fs.readFileSync(context.config.css).toString());
        exec('cp -rv ' + context.config.assets + ' ' + context.config.output_dir, function (err) {
          if (err) throw err;
          files = sources.slice(0, sources.length + 1 || 9e9);
          if (context.config.content_dir) {
            generate_content(context, context.config.content_dir);
          }
          next_file = function() {
            if (files.length) {
              return generate_documentation(files.shift(), context, next_file);
            }
            else {
              generate_readme(context, package_json);
            }
          };
          next_file();
        });
      });

    });
  };

}).call(this, module);
