
function readDir(fs, path) {
  return new Promise((res, rej) => fs.readdir(path, (err, files) => err ? rej(err) : res(files)));
}

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

  const functionSnippets = [
    ...['union', 'intersection', 'difference', 'hull', 'minkowski'].map(n => `${n}() \$0`),
    'include ',
    'translate([${1:tx}, ${2:ty}, ${3:tz}]) $4',
    'scale([${1:sx}, ${2:sy}, ${3:sz}]) $4',
    'rotate([${1:deg_x}, ${2:deg_y}, ${3:deg_z}]) $4',
    'rotate(a = ${1:deg_a}, v = [${2:x}, ${3:y}, ${4:z}]) $5',
    'multmatrix(${1:matrix}) $2',
    'multmatrix([[${1:sx}, 0, 0, ${4:tx}], [0, ${2:sy}, 0, 0, ${5:ty}], [0, 0, ${3:sz}, ${6:tz}], [0, 0, 0, 1]]) $7',
    'resize([${1:x}, ${2:y}, ${3:z}]) $4',
    'mirror([${1:x}, ${2:y}, ${3:z}]) $4',
    'sphere(${1:radius});',
    'sphere(d=${1:diameter});',
    'cube(${1:size}, center=false);',
    'cube([${1:width}, ${2:depth}, ${3:height}], center=false);',
    'cylinder(${1:height}, r=${2:radius}, center=false);',
    'cylinder(${1:height}, d=${2:diameter}, center=false);',
    'cylinder(${1:height}, r1=${2:radius1}, r2=${3:radius2}, center=false);',
    'cylinder(${1:height}, d1=${2:diameter1}, d2=${3:diameter2}, center=false);',
    'polyhedron(points=${1:points}, faces=${2:faces});',
    'polygon(points=${1:points}, paths=${2:paths});',
  ];

  const keywordSnippets = [
    'for(${1:variable}=[${2:start}:${3:end}) ${4:body}',
    'for(${1:variable}=[${2:start}:${3:increment}:${4:end}) ${5:body}',
    'if (${1:condition}) {\n\t$0\n} else {\n\t\n}'
  ];

  function getStatementSuggestions() {
    return [
      {
        label: '$fn',
        kind: monaco.languages.CompletionItemKind.Text,
        insertText: '$fn='
      },
      ...functionSnippets.map(snippet => ({
        label: cleanupVariables(snippet).replaceAll(/ children/g, ''),
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      })),
      ...keywordSnippets.map(snippet => ({
        label: cleanupVariables(snippet).replaceAll(/ body/g, ''),
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      })),
    ];
  }

  const allSymlinks = [];
  for (const n of Object.keys(zipArchives)) {
    if (n == 'fonts') {
      continue;
    }
    const { symlinks } = zipArchives[n];
    for (const s in symlinks) {
      allSymlinks.push(s);
    }
  }

  monaco.languages.registerCompletionItemProvider('openscad', {
    triggerCharacters: ["<", "/"], //, "\n"],
    provideCompletionItems: async (model, position, context, token) => {
      try {
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
          let files = folderPrefix == '' ? [...allSymlinks] : [];
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

        const previousWithoutComments = previous.replaceAll(/\/\*.*?\*\/|\/\/.*?$/gm, '');
        console.log('previousWithoutComments', previousWithoutComments);
        const statementMatch = /(^|.*?[{});]|>\s*\n)\s*(\w*)$/m.exec(previousWithoutComments);
        if (statementMatch) {
          const start = statementMatch[1];
          const suggestions = getStatementSuggestions().filter(s => start == '' || s.insertText.indexOf(start) >= 0);
          suggestions.sort((a, b) => a.insertText.indexOf(start) < b.insertText.indexOf(start));
          return { suggestions };
        }

        const {word} = model.getWordUntilPosition(position);
        const allWithoutComments = text.replaceAll(/\/\*.*?\*\/|\/\/.*?$/gm, '');
        function* getVarNames() {
          yield *builtInVarNames;
          for (const m of allWithoutComments.matchAll(/\b(\w+)\s*=/g)) {
            yield m[1];
          }
        }
        function* getFunctionNames() {
          yield *builtInFunctionNames;
          for (const m of allWithoutComments.matchAll(/\bfunction\s+(\w+)\b/g)) {
            yield m[1];
          }
        }
        function* getModuleNames() {
          yield *builtInModuleNames;
          for (const m of allWithoutComments.matchAll(/\bmodule\s+(\w+)\b/g)) {
            yield m[1];
          }
        }
        function* getExpressions() {
          yield *getVarNames();
          yield *getFunctionNames();
        }
        const names = [];
        for (const name of getExpressions ()) {
          if (word == '' || name.indexOf(word) >= 0) {
            names.push(name);
          }
        }
        names.sort((a, b) => a.indexOf(word) < b.indexOf(word));
        const suggestions = names.map(name => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: name
        }));
        return { suggestions };
      } catch (e) {
        console.error(e, e.stackTrace);
        return { suggestions: [] };
      }
    },
  });
}
