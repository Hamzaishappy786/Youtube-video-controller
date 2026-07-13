#!/usr/bin/env node
/**
 * tag-release.js — Create a git tag and commit for the current version
 * Usage: npm run tag
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PKG = require('../package.json');
const VERSION = `v${PKG.version}`;
const TAG_MESSAGE = `Release ${VERSION}`;

function run(cmd, silent = false) {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
    return output.trim();
  } catch (err) {
    console.error(`✗ Command failed: ${cmd}`);
    console.error(err.message);
    process.exit(1);
  }
}

async function tagRelease() {
  try {
    // Check if tag already exists
    const tags = run('git tag', true).split('\n');
    if (tags.includes(VERSION)) {
      console.log(`ℹ Tag ${VERSION} already exists.`);
      return;
    }

    // Check for uncommitted changes
    const status = run('git status --porcelain', true);
    if (status) {
      console.log('ℹ Uncommitted changes found. Staging release files...');
      run('git add package.json CHANGELOG.md manifest.json');
      run(`git commit -m "chore: bump version to ${PKG.version}"`);
    }

    // Create and push the tag
    run(`git tag -a ${VERSION} -m "${TAG_MESSAGE}"`);
    console.log(`✓ Created tag: ${VERSION}`);

    const isOnGithub = run('git config --get remote.origin.url', true).includes('github.com');
    if (isOnGithub) {
      console.log('\nTo push the tag to GitHub, run:');
      console.log(`  git push origin ${VERSION}`);
    }
  } catch (err) {
    console.error('✗ Tag creation failed:', err.message);
    process.exit(1);
  }
}

tagRelease();
