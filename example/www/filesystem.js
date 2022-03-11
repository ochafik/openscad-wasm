const zipArchives = {
  'fonts': {},
  // @revarbat
  'BOSL': {},
  'BOSL2': {},
  // @nophead
  'NopSCADlib': {},
  // @thehans
  'FunctionalOpenSCAD': {},
  'funcutils': {},
  // @colyer
  'smooth-prim': {
    symlinks: {'smooth-prim.scad': 'smooth-prim.scad'},
  },
  'closepoints': {
    symlinks: {'closepoints.scad': 'closepoints.scad'},
  },
  'plot-function': {
    symlinks: {'plot-function.scad': 'plot-function.scad'},
  },
  // 'threads': {},
  // @sofian
  // 'openscad-tray': {
  //   symlinks: {'tray.scad': 'tray.scad'},
  // },
  // @mrWheel
  'YAPP_Box': {},
  // @Cantareus
  'Stemfie_OpenSCAD': {},
  // @UBaer21
  'UB.scad': {
    symlinks: {"ub.scad": "libraries/ub.scad"},
  },
};

async function getBrowserFSLibrariesMounts(archiveNames) {
  const Buffer = BrowserFS.BFSRequire('buffer').Buffer;
  const fetchData = async url => (await fetch(url)).arrayBuffer();
  const results = await Promise.all(archiveNames.map(async n => [n, await fetchData(`./libraries/${n}.zip`)]));
  
  const zipMounts = {};
  for (const [n, zipData] of results) {
    zipMounts[n] = {
      fs: "ZipFS",
      options: {
        zipData: Buffer.from(zipData)
      }
    }
  }
  return zipMounts;
}

function setupLibraries(archiveNames, FS, prefix='/libraries', cwd='/tmp') {
  const createSymlink = (target, source) => {
    // console.log('symlink', target, source);
    FS.symlink(target, source);
  };

  for (const n of archiveNames) {
    if (!(n in zipArchives)) throw `Archive named ${n} invalid (valid ones: ${Object.keys(zipArchives).join(', ')})`;
    const {symlinks} = (zipArchives)[n];
    if (symlinks) {
      for (const from in symlinks) {
        const to = symlinks[from];
        const target = to == '.' ? `${prefix}/${n}` : `${prefix}/${n}/${to}`;
        const source = from.startsWith('/') ? from : `${cwd}/${from}`;
        createSymlink(target, source);
      }
    } else {
      createSymlink(`${prefix}/${n}`, `${cwd}/${n}`);
    }
  }
}
