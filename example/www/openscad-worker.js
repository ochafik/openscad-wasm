import OpenScad from "./openscad.js";


addEventListener('message', async (e) => {
  const {inputs, args, outputPaths} = e.data;

  const mergedOutputs = [];
  try {
    
    const instance = await OpenScad({
      noInitialRun: true,
      'print': text => {
        // console.log('stdout: ' + text);
        mergedOutputs.push({stdout: text})
      },
      'printErr': text => {
        // console.log('stderr: ' + text);
        mergedOutputs.push({stderr: text})
      },
    });

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

    console.error(e);
    mergedOutputs.push({error: e.toString()});
    postMessage({
      error: e.toString(),
      mergedOutputs,
    });
  }
});
