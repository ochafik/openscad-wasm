const zipArchives = {
  'fonts': {},
  // @openscad
  'MCAD': {},
  // @revarbat
  'BOSL': {},
  'BOSL2': {
    // "includes": {
    //   "BOSL2/std.scad": "The Belfry OpenScad Library, v2.0. An OpenSCAD library of shapes, masks, and manipulators to make working with OpenSCAD easier. BETA"
    // }
  },
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
  'openscad-tray': {
    symlinks: {'tray.scad': 'tray.scad'},
  },
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

async function symlinkLibraries(archiveNames, FS, prefix='/libraries', cwd='/tmp') {
  const createSymlink = async (target, source) => {
    // console.log('symlink', target, source);
    await FS.symlink(target, source);
    // await symlink(target, source);
  };

  await Promise.all(archiveNames.map(n => (async () => {
    if (!(n in zipArchives)) throw `Archive named ${n} invalid (valid ones: ${Object.keys(zipArchives).join(', ')})`;
    const {symlinks} = (zipArchives)[n];
    if (symlinks) {
      for (const from in symlinks) {
        const to = symlinks[from];
        const target = to == '.' ? `${prefix}/${n}` : `${prefix}/${n}/${to}`;
        const source = from.startsWith('/') ? from : `${cwd}/${from}`;
        await createSymlink(target, source);
      }
    } else {
      await createSymlink(`${prefix}/${n}`, `${cwd}/${n}`);
    }
  })()));
}

function configureAndInstallFS(windowOrSelf, options) {
  return new Promise(async (resolve, reject) => {
    BrowserFS.install(windowOrSelf);
    BrowserFS.configure(options, function (e) { if (e) reject(e); else resolve(); });
  });
}

async function createEditorFS(workingDir='/home') {
  const archiveNames = Object.keys(zipArchives);
  const librariesMounts = await getBrowserFSLibrariesMounts(archiveNames);
  const allMounts = {};
  for (const n in librariesMounts) {
    allMounts[`${workingDir}/${n}`] = librariesMounts[n];
  }

  await configureAndInstallFS(window, {
    fs: "OverlayFS",
    options: {
      readable: {
        fs: "MountableFileSystem",
        options: {
          ...allMounts,
        }
      },
      writable: {
        fs: "InMemory"
      },
    },
  });

  var fs = BrowserFS.BFSRequire('fs');
  // const symlink = (target, source) => new Promise((res, rej) => fs.symlink(target, source, (err) => err ? rej(err) : res()));

  // await setupLibraries(archiveNames, symlink, '/libraries', workingDir);
  return fs;
}
