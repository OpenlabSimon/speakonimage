#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

function main() {
  const [leftPath, rightPath] = process.argv.slice(2);

  if (!leftPath || !rightPath) {
    console.error('Usage: node scripts/compare-live-diagnostics.js <fake-mic.json> <real-mic.json>');
    process.exit(1);
  }

  const left = readDiagnostics(leftPath);
  const right = readDiagnostics(rightPath);

  const report = {
    left: buildSampleSummary(leftPath, left),
    right: buildSampleSummary(rightPath, right),
    timingDiffs: compareNumericSection(left.timings || {}, right.timings || {}),
    audioStatDiffs: compareNumericSection(left.audioStats || {}, right.audioStats || {}),
    routeDiffs: compareObjectSection(left.route || {}, right.route || {}),
    environmentDiffs: compareObjectSection(left.environment || {}, right.environment || {}),
    errorDiffs: compareObjectSection(left.error || {}, right.error || {}),
    timeline: compareTimeline(left.timeline || [], right.timeline || []),
  };

  console.log(JSON.stringify(report, null, 2));
}

function readDiagnostics(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed?.timeline)) {
    throw new Error(`Unsupported diagnostics format: ${inputPath}`);
  }

  return parsed;
}

function buildSampleSummary(inputPath, diagnostics) {
  return {
    file: path.resolve(inputPath),
    sessionId: diagnostics.sessionId,
    currentState: diagnostics.currentState,
    fallbackActive: diagnostics.fallbackActive,
    route: diagnostics.route || {},
    error: diagnostics.error || null,
    timelineNames: diagnostics.timeline.map((entry) => entry.name),
  };
}

function compareNumericSection(left, right) {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  const diffs = [];

  for (const key of keys) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (typeof leftValue !== 'number' && typeof rightValue !== 'number') {
      continue;
    }

    diffs.push({
      key,
      left: leftValue ?? null,
      right: rightValue ?? null,
      delta: typeof leftValue === 'number' && typeof rightValue === 'number'
        ? rightValue - leftValue
        : null,
    });
  }

  return diffs;
}

function compareObjectSection(left, right) {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  const diffs = [];

  for (const key of keys) {
    const leftValue = left[key] ?? null;
    const rightValue = right[key] ?? null;
    if (JSON.stringify(leftValue) === JSON.stringify(rightValue)) {
      continue;
    }

    diffs.push({
      key,
      left: leftValue,
      right: rightValue,
    });
  }

  return diffs;
}

function compareTimeline(leftTimeline, rightTimeline) {
  const leftNames = leftTimeline.map((entry) => entry.name);
  const rightNames = rightTimeline.map((entry) => entry.name);
  const leftSet = new Set(leftNames);
  const rightSet = new Set(rightNames);

  return {
    leftOnly: leftNames.filter((name, index) => !rightSet.has(name) && leftNames.indexOf(name) === index),
    rightOnly: rightNames.filter((name, index) => !leftSet.has(name) && rightNames.indexOf(name) === index),
    shared: leftNames.filter((name, index) => rightSet.has(name) && leftNames.indexOf(name) === index),
    firstDifferentIndex: findFirstDifferentIndex(leftNames, rightNames),
  };
}

function findFirstDifferentIndex(leftNames, rightNames) {
  const maxLength = Math.max(leftNames.length, rightNames.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (leftNames[index] !== rightNames[index]) {
      return {
        index,
        left: leftNames[index] ?? null,
        right: rightNames[index] ?? null,
      };
    }
  }

  return null;
}

main();
