
function readDir(fs, path) {
  return new Promise((res, rej) => fs.readdir(path, (err, files) => err ? rej(err) : res(files)));
}

function mapObject(o, f, ifPred) {
  const ret = [];
  for (const key of Object.keys(o)) {
    if (ifPred && !ifPred(key)) {
      continue;
    }
    ret.push(f(key, o[key]));
  }
  return ret;
}

function makeFunctionoidSuggestion(name, mod) {
  const argSnippets = [];
  const namedArgs = [];
  let collectingPosArgs = true;
  let i = 0;
  for (const param of mod.params ?? []) {
    if (collectingPosArgs) {
      if (param.defaultValue != null) {
        collectingPosArgs = false;
      } else {
        //argSnippets.push(`${param.name}=${'${' + (i + 1) + ':' + param.name + '}'}`);
        argSnippets.push(`${param.name}=${'${' + (i + 1) + ':' + param.name + '}'}`);
        i++;
        continue;
      }
    }
    namedArgs.push(param.name);
  }
  if (namedArgs.length) {
    argSnippets.push(`${'${' + (argSnippets.length + 1) + ':' + namedArgs.join('|') + '=}'}`);
  }
  const insertText = `${name}(${argSnippets.join(', ')})`;
  return {
    label: mod.signature,//`${name}(${(mod.params ?? []).join(', ')})`,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  };
}

const builtinSignatures = `
$fa=undef;
$fs=undef;
$fn=undef;
$t=undef;

$preview=undef;

// shows rotation
$vpr=undef;
// shows translation (i.e. won't be affected by rotate and zoom)
$vpt=undef;
// shows the FOV of the view [Note: Requires version 2021.01]
$vpf=undef;
// shows the camera distance [Note: Requires version 2015.03]
$vpd=undef;

PI=undef;

function abs(x) = x;
function acos(x) = x;
function asin(x) = x;
function atan(x) = x;
function atan2(y, x) = x;
function ceil(x) = x;
function chr(x) = 0;
function len(assignments) = $children;
function let(x) = x;
function ln(x) = x;
function log(x) = x;
function lookup(key, array) = x;
function max(values) = x;
function min(values) = x;
function sqrt(x) = x;
function tan(degrees) = x;
function rands(min_value, max_value, value_count, seed_value=undef) = x;
function search(match_value, string_or_vector, num_returns_per_match=1, index_col_num=0) = x;
function ord(x) = x;
function round(x) = x;
function sign(x) = x;
function sin(degrees) = x;
function str(values) = x;
function norm(x) = x;
function pow(base, exponent) = x;
function concat(values) = x;
function cos(degrees) = x;
function cross(a, b) = x;
function floor(x) = x;
function exp(x) = x;
function chr(x) = x;
function is_undef(x) = x;
function is_list(x) = x;
function is_num(x) = x;
function is_bool(x) = x;
function is_string(x) = x;
function is_function(x) = x;

function version() = '';
function version_num() = 0;

$parent_modules=0;
module parent_module(n) {}

module children() {}

module render(convexity=undef) {}
module surface(file, center=false, invert=false, convexity=undef) {}

function assert(condition, message=undef) = $children;
module assert(condition, message=undef) $children;

module cube(size, center=false) {}
module sphere(r, d=undef, $fa, $fs, $fn) {}
module cylinder(h, r, r1=undef, r2, d, d1, d2, center=false, $fa, $fs, $fn) {}
module polyhedron(points, faces, convexity=undef) {}

module square(size, center=false) {}
module circle(r, d=undef, $fa, $fs, $fn) {}
module polygon(points, paths, convexity=undef) {}
module linear_extrude(height, center=false, twist=undef, slices=undef, scale=undef, convexity=undef) $children;
module rotate_extrude(degrees, convexity=undef, $fa, $fs, $fn) $children;

module scale(v) $children;
module resize(newsize, auto=false) $children;
module rotate(a, v=undef) $children;
module translate(v) $children;
module mirror(v) $children;
module multmatrix(m) $children;

module color(c, alpha) $children;

module offset(r, delta=undef, chamfer) $children;

module minkowski() $children;
module union() $children;
module difference() $children;
module intersection() $children;
module hull() $children;

// module for(i=undef) $children;

module import(file, convexity=undef, $fn, $fa, $fs) {}
`;

// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
export async function registerOpenSCADLanguage(fs, workingDir, zipArchives) {
  const [jsLanguage] = monaco.languages.getLanguages().filter(l => l.id === 'javascript');
  const { conf, language } = await jsLanguage.loader();

  const builtInFunctionNames = [
    'abs',
      'acos', 'asin', 'atan', 'atan2', 'ceil',
      'len', 'let', 'ln', 'log',
      'lookup', 'max', 'min', 'sqrt', 'tan', 'rands',
      'search', 'sign', 'sin', 'str', 'norm', 'pow', 
      'concat', 'cos', 'cross', 'floor', 'exp', 
      'chr',
  ];
  const builtInModuleNames = [
    '$children', 'children',
    'circle', 'color', 'cube', 'cylinder',
    'diameter', 'difference', 'echo', 'extrude', 
    'for', 'function', 'hull', 'if', 'include',
    'intersection_for', 'intersection',  'linear',  'minkowski', 'mirror', 'module', 'multmatrix',
    'offset', 'polyhedron', 'projection', 'radius', 
    'render', 'resize', 'rotate', 'round', 'scale', 
    'sphere', 'square', 'surface', 'translate', 
    'union', 'use', 'value', 'version', 
    // 'center', 'width', 'height', 
  ];
  const builtInVarNames = [
    'false', 'true', 'PI', 'undef',
    '$fa', '$fn', '$fs', '$t', '$vpd', '$vpr', '$vpt',
  ]

  monaco.languages.register({ id: 'openscad' })
  monaco.languages.setLanguageConfiguration('openscad', conf);
  monaco.languages.setMonarchTokensProvider('openscad', {
    ...language,
    languageId: 'openscad',
    operators: [
      '<=', '<', '>=', '>', '==', '!=',
      '+', '-', '*', '/', '%', '^',
      '!', '&&', '||', '?', ':',
      '=',
    ],
    keywords: [...builtInFunctionNames, ...builtInModuleNames, ...builtInVarNames],
  });

  function cleanupVariables(snippet) {
    return snippet
      .replaceAll(/\$\{\d+:(\w+)\}/g, '$1')
      .replaceAll(/\$\d+/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim();
  }

  // const statementSnippets = [
  //   ...['union', 'intersection', 'difference', 'hull', 'minkowski'].map(n => `${n}() \$0`),
  //   'include ',
  //   'translate([${1:tx}, ${2:ty}, ${3:tz}]) $4',
  //   'scale([${1:sx}, ${2:sy}, ${3:sz}]) $4',
  //   'rotate([${1:deg_x}, ${2:deg_y}, ${3:deg_z}]) $4',
  //   'rotate(a = ${1:deg_a}, v = [${2:x}, ${3:y}, ${4:z}]) $5',
  //   'multmatrix(${1:matrix}) $2',
  //   'multmatrix([[${1:sx}, 0, 0, ${4:tx}], [0, ${2:sy}, 0, 0, ${5:ty}], [0, 0, ${3:sz}, ${6:tz}], [0, 0, 0, 1]]) $7',
  //   'resize([${1:x}, ${2:y}, ${3:z}]) $4',
  //   'mirror([${1:x}, ${2:y}, ${3:z}]) $4',
  //   'sphere(${1:radius});',
  //   'sphere(d=${1:diameter});',
  //   'cube(${1:size}, center=false);',
  //   'cube([${1:width}, ${2:depth}, ${3:height}], center=false);',
  //   'cylinder(${1:height}, r=${2:radius}, center=false);',
  //   'cylinder(${1:height}, d=${2:diameter}, center=false);',
  //   'cylinder(${1:height}, r1=${2:radius1}, r2=${3:radius2}, center=false);',
  //   'cylinder(${1:height}, d1=${2:diameter1}, d2=${3:diameter2}, center=false);',
  //   'polyhedron(points=${1:points}, faces=${2:faces});',
  //   'polygon(points=${1:points}, paths=${2:paths});',
  // ];

  const keywordSnippets = [
    'for(${1:variable}=[${2:start}:${3:end}) ${4:body}',
    'for(${1:variable}=[${2:start}:${3:increment}:${4:end}) ${5:body}',
    'if (${1:condition}) {\n\t$0\n} else {\n\t\n}'
  ];

  // function getStatementSuggestions() {
  //   return [
  //     {
  //       label: '$fn',
  //       kind: monaco.languages.CompletionItemKind.Text,
  //       insertText: '$fn='
  //     },
  //     ...statementSnippets.map(snippet => ({
  //       label: cleanupVariables(snippet).replaceAll(/ children/g, ''),
  //       kind: monaco.languages.CompletionItemKind.Function,
  //       insertText: snippet,
  //       insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  //     })),
  //     ...keywordSnippets.map(snippet => ({
  //       label: cleanupVariables(snippet).replaceAll(/ body/g, ''),
  //       kind: monaco.languages.CompletionItemKind.Keyword,
  //       insertText: snippet,
  //       insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  //     })),
  //   ];
  // }

  const allSymlinks = {};
  for (const n of Object.keys(zipArchives)) {
    if (n == 'fonts') {
      continue;
    }
    const { symlinks } = zipArchives[n];
    for (const s in symlinks) {
      allSymlinks[s] = `${n}/${symlinks[s]}`;
    }
  }
  // console.log('allSymlinks', allSymlinks);

  function parse(path, src, skipPrivates) {
    const withoutComments = src.replaceAll(/\/\*(.|[\s\S])*?\*\/|\/\/.*?$/gm, '');
    const vars = {};
    const functions = {};
    const modules = {};
    const includes = [];
    const uses = [];
    for (const m of withoutComments.matchAll(/(use|include)\s*<([^>]+)>/g)) {
      (m[1] == 'use' ? uses : includes).push(m[2]);
    }
    for (const m of withoutComments.matchAll(/(function|module)\s+(\w+)\s*\(([^)]*)\)/gm)) {
      const type = m[1];
      const name = m[2];
      if (skipPrivates && name.startsWith('_')) {
        continue;
      }
      const paramsStr = m[3];
      const params = [];
      if (/^(\s*(\w+(\s*=[^,()[]+)?(\s*,\s*\w+(\s*=[^,()[]+)?)*)?\s*)$/m.test(paramsStr)) {
        for (const paramStr of paramsStr.split(',')) {
          const am = /^\s*(\w+)(?:\s*=([^,()[]+))?\s*$/.exec(paramStr);
          if (am) {
            const paramName = am[1];
            const defaultValue = am[2];
            params.push({
              name: paramName,
              defaultValue
            });
          }
        }
      }
      (type == 'function' ? functions : modules)[name] = {
        path,
        signature: `${name}(${paramsStr.replaceAll(/[\s]+/gm, ' ').replaceAll(/\b | \b/g, '')})`,
        params,
      };
    }
    return {vars, functions, modules, includes, uses};
  }

  const parsedFiles = {};
  // function stat(path) {
  //   return new Promise((res, rej) => fs.stat(path, (err, stats) => err ? rej(err) : res(stats)));
  // }
  const toAbsolutePath = path => path.startsWith('/') ? path : `${workingDir}/${path}`;
  
  async function readFile(path) {
    //console.log(await readDir(fs, workingDir));
    if (path in allSymlinks) {
      path = allSymlinks[path];
    }
    path = toAbsolutePath(path);
    try {
      const bytes = await fs.readFileSync(path);
      const src = new TextDecoder("utf-8").decode(bytes);
      return src;
    } catch (e) {
      console.error('Failed to read', path, e);
      throw e;
    }
  }
  const builtinsPath = '<builtins>';
  let builtinsDefs;

  function getParsed(path, src, {skipPrivates, addBuiltins}) {
    return parsedFiles[path] ??= new Promise(async (res, rej) => {
      if (src == null) {
        src = await readFile(path);
      }
      const result = {}

      const mergeDefinitions = (isUse, defs) => {
        // console.log("PARSED SUB " + otherPath, JSON.stringify(sub, null, 2));
        result.functions = {
          ...(result.functions ?? {}),
          ...(defs.functions ?? {}),
        }
        result.modules = {
          ...(result.modules ?? {}),
          ...(defs.modules ?? {}),
        }
        if (!isUse) {
          result.vars = {
            ...(result.vars ?? {}),
            ...(defs.vars ?? {}),
          }
        }
      };
      const dir = (path.split('/').slice(0, -1).join('/') || '.') + '/';

      const handleInclude = async (isUse, otherPath) => {
        for (const path of [`${dir}/${otherPath}`, otherPath]) {
          try {
            const otherSrc = await readFile(otherPath);
            const sub = await getParsed(otherPath, otherSrc, {skipPrivates: true, addBuiltins: false});
            mergeDefinitions(isUse, sub);
          } catch (e) {
            console.warn(path, e);
          }
        }
        console.error('Failed to find ', otherPath, '(context imported in ', path, ')');
      };
      // res({});

      if (addBuiltins && path != builtinsPath) {
        mergeDefinitions(false, builtinsDefs);
      }

      const ownDefs = parse(path, src, skipPrivates);
      
      await Promise.all(
        [
          ...(ownDefs.uses ?? []).map(p => [p, true]),
          ...(ownDefs.includes ?? []).map(p => [p, false])
        ].map(([otherPath, isUse]) => handleInclude(isUse, otherPath)));

      mergeDefinitions(false, ownDefs);

      res(result);
    });
  }

  builtinsDefs = await getParsed(builtinsPath, builtinSignatures, {skipPrivates: false, addBuiltins: false});

  monaco.languages.registerCompletionItemProvider('openscad', {
    triggerCharacters: ["<", "/"], //, "\n"],
    provideCompletionItems: async (model, position, context, token) => {
      try {
        const {word} = model.getWordUntilPosition(position);
        const offset = model.getOffsetAt(position);
        const text = model.getValue();
        let previous = text.substring(0, offset);
        let i = previous.lastIndexOf('\n');
        previous = previous.substring(i + 1);

        const includeMatch = /\b(include|use)\s*<([^<>\n"]*)$/.exec(previous);
        if (includeMatch) {
          const prefix = includeMatch[2];
          let folder, filePrefix, folderPrefix;
          const i = prefix.lastIndexOf('/');
          if (i < 0) {
            folderPrefix = '';
            filePrefix = prefix;
          } else {
            folderPrefix = prefix.substring(0, i);
            filePrefix = prefix.substring(i + 1);
          }
          folder = workingDir + (folderPrefix == '' ? '' : '/' + folderPrefix);
          let files = folderPrefix == '' ? [...Object.keys(allSymlinks)] : [];
          try {
            files = [...await readDir(fs, folder), ...files];
            // console.log('readDir', folder, files);
          } catch (e) {
            console.error(e);
          }

          const suggestions = [];
          for (const file of files) {
            if (filePrefix != '' && !file.startsWith(filePrefix)) {
              continue;
            }
            if (/^(LICENSE.*|fonts)$/.test(file)) {
              continue;
            }
            if (folderPrefix == '' && (file in zipArchives) && zipArchives[file].symlinks) {
              continue;
            }
            const isFolder = !file.endsWith('.scad');
            const completion = file + (isFolder ? '' : '>\n'); // don't append '/' as it's a useful trigger char

            console.log(JSON.stringify({
              prefix,
              folder,
              filePrefix,
              folderPrefix,
              // files,
              completion,
              file,
            }, null, 2));

            suggestions.push({
              label: file,
              kind: isFolder ? monaco.languages.CompletionItemKind.Folder : monaco.languages.CompletionItemKind.File,
              insertText: completion
            });
          }
          suggestions.sort();

          return { suggestions };
        }

        const inputFile = workingDir + "/foo.scad";
        delete parsedFiles[inputFile];
        const parsed = await getParsed(inputFile, text, {skipPrivates: false, addBuiltins: true});
        // console.log("PARSED", JSON.stringify(parsed, null, 2));
        
        const previousWithoutComments = previous.replaceAll(/\/\*(.|[\s\S])*?\*\/|\/\/.*?$/gm, '');
        // console.log('previousWithoutComments', previousWithoutComments);
        const statementMatch = /(^|.*?[{});]|>\s*\n)\s*(\w*)$/m.exec(previousWithoutComments);
        if (statementMatch) {
          const start = statementMatch[1];
          const suggestions = [
            ...mapObject(
              parsed.modules ?? {},
              (name, mod) => makeFunctionoidSuggestion(name, mod),
              name => name.indexOf(word) >= 0),
            ...keywordSnippets.map(snippet => ({
              label: cleanupVariables(snippet).replaceAll(/ body/g, ''),
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            })),
            // ...getStatementSuggestions().filter(s => start == '' || s.insertText.indexOf(start) >= 0)
          ];
          suggestions.sort((a, b) => a.insertText.indexOf(start) < b.insertText.indexOf(start));
          return { suggestions };
        }

        const allWithoutComments = text.replaceAll(/\/\*(.|[\s\S])*?\*\/|\/\/.*?$/gm, '');
        
        const named = [
          ...mapObject(parsed.functions ?? {},
            (name, mod) => [name, makeFunctionoidSuggestion(name, mod)],
            name => name.indexOf(word) >= 0)
        ];
        named.sort(([a], [b]) => a.indexOf(word) < b.indexOf(word));
        // const suggestions = names.map(name => ({
        //   label: name,
        //   kind: monaco.languages.CompletionItemKind.Constant,
        //   insertText: name
        // }));

        const suggestions = named.map(([n, s]) => s);
        return { suggestions };
        
      } catch (e) {
        console.error(e, e.stackTrace);
        return { suggestions: [] };
      }
    },
  });
}
