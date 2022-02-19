import { spawnOpenSCAD } from './openscad-runner.js'
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
const showExperimentalFeaturesCheckbox = document.getElementById('show-experimental');
const stlViewerElement = document.getElementById("viewer");
const logsElement = document.getElementById("logs");
const featuresContainer = document.getElementById("features");

const featureCheckboxes = {};

const stlViewer = new StlViewer(stlViewerElement);

function addDownloadLink(container, blob, fileName) {
  const link = document.createElement('a');
  link.innerText = fileName;
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  container.append(link);
  return link;
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
    unmatchedLines.push(stderr ?? stdout ?? error);
  }
  if (errorCount || warningCount) unmatchedLines = [`${errorCount} errors, ${warningCount} warnings!`, '', ...unmatchedLines];
  logsElement.innerText = unmatchedLines.join("\n")
  
  monaco.editor.setModelMarkers(editor.getModel(), 'openscad', markers);
}

var lastSyntaxCheck;
async function checkSyntax() {
  const source = editor.getValue();
  const timestamp = Date.now();

  if (lastSyntaxCheck) lastSyntaxCheck.kill();
  lastSyntaxCheck = spawnOpenSCAD({
    inputs: [['/input.scad', source + '\n']],
    args: ["/input.scad", "-o", "out.ast"],
  });

  try {
    const result = await lastSyntaxCheck;
    console.log(result);
    processMergedOutputs(editor, result.mergedOutputs, timestamp);
  } catch (e) {
    console.error(e);
  }
}

async function execute() {
  const source = editor.getValue();
  try {
    const timestamp = Date.now();

    if (lastJob) lastJob.kill();
    lastJob = spawnOpenSCAD({
      inputs: [['/input.scad', source]],
      args: [
        "/input.scad",
        "-o", "out.stl",
        ...Object.keys(featureCheckboxes).filter(f => featureCheckboxes[f].checked).map(f => `--enable=${f}`),
      ],
      outputPaths: ['/out.stl']
    });

    runButton.disabled = true;
    setExecuting(true);
    try {
      const result = await lastJob;
      console.log(result);

      processMergedOutputs(editor, result.mergedOutputs, timestamp);

      function formatMillis(n) {
        if (n < 1000) {
          return `${Math.floor(n / 10) / 100} sec`;
        }
        return `${Math.floor(n / 100) / 10} sec`;
      }
      metaElement.innerText = `Render: ${formatMillis(result.elapsedMillis)}`;
      // \nExit code: ${result.exitCode}

      if (result.error) {
        console.error(result.error);
      } else {

        const [output] = result.outputs;
        if (output) {
          const [path, content] = output;
          return content;
        }
      }
    } catch (e) {
      console.error(e, e.stack);
    } finally {
      setExecuting(false);
      runButton.disabled = false;
    }
    // const instance = await OpenScad({ noInitialRun: true });
    // instance.FS.writeFile("/input.scad", source);//`cube(10);`);
    // instance.callMain(["/input.scad", "-o", "cube.stl", "--enable=fast-csg"]);
    // const output = await instance.FS.readFile("/cube.stl");

    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

stlViewer.model_loaded_callback = id => {
  // stlViewer.set_edges(id, true);
  stlViewer.set_color(id, '#f9d72c');
  stlViewer.set_auto_zoom(true);
}

var sourceFileName;
var editor;

async function render() {
  const output = await execute();

  if (output) {
    const fileName = "result.stl";
    const blob = new Blob([output], { type: "application/octet-stream" });

    try {
      stlViewer.remove_model(1);
    } catch (e) {
      console.warn(e);
    }
    stlViewer.add_model({ id: 1, local_file: new File([blob], fileName) });
    stlViewer.set_auto_resize(true);

    // metaElement.innerText = `${output.length} bytes`;
    linkContainerElement.innerHTML = '';
    addDownloadLink(linkContainerElement, blob, fileName);
  } else {
    metaElement.innerText = '';
  }
}

runButton.onclick = render;

function getState() {
  return {
    source: {
      name: sourceFileName,
      content: editor.getValue(),
    },
    autorender: autorenderCheckbox.checked,
    features: Object.keys(featureCheckboxes).filter(f => featureCheckboxes[f].checked),
    showExp: showExperimentalFeaturesCheckbox.checked,
    camera: stlViewer.get_camera_state()
  };
}

function normalizeSource(src) {
  return src.replaceAll(/\/\*.*?\*\/|\/\/.*?$/gm, '')
    .replaceAll(/([,.({])\s+/gm, '$1')
    .replaceAll(/\s+([,.({])/gm, '$1')
    .replaceAll(/\s+/gm, ' ')
    .trim()
}
function normalizeState(state) {
  return {
    ...state,
    source: {
      ...state.source,
      content: normalizeSource(state.source.content)
    }
  }
}

const defaultState = {
  source: {
    name: 'input.stl',
    content: 'cube(1);\ntranslate([0.5, 0.5, 0.5])\n\tcube(1);',
  }
};

function setState(state) {
  editor.setValue(state.source.content);
  sourceFileName = state.source.name || 'input.scad';
  if (state.camera) {
    stlViewer.set_camera_state(state.camera);
  }
  if (state.features) {
    const features = new Set(state.features);
    Object.keys(featureCheckboxes).forEach(f => featureCheckboxes[f].checked = features.has(f));
  }
  autorenderCheckbox.checked = state.autorender ?? true;
  showExperimentalFeaturesCheckbox.checked = state.showExp ?? true;
}

var previousNormalizedState;
function onStateChanged({allowRun}) {
  const newState = getState();
  writeStateInFragment(newState);

  featuresContainer.style.display = showExperimentalFeaturesCheckbox.checked ? null : 'none';

  const normalizedState = normalizeState(newState);
  if (JSON.stringify(previousNormalizedState) != JSON.stringify(normalizedState)) {
    previousNormalizedState = normalizedState;
    
    if (allowRun) {
      checkSyntax();
      if (autorenderCheckbox.checked) {
        render();
      }
    }
  }
}

function pollCameraChanges() {
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
    run: render,
  });

  editor.onDidChangeModelContent(() => {
    onStateChanged({allowRun: true});
  });

  // stlViewerElement.onclick = () => stlViewerElement.focus();
  stlViewerElement.onkeydown = e => {
    if (e.key === "Escape" || e.key === "Esc") editor.focus();
  };
  
  autorenderCheckbox.onchange = () => onStateChanged({allowRun: true});

  await buildFeatureCheckboxes(featuresContainer, featureCheckboxes, () => onStateChanged({allowRun: true}));

  setState(readStateFromFragment() || defaultState);
  
  showExperimentalFeaturesCheckbox.onchange = () => onStateChanged({allowRun: false});
  
  editor.focus();

  pollCameraChanges();
  onStateChanged({allowRun: true});

} catch (e) {
  console.error(e);
}
