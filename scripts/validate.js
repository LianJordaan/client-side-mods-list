#!/usr/bin/env node
/*
 * Validator for data/client-only.json.
 *
 * This list drives unattended file removal on live Minecraft servers. The Cloudflare Worker
 * refuses to publish a file that fails these checks, but finding out at deploy time is too late
 * — this runs in CI so a bad edit never reaches main.
 *
 * The check that matters most is not "is this valid JSON". It is "does any matcher accidentally
 * match everything": an empty prefix, an empty regex, or `.*` would sweep every unprotected jar
 * in a server's mods/ folder into mods_disabled/.
 *
 *   node scripts/validate.js
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'client-only.json');

const SUPPORTED_SCHEMA = 1;
const SIDENESS = new Set(['client-only', 'client-optional']);
const CONFIDENCE = new Set(['verified', 'high', 'heuristic']);
const LOADERS = new Set(['fabric', 'forge', 'neoforge', 'quilt', '*']);

// Patterns that match every possible filename. Each of these is a server-wipe waiting to happen.
const UNIVERSAL = new Set(['', '.*', '^.*$', '.+', '^', '(?:)', '.*?']);

const errors = [];
const warnings = [];

const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function checkSelector(match, where) {
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    err(`${where}: match must be an object`);
    return;
  }

  let usable = 0;

  const filename = match.filename;
  if (filename !== undefined && filename !== null) {
    if (typeof filename !== 'object' || Array.isArray(filename)) {
      err(`${where}: match.filename must be an object`);
    } else {
      for (const field of ['equals', 'prefix', 'regex']) {
        for (const entry of asList(filename[field])) {
          if (typeof entry !== 'string') {
            err(`${where}: filename.${field} contains a non-string`);
            continue;
          }
          if (entry.length === 0) {
            err(`${where}: filename.${field} contains an EMPTY string — this matches every file`);
            continue;
          }
          if (field === 'regex') {
            if (UNIVERSAL.has(entry.trim())) {
              err(`${where}: filename.regex "${entry}" matches every file`);
              continue;
            }
            try {
              new RegExp(entry);
            } catch (e) {
              err(`${where}: filename.regex "${entry}" does not compile`);
              continue;
            }
          }
          // A one- or two-character prefix will collide with unrelated mods.
          if (field === 'prefix' && entry.length < 3) {
            warn(`${where}: filename.prefix "${entry}" is very short and will over-match`);
          }
          usable++;
        }
      }
    }
  }

  for (const platform of ['modrinth', 'curseforge']) {
    const block = match[platform];
    if (block === undefined || block === null) continue;
    if (typeof block !== 'object' || Array.isArray(block)) {
      err(`${where}: match.${platform} must be an object`);
      continue;
    }
    for (const field of ['projectId', 'slug']) {
      for (const entry of asList(block[field])) {
        if (typeof entry === 'number') { usable++; continue; }
        if (typeof entry !== 'string' || entry.length === 0) {
          err(`${where}: ${platform}.${field} must be a non-empty string or a number`);
          continue;
        }
        usable++;
      }
    }
  }

  if (usable === 0) {
    err(`${where}: has no usable matcher — it can never match anything`);
  }
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (e) {
    console.error(`FATAL: cannot read ${FILE}: ${e.message}`);
    process.exit(1);
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error(`FATAL: data/client-only.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) {
    err('schemaVersion must be a positive integer');
  } else if (doc.schemaVersion > SUPPORTED_SCHEMA) {
    warn(`schemaVersion is ${doc.schemaVersion} but consumers only understand ${SUPPORTED_SCHEMA} — they will fail open and strip nothing`);
  }

  if (typeof doc.listVersion !== 'string' || doc.listVersion.length === 0) {
    warn('listVersion is missing — the panel shows this to operators for support');
  }

  if (!Array.isArray(doc.rules) || doc.rules.length === 0) {
    err('rules must be a non-empty array');
    doc.rules = [];
  }

  if (!Array.isArray(doc.neverRemove)) {
    err('neverRemove must be an array');
    doc.neverRemove = [];
  } else if (doc.neverRemove.length === 0) {
    err('neverRemove is empty — this is the hard safety net that stops a bad rule deleting Fabric API');
  }

  const seen = new Set();

  doc.rules.forEach((rule, i) => {
    const where = `rules[${i}]${rule && rule.id ? ` (${rule.id})` : ''}`;

    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      err(`${where}: must be an object`);
      return;
    }
    if (typeof rule.id !== 'string' || rule.id.length === 0) {
      err(`${where}: missing a non-empty id`);
    } else if (seen.has(rule.id)) {
      err(`${where}: duplicate id`);
    } else {
      seen.add(rule.id);
    }

    if (!SIDENESS.has(rule.sideness)) {
      err(`${where}: sideness must be one of ${[...SIDENESS].join(', ')}`);
    }
    if (!CONFIDENCE.has(rule.confidence)) {
      err(`${where}: confidence must be one of ${[...CONFIDENCE].join(', ')}`);
    }

    for (const loader of asList(rule.loaders)) {
      if (!LOADERS.has(loader)) {
        err(`${where}: unknown loader "${loader}"`);
      }
    }

    // The rule that keeps servers bootable: anything auto-strippable needs stated evidence.
    const autoStrips = rule.sideness === 'client-only'
      && (rule.confidence === 'verified' || rule.confidence === 'high');

    if (autoStrips) {
      if (!Array.isArray(rule.evidence) || rule.evidence.length === 0) {
        err(`${where}: auto-strips (client-only + ${rule.confidence}) but records no evidence`);
      }
      if (/\b(lib|api|core)\b/i.test(rule.id) || /\blibrary\b/i.test(rule.notes || '')) {
        warn(`${where}: looks like a library but auto-strips. Libraries must be client-optional — nothing here reads dependency graphs, and a stripped library takes every dependent down with it.`);
      }
    }

    checkSelector(rule.match, where);
  });

  doc.neverRemove.forEach((entry, i) => {
    const where = `neverRemove[${i}]${entry && entry.id ? ` (${entry.id})` : ''}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      err(`${where}: must be an object`);
      return;
    }
    checkSelector(entry.match, where);
  });

  // Report.
  const rules = doc.rules.length;
  const autoStrip = doc.rules.filter(
    (r) => r && r.sideness === 'client-only' && (r.confidence === 'verified' || r.confidence === 'high')
  ).length;

  console.log(`data/client-only.json — schema ${doc.schemaVersion}, version ${doc.listVersion}`);
  console.log(`  ${rules} rules (${autoStrip} auto-strip), ${doc.neverRemove.length} protected libraries`);
  console.log('');

  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);

  if (errors.length > 0) {
    console.log(`\nFAILED: ${errors.length} error(s). The Worker would refuse to publish this.`);
    process.exit(1);
  }

  console.log(warnings.length > 0
    ? `\nPASSED with ${warnings.length} warning(s).`
    : '\nPASSED.');
}

main();
