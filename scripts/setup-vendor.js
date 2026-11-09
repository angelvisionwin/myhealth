'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const targetRoot = path.join(projectRoot, 'public', 'vendor');

const vendorFiles = [
  {
    packageName: '@tabler/core',
    source: 'dist/css/tabler.min.css',
    target: 'tabler/css/tabler.min.css'
  },
  {
    packageName: '@tabler/core',
    source: 'dist/js/tabler.min.js',
    target: 'tabler/js/tabler.min.js'
  },
  {
    packageName: 'chart.js',
    source: 'dist/chart.umd.min.js',
    target: 'chartjs/chart.umd.min.js'
  }
];

function findPackageDirectory(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return path.join(projectRoot, 'node_modules', ...packageName.split('/'));
  }
}

const targetDirectories = new Set(vendorFiles.map((file) => file.target.split('/')[0]));

for (const directory of targetDirectories) {
  fs.rmSync(path.join(targetRoot, directory), { recursive: true, force: true });
}

for (const file of vendorFiles) {
  const packageDirectory = findPackageDirectory(file.packageName);
  const sourcePath = path.join(packageDirectory, file.source);
  const targetPath = path.join(targetRoot, file.target);

  if (!fs.existsSync(sourcePath)) {
    console.error(
      `[setup-vendor] No se encontró ${file.packageName}/${file.source}. Ejecuta "npm install" antes de arrancar.`
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

console.log(
  `[setup-vendor] Recursos locales copiados: ${[...targetDirectories].join(', ')} en ${path.relative(
    projectRoot,
    targetRoot
  )}`
);
