export function createWasmMemory({maximumMegabytes, maximumBytes}) {
  const pageSize = 64 * 1024; // 64KB
  if (!maximumBytes) {
    maximumBytes = maximumMegabytes * 1024 * 1024;
  }
  return new WebAssembly.Memory({
    initial: Math.floor(maximumBytes / 2 / pageSize),
    maximum: Math.floor(maximumBytes / pageSize),
    shared: true,
  });
}

// Output is {outputs: [name, content][], mergedOutputs: [{(stderr|stdout|error)?: string}], exitCode: number}
export function spawnOpenSCAD({inputs, args, outputPaths}) {
  var worker;
  var rejection;

  function terminate() {
    if (!worker) {
      return;
    }
    worker.terminate();
    worker = null;
  }
    
  const promise = new Promise((resolve, reject) => {
    worker = new Worker('./openscad-worker-inlined.js');
    // if (navigator.userAgent.indexOf(' Chrome/') < 0) {
    //   worker = new Worker('./openscad-worker-firefox.js'); // {'type': 'module'}
    // } else {
    //   worker = new Worker('./openscad-worker.js', {'type': 'module'});
    // }
    rejection = reject;
    worker.onmessage = e => {
      resolve(e.data);
      terminate();
    }
    worker.postMessage({inputs, args, outputPaths})
  });
  
  promise.kill = () => {
    rejection({error: 'Terminated'});
    terminate();
  }

  return promise;
}
