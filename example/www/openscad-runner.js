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
    worker = new Worker('./openscad-worker.js', {'type': 'module'});
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
