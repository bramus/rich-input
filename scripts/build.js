import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcPackageDir = path.join(rootDir, 'src', 'js', 'rich-search');
const distDir = path.join(rootDir, 'dist');

console.log('Building dist package...');

// 1. Clean and recreate dist directory
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

// 2. Copy all package source files (index.js, components/, utils/) into dist/
fs.cpSync(srcPackageDir, distDir, { recursive: true });

// 3. Copy root metadata files
const rootFiles = ['README.md', 'LICENSE'];
for (const file of rootFiles) {
  const srcPath = path.join(rootDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(distDir, file));
  }
}

// 4. Prepare and rewrite package.json for dist
const pkgPath = path.join(rootDir, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // Strip internal scripts so published consumers don't get them
  delete pkg.scripts;

  // Replace ./dist/ with ./ so all export/entry paths point to the root of the published package
  const distPkgContent = JSON.stringify(pkg, null, 2).replaceAll('./dist/', './') + '\n';

  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    distPkgContent,
    'utf8'
  );
}

console.log('Successfully prepared ./dist for publishing!');
