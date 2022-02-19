
// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
export async function registerOpenSCADLanguage() {
  const [jsLanguage] = monaco.languages.getLanguages().filter(l => l.id === 'javascript');
  const {conf, language} = await jsLanguage.loader();
  
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
    keywords: [
      '$children', '$fa', '$fn', '$fs', '$t', '$vpd', '$vpr', '$vpt', 'abs',
       'acos', 'asin', 'atan', 'atan2', 'ceil', 'center', 'children', 'chr',
        'circle', 'color', 'concat', 'cos', 'cross', 'cube', 'cylinder', 
        'diameter', 'difference', 'echo', 'exp', 'extrude', 'false', 'floor', 
        'for', 'function', 'height', 'hull', 'if', 'import', 'include', 
        'intersection_for', 'intersection', 'len', 'let', 'linear', 'ln', 'log', 
        'lookup', 'max', 'min', 'minkowski', 'mirror', 'module', 'multmatrix', 
        'norm', 'offset', 'polyhedron', 'pow', 'projection', 'radius', 'rands', 
        'render', 'resize', 'rotate', 'round', 'scale', 'search', 'sign', 'sin', 
        'sphere', 'sqrt', 'square', 'str', 'surface', 'tan', 'translate', 'true', 
        'union', 'use', 'value', 'version num', 'version', 'width', 'undef', 'PI',
    ],
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

  const staticSuggestions = [
    {
      label: '$fn',
      kind: monaco.languages.CompletionItemKind.Text,
      insertText: '\\$fn='
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

  monaco.languages.registerCompletionItemProvider('openscad', {
    provideCompletionItems: () => ({
      suggestions: [...staticSuggestions]
    })
  });
}
