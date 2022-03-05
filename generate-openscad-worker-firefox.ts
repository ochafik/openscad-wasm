// const importMetaUrl = 'https://ochafik.com/openscad/openscad-worker-firefox.js';
const importMetaUrl = 'http://localhost:8080';

const workerJs = await Deno.readTextFile("example/www/openscad-worker.js");
const emscriptenJs = await Deno.readTextFile("build/openscad.js");

const out = `// AUTO GENERATED FILE - DO NOT EDIT
var import_meta_url = '${importMetaUrl}';

${emscriptenJs.replaceAll(/import.meta.url/g, 'import_meta_url').replaceAll(/export default OpenSCAD;/g, '')}

${workerJs.replaceAll(/import OpenSCAD from .*;/g, '')}
`;

await Deno.writeTextFile('build/openscad-worker-firefox.js', out);
