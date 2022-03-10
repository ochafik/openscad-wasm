import OpenSCAD from "./openscad.js";

importScripts("https://cdnjs.cloudflare.com/ajax/libs/BrowserFS/2.0.0/browserfs.min.js");

const zipArchives = [
  // Mounted as /mnt/fonts then symlinked to /fonts below.
  'fonts',
  // @revarbat
  'BOSL',
  'BOSL2',
  // @nophead
  'NopSCADlib',
  // @thehans
  'FunctionalOpenSCAD',
  'funcutils',
  // @colyer
  'smooth-prim',
  'closepoints',
  'plot-function',
  // 'threads',
  // @sofian
  'openscad-tray',
  // @mrWheel
  'YAPP_Box',
  // @Cantareus
  'Stemfie_OpenSCAD',
];

const Buffer = BrowserFS.BFSRequire('buffer').Buffer;
const fs = BrowserFS.BFSRequire('fs');

async function initBrowserFS(zipArchives) {
  
  const fetchData = async url => (await fetch(url)).arrayBuffer();
  
  const results = await Promise.all(zipArchives.map(async n => [n, await fetchData(`${n}.zip`)]));
  
  const zipMounts = {};
  for (const [n, zipData] of results) {
    zipMounts[n] = {
      fs: "ZipFS",
      options: {
        zipData: Buffer.from(zipData)
      }
    }
  }
  // const zipData = await (await fetch('./BOSL2.zip')).arrayBuffer();
  
  await new Promise((resolve, reject) => {
    BrowserFS.install(self);
    BrowserFS.configure({
      fs: "MountableFileSystem",
      options: {
        ...zipMounts,
        "/": { fs: "InMemory" },
        // "/home": { fs: "IndexedDB" }
      }
    }, function (e) { if (e) reject(e); else resolve(); });
  });

}

const browserFSInit = initBrowserFS(zipArchives);

addEventListener('message', async (e) => {

  const { inputs, args, outputPaths, wasmMemory } = e.data;

  const mergedOutputs = [];
  try {
    const instance = await OpenSCAD({
      wasmMemory,
      buffer: wasmMemory && wasmMemory.buffer,
      noInitialRun: true,
      'print': text => {
        // console.log('stdout: ' + text);
        mergedOutputs.push({ stdout: text })
      },
      'printErr': text => {
        // console.log('stderr: ' + text);
        mergedOutputs.push({ stderr: text })
      },
    });

    // addFonts(instance);

    instance.FS.mkdir('mnt');
    instance.FS.chdir('/mnt');

    // https://github.com/emscripten-core/emscripten/issues/10061
    await browserFSInit;
    const BFS = new BrowserFS.EmscriptenFS(
      instance.FS,
      instance.PATH ?? {
        join2: (a, b) => `${a}/${b}`,
        join: (...args) => args.join('/'),
      }, instance.ERRNO_CODES ?? {});
    instance.FS.mount(BFS, {root: '/'}, '/mnt');

    instance.FS.symlink("/mnt/fonts", "/fonts");
    // openscad.FS.writeFile("/fonts/fonts.conf", fromHex(config as string));

    // instance.FS.readdirSync()

    if (inputs) {
      for (const [path, content] of inputs) {
        instance.FS.writeFile(path, content);
      }
    }
    console.log('Calling main ', args)
    const start = performance.now();
    const exitCode = instance.callMain(args);
    const end = performance.now();

    const result = {
      outputs: outputPaths && await Promise.all(outputPaths.map(path => [path, instance.FS.readFile(path)])),
      mergedOutputs,
      exitCode,
      elapsedMillis: end - start
    }

    console.log(result);

    postMessage(result);
  } catch (e) {

    console.error(e, e.stackTrace);
    mergedOutputs.push({ error: e.toString() });
    postMessage({
      error: e.toString(),
      mergedOutputs,
    });
  }
});
