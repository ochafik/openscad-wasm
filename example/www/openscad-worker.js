import OpenSCAD from "./openscad.js";

importScripts("https://cdnjs.cloudflare.com/ajax/libs/BrowserFS/2.0.0/browserfs.min.js");
importScripts('filesystem.js');

const allArchiveNames = Object.keys(zipArchives)
const allZipMountsPromise = getBrowserFSLibrariesMounts(allArchiveNames);

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
    
    // await browserFSInit;
    await new Promise(async (resolve, reject) => {
      BrowserFS.install(self);
      BrowserFS.configure({
        fs: "MountableFileSystem",
        options: {
          ...await allZipMountsPromise,
          // "/": { fs: "InMemory" },
        }
      }, function (e) { if (e) reject(e); else resolve(); });
    });

    const archiveNames = allArchiveNames;

    // instance.FS.mkdir('tmp');    
    instance.FS.mkdir('/tmp/run');    
    instance.FS.mkdir('/libraries');

    // await browserFSInit;

    // https://github.com/emscripten-core/emscripten/issues/10061
    const BFS = new BrowserFS.EmscriptenFS(
      instance.FS,
      instance.PATH ?? {
        join2: (a, b) => `${a}/${b}`,
        join: (...args) => args.join('/'),
      }, instance.ERRNO_CODES ?? {});
    instance.FS.mount(BFS, {root: '/'}, '/libraries');

    await symlinkLibraries(archiveNames, instance.FS, '/libraries', '/tmp/run');

    instance.FS.chdir('/tmp/run');
    
    // console.log('.', instance.FS.readdir('.'));
    // console.log('fonts', instance.FS.readdir('fonts'));
    // console.log('BOSL2', instance.FS.readdir('BOSL2'));

    if (inputs) {
      for (const [path, content] of inputs) {
        instance.FS.writeFile(path, content);
      }
    }
    
    console.debug('Calling main ', args)
    const start = performance.now();
    const exitCode = instance.callMain(args);
    const end = performance.now();

    const result = {
      outputs: outputPaths && await Promise.all(outputPaths.map(path => [path, instance.FS.readFile(path)])),
      mergedOutputs,
      exitCode,
      elapsedMillis: end - start
    }

    console.debug(result);

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
