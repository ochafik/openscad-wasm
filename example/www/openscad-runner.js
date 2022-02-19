
export function spawnOpenSCAD({inputs, args, outputPaths}) {
  var worker;
  var rejection;
    
  const promise = new Promise((resolve, reject) => {
    worker = new Worker('./openscad-worker.js', {'type': 'module'});
    rejection = reject;
    worker.onmessage = e => {
      // if (e.data.error) {
      //   reject(e.data);
      // } else {
        resolve(e.data);
      // }
    };
    worker.postMessage({inputs, args, outputPaths})
  });
  
  promise.kill = () => {
    worker.terminate();
    rejection({error: 'Killed'});
  }

  return promise;
}
