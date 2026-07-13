#!/usr/bin/env node
/**
 * build.js — Create a distributable ZIP file for the extension
 * Usage: npm run build
 * Output: dist/gestureyt-1.1.0.zip
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PKG = require('../package.json');
const VERSION = PKG.version;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const ZIP_NAME = `gestureyt-${VERSION}.zip`;
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

// Files/folders to include in the ZIP
const INCLUDE = [
  'manifest.json',
  'background.js',
  'content.js',
  'gesture-engine.js',
  'styles.css',
  'popup.html',
  'popup.css',
  'popup.js',
  'icons',
  'mediapipe',
  'README.md',
  'LICENSE'
];

// Files to exclude
const EXCLUDE = [
  'node_modules',
  'dist',
  '.git',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'scripts',
  'CHANGELOG.md',
  '.claude'
];

async function build() {
  try {
    // Create dist directory if it doesn't exist
    if (!fs.existsSync(DIST_DIR)) {
      fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Remove old zip if exists
    if (fs.existsSync(ZIP_PATH)) {
      fs.unlinkSync(ZIP_PATH);
    }

    const output = fs.createWriteStream(ZIP_PATH);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        const sizeKB = (archive.pointer() / 1024).toFixed(2);
        console.log(`✓ Built: ${ZIP_NAME} (${sizeKB} KB)`);
        console.log(`  Location: ${ZIP_PATH}`);
        resolve();
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add included files
      for (const file of INCLUDE) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            archive.directory(filePath, file);
          } else {
            archive.file(filePath, { name: file });
          }
        }
      }

      archive.finalize();
    });
  } catch (err) {
    console.error('✗ Build failed:', err.message);
    process.exit(1);
  }
}

build();
