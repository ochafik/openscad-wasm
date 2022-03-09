import { createWasmMemory, spawnOpenSCAD } from './openscad-runner.js'
// import OpenScad from "./openscad.js";
import { registerOpenSCADLanguage } from './openscad-editor-config.js'
import { writeStateInFragment, readStateFromFragment} from './state.js'
import { buildFeatureCheckboxes } from './features.js';

const editorElement = document.getElementById('monacoEditor');
const runButton = document.getElementById('run');
const killButton = document.getElementById('kill');
const metaElement = document.getElementById('meta');
const linkContainerElement = document.getElementById('link-container');
const autorenderCheckbox = document.getElementById('autorender');
const autoparseCheckbox = document.getElementById('autoparse');
const showExperimentalFeaturesCheckbox = document.getElementById('show-experimental');
const stlViewerElement = document.getElementById("viewer");
const logsElement = document.getElementById("logs");
const featuresContainer = document.getElementById("features");
// const maximumMegabytesInput = document.getElementById("maximum-megabytes");
// const copyLinkButton = document.getElementById("copy-link");

const featureCheckboxes = {};

var persistCameraState = false; // If one gets too far, it's really hard to auto reset and can be confusing to users. Just restart.
var stlViewer;
var stlFile;

// if (copyLinkButton) {
//   copyLinkButton.onclick = async () => {
//     const result = await navigator.permissions.query({name: "clipboard-write"});
//     if (result.state == "granted" || result.state == "prompt") {
//       try {
//         // const serviceUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(location.href)}`;
//         // const serviceUrl = 'https://is.gd/create.php?format=simple&url=https://www.example.com';
//         const fetchUrl = '/shorten?url=' + encodeURIComponent(location.href);
//         const url = await (await fetch(fetchUrl)).text();
//         console.log('url', url)
//         navigator.clipboard.writeText(url);
//       } catch (e) {
//         console.error("Failed to create the url", e);
//       }
//     }
//   };
// }

function buildStlViewer() {
  const stlViewer = new StlViewer(stlViewerElement);
  // const initialCameraState = stlViewer.get_camera_state();
  stlViewer.model_loaded_callback = id => {
    stlViewer.set_color(id, '#f9d72c');
    stlViewer.set_auto_zoom(true);
    stlViewer.set_auto_resize(true);
    // stlViewer.set_edges(id, true);
    // onStateChanged({allowRun: false});
  };    
  return stlViewer;
}

function viewStlFile() {
  try { stlViewer.remove_model(1); } catch (e) {}
  stlViewer.add_model({ id: 1, local_file: stlFile });
}
// stlViewer.set_auto_zoom(true);

function addDownloadLink(container, blob, fileName) {
  const link = document.createElement('a');
  link.innerText = fileName;
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  container.append(link);
  return link;
}

function formatMillis(n) {
  if (n < 1000) {
    return `${Math.floor(n / 1000)} sec`;
  }
  return `${Math.floor(n / 100) / 10} sec`;
}

let lastJob;

killButton.onclick = () => {
  if (lastJob) {
    lastJob.kill();
    lastJob = null;
  }
};

function setExecuting(v) {
  killButton.disabled = !v;
}

var lastProcessedOutputsTimestamp;

function processMergedOutputs(editor, mergedOutputs, timestamp) {
  if (lastProcessedOutputsTimestamp != null && timestamp < lastProcessedOutputsTimestamp) {
    // We have slow (render) and fast (syntax check) runs running concurrently.
    // The results of slow runs might be out of date now.
    return;
  }
  lastProcessedOutputsTimestamp = timestamp;

  let unmatchedLines = [];

  const markers = [];
  let warningCount = 0, errorCount = 0;
  const addError = (error, file, line) => {
    markers.push({
      startLineNumber: Number(line),
      startColumn: 1,
      endLineNumber: Number(line),
      endColumn: 1000,
      message: error,
      severity: monaco.MarkerSeverity.Error
    })
  }
  for (const {stderr, stdout, error} of mergedOutputs){
    if (stderr) {
      if (stderr.startsWith('ERROR:')) errorCount++;
      if (stderr.startsWith('WARNING:')) warningCount++;

      let m = /^ERROR: Parser error in file "([^"]+)", line (\d+): (.*)$/.exec(stderr)
      if (m) {
        const [_, file, line, error] = m
        addError(error, file, line);
        continue;
      }

      m = /^ERROR: Parser error: (.*?) in file ([^",]+), line (\d+)$/.exec(stderr)
      if (m) {
        const [_, error, file, line] = m
        addError(error, file, line);
        continue;
      }

      m = /^WARNING: (.*?),? in file ([^,]+), line (\d+)\.?/.exec(stderr);
      if (m) {
        const [_, warning, file, line] = m
        markers.push({
          startLineNumber: Number(line),
          startColumn: 1,
          endLineNumber: Number(line),
          endColumn: 1000,
          message: warning,
          severity: monaco.MarkerSeverity.Warning
        })
        continue;
      }
    }
    unmatchedLines.push(stderr ?? stdout ?? `EXCEPTION: ${error}`);
  }
  if (errorCount || warningCount) unmatchedLines = [`${errorCount} errors, ${warningCount} warnings!`, '', ...unmatchedLines];
  logsElement.innerText = unmatchedLines.join("\n")
  
  monaco.editor.setModelMarkers(editor.getModel(), 'openscad', markers);
}

const syntaxDelay = 300;
const checkSyntax = turnIntoDelayableExecution(syntaxDelay, () => {
  const source = editor.getValue();
  const timestamp = Date.now();

  const job = spawnOpenSCAD({
    inputs: [['/mnt/input.scad', source + '\n']],
    args: ["/mnt/input.scad", "-o", "out.ast"],
  });

  return {
    kill: () => job.kill(),
    completion: (async () => {
      try {
        const result = await job;
        console.log(result);
        processMergedOutputs(editor, result.mergedOutputs, timestamp);
      } catch (e) {
        console.error(e);
      }
    })()
  };
});

var sourceFileName;
var editor;

function turnIntoDelayableExecution(delay, createJob) {
  var pendingId;
  var runningJobKillSignal;

  const doExecute = async () => {
    if (runningJobKillSignal) {
      runningJobKillSignal();
      runningJobKillSignal = null;
    }
    const {kill, completion} = createJob();
    runningJobKillSignal = kill;
    try {
      await completion;
    } finally {
      runningJobKillSignal = null;
    }
  }
  return async ({now}) => {
    if (pendingId) {
      clearTimeout(pendingId);
      pendingId = null;
    }
    if (now) {
      doExecute();
    } else {
      pendingId = setTimeout(doExecute, delay);
    }
  };
}

var renderDelay = 1000;
const render = turnIntoDelayableExecution(renderDelay, () => {
  const source = editor.getValue();
  const timestamp = Date.now();
  metaElement.innerText = 'rendering...';
  metaElement.title = null;
  runButton.disabled = true;
  setExecuting(true);
  
  const job = spawnOpenSCAD({
    // wasmMemory,
    inputs: [['/mnt/input.scad', source]],
    args: [
      "/mnt/input.scad",
      "-o", "out.stl",
      ...Object.keys(featureCheckboxes).filter(f => featureCheckboxes[f].checked).map(f => `--enable=${f}`),
    ],
    outputPaths: ['/mnt/out.stl']
  });

  return {
    kill: () => job.kill(),
    completion: (async () => {
      try {
        const result = await job;
        console.log(result);
        processMergedOutputs(editor, result.mergedOutputs, timestamp);
  
        if (result.error) {
          throw result.error;
        }
  
        metaElement.innerText = formatMillis(result.elapsedMillis);
        
        const [output] = result.outputs;
        if (!output) throw 'No output from runner!'
        const [fileName, content] = output;

        // TODO: have the runner accept and return files.
        const blob = new Blob([content], { type: "application/octet-stream" });
        // console.log(new TextDecoder().decode(content));
        stlFile = new File([blob], fileName);

        viewStlFile(stlFile);

        linkContainerElement.innerHTML = '';
        addDownloadLink(linkContainerElement, blob, fileName);
      } catch (e) {
        console.error(e, e.stack);
        metaElement.innerText = '<failed>';
        metaElement.title = e.toString();
      } finally {
        setExecuting(false);
        runButton.disabled = false;
      }
    })()
  }
});

runButton.onclick = () => render({now: true});

function getState() {
  const features = Object.keys(featureCheckboxes).filter(f => featureCheckboxes[f].checked);
  return {
    source: {
      name: sourceFileName,
      content: editor.getValue(),
    },
    autorender: autorenderCheckbox.checked,
    autoparse: autoparseCheckbox.checked,
    // maximumMegabytes: Number(maximumMegabytesInput.value),
    features,
    showExp: features.length > 0 || showExperimentalFeaturesCheckbox.checked,
    camera: persistCameraState ? stlViewer.get_camera_state() : null,
  };
}

function normalizeSource(src) {
  return src.replaceAll(/\/\*.*?\*\/|\/\/.*?$/gm, '')
    .replaceAll(/([,.({])\s+/gm, '$1')
    .replaceAll(/\s+([,.({])/gm, '$1')
    .replaceAll(/\s+/gm, ' ')
    .trim()
}
function normalizeStateForCompilation(state) {
  return {
    ...state,
    source: {
      ...state.source,
      content: normalizeSource(state.source.content)
    },
  }
}

const defaultState = {
  source: {
    name: 'input.stl',
    content: 'cube(1);\ntranslate([0.5, 0.5, 0.5])\n\tcube(1);',
  },
  maximumMegabytes: 1024,
  // maximumMegabytes: 512,
  features: ['fast-csg', 'fast-csg-trust-corefinement', 'fast-csg-remesh', 'fast-csg-exact-callbacks', 'lazy-union'],
};

// var wasmMemory;
// var lastMaximumMegabytes;
// function setMaximumMegabytes(maximumMegabytes) {
//   if (!wasmMemory || (lastMaximumMegabytes != maximumMegabytes)) {
//     wasmMemory = createWasmMemory({maximumMegabytes});
//     lastMaximumMegabytes = maximumMegabytes;
//   }
// }

function updateExperimentalCheckbox(temptativeChecked) {
  const features = Object.keys(featureCheckboxes).filter(f => featureCheckboxes[f].checked);
  const hasFeatures = features.length > 0;
  showExperimentalFeaturesCheckbox.checked = hasFeatures || (temptativeChecked ?? showExperimentalFeaturesCheckbox.checked);
  showExperimentalFeaturesCheckbox.disabled = hasFeatures;
}

function setState(state) {
  editor.setValue(state.source.content);
  sourceFileName = state.source.name || 'input.scad';
  if (state.camera && persistCameraState) {
    stlViewer.set_camera_state(state.camera);
  }
  let features = new Set();
  if (state.features) {
    features = new Set(state.features);
    Object.keys(featureCheckboxes).forEach(f => featureCheckboxes[f].checked = features.has(f));
  }
  autorenderCheckbox.checked = state.autorender ?? true;
  autoparseCheckbox.checked = state.autoparse ?? true;
  updateExperimentalCheckbox(state.showExp ?? false);

  // const maximumMegabytes = state.maximumMegabytes ?? defaultState.maximumMegabytes;
  // setMaximumMegabytes(maximumMegabytes);
  // maximumMegabytesInput.value = maximumMegabytes;
}

var previousNormalizedState;
function onStateChanged({allowRun}) {
  const newState = getState();
  writeStateInFragment(newState);

  featuresContainer.style.display = showExperimentalFeaturesCheckbox.checked ? null : 'none';

  const normalizedState = normalizeStateForCompilation(newState);
  if (JSON.stringify(previousNormalizedState) != JSON.stringify(normalizedState)) {
    previousNormalizedState = normalizedState;
    
    if (allowRun) {
      if (autoparseCheckbox.checked) {
        checkSyntax({now: false});
      }
      if (autorenderCheckbox.checked) {
        render({now: false});
      }
    }
  }
}

function pollCameraChanges() {
  if (!persistCameraState) {
    return;
  }
  let lastCam;
  setInterval(function() {
    const ser = JSON.stringify(stlViewer.get_camera_state());
    if (ser != lastCam) {
      lastCam = ser;
      onStateChanged({allowRun: false});
    }
  }, 1000); // TODO only if active tab
}

try {
  await registerOpenSCADLanguage();

  editor = monaco.editor.create(editorElement, {
    // value: source,
    lineNumbers: false,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fontSize: 12,
    language: 'openscad',
  });
  editor.addAction({
    id: "run-openscad",
    label: "Run OpenSCAD",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => render({now: true}),
  });

  stlViewer = buildStlViewer();
  // stlViewerElement.onclick = () => stlViewerElement.focus();
  // stlViewerElement.ondblclick = () => {
  //   try { stlViewer.remove_model(1); } catch (e) {}
  //   try { stlViewer.dispose(); } catch (e) {}
    
  //   stlViewer = buildStlViewer();
  //   viewStlFile();
  // };
  
  stlViewerElement.onkeydown = e => {
    if (e.key === "Escape" || e.key === "Esc") editor.focus();
  };

  const initialState = readStateFromFragment() || defaultState;
  
  setState(initialState);
  await buildFeatureCheckboxes(featuresContainer, featureCheckboxes, () => {  
    updateExperimentalCheckbox();
    onStateChanged({allowRun: true});
  });
  setState(initialState);
  
  showExperimentalFeaturesCheckbox.onchange = () => onStateChanged({allowRun: false});

  autorenderCheckbox.onchange = () => onStateChanged({allowRun: autorenderCheckbox.checked});
  autoparseCheckbox.onchange = () => onStateChanged({allowRun: autoparseCheckbox.checked});
  // maximumMegabytesInput.oninput = () => {
  //   setMaximumMegabytes(Number(maximumMegabytesInput.value));
  //   onStateChanged({allowRun: true});
  // };
  
  editor.focus();

  pollCameraChanges();
  onStateChanged({allowRun: true});

  editor.onDidChangeModelContent(() => {
    onStateChanged({allowRun: true});
  });

} catch (e) {
  console.error(e);
}
