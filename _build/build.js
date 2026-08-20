#!/usr/bin/env node
/* ==========================================================================
   Kinder Minds — guide page builder

   Assembles the pages in guide/ from the sources in _build/pages/ by expanding
   partials from _build/partials/.

   Why this exists: the registration & consent stage is a quarter of every guide
   page and byte-identical across all of them. It carries the consent forms, the
   guardian-consent rule and the Care of Children Act wording — content where
   one page silently drifting out of step with the others is a real problem, not
   a cosmetic one. Held in one file, it can only be wrong once.

   Usage
     node _build/build.js           build every page into guide/
     node _build/build.js --check   verify guide/ matches its sources without
                                    writing anything (exit 1 on drift)

   Syntax, in a source page:
     <!--@include partial-name-->

   A marker occupies its whole line, and the partial replaces that line
   verbatim. Partials are stored with their indentation already correct, so
   there is no re-indentation step — nothing that could quietly reflow content.
   The marker is an HTML comment, so a source file is still valid HTML and
   opens in a browser.

   Line endings are preserved exactly. The repo is CRLF, and a build that
   rewrote endings would turn every rebuild into a whole-file diff.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(__dirname, 'pages');
const PARTS_DIR = path.join(__dirname, 'partials');
const OUT_DIR   = path.join(ROOT, 'guide');

/* The trailing \r is matched by lookahead, not consumed: consuming it would
   replace a CRLF line ending with a bare LF and quietly mix line endings
   through every built file. */
const INCLUDE = /^[ \t]*<!--@include[ \t]+([a-z0-9-]+)[ \t]*-->[ \t]*(?=\r?$)/gm;

function readPartial(name) {
  const file = path.join(PARTS_DIR, name + '.html');
  if (!fs.existsSync(file)) {
    throw new Error('unknown partial "' + name + '" (expected ' + path.relative(ROOT, file) + ')');
  }
  // Drop only a single trailing newline; the marker line supplies its own.
  return fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '');
}

function expand(text, seen, where) {
  return text.replace(INCLUDE, function (_match, name) {
    if (seen.indexOf(name) !== -1) {
      throw new Error('include cycle in ' + where + ': ' + seen.concat(name).join(' -> '));
    }
    return expand(readPartial(name), seen.concat(name), where);
  });
}

function build(file) {
  return expand(fs.readFileSync(path.join(PAGES_DIR, file), 'utf8'), [], file);
}

function main() {
  const check = process.argv.indexOf('--check') !== -1;
  const pages = fs.readdirSync(PAGES_DIR).filter(function (f) { return /\.html$/.test(f); });

  if (!pages.length) {
    console.error('no sources in _build/pages');
    process.exit(1);
  }

  let drift = 0;

  pages.forEach(function (page) {
    const built = build(page);
    const dest = path.join(OUT_DIR, page);
    const existing = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;

    if (check) {
      if (existing !== built) {
        drift++;
        console.error('DRIFT      ' + page + ' — guide/ does not match its source');
      } else {
        console.log('ok         ' + page);
      }
      return;
    }

    if (existing === built) {
      console.log('unchanged  ' + page);
    } else {
      fs.writeFileSync(dest, built, 'utf8');
      console.log('written    ' + page + '  (' + built.length + ' chars)');
    }
  });

  if (check && drift) {
    console.error('\n' + drift + ' page(s) out of date — run: node _build/build.js');
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error('build failed:', err.message);
  process.exit(1);
}
