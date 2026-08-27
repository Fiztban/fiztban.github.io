#!/usr/bin/env node
/* ==========================================================================
   Kinder Minds — guide page builder

   Assembles the guide pages from the sources in _build/pages/, expanding
   partials from _build/partials/, and publishes them as a VERSIONED set.

   Why partials: the registration & consent stage is a quarter of every guide
   page and byte-identical across all of them. It carries the consent forms,
   the guardian-consent rule and the Care of Children Act wording — content
   where one page silently drifting out of step with the others is a real
   problem. Held in one file, it can only be wrong once.

   Why versions: a family's personalised link is a record of the fees, service
   structure and terms they were quoted. When those change, the page they were
   sent must survive untouched. So every page is published twice —

     guide/<page>.html              the current version (leaflet links)
     guide/<version>/<page>.html    the dated copy that personalised links use

   — together with private copies of the stylesheet and scripts, so a dated
   folder never reaches back into guide/ for anything. The version comes from
   _build/versions.json, which lists every release: date, what kind of change,
   and which services' quoted content moved. The build only ever writes the
   LATEST version's folder. Older folders are frozen; --check asks git whether
   anything has touched them.

   Wording and layout fixes are not releases. They are built into the current
   folder in place, which is what that folder is for.

   The cut guard: when a release's folder is created for the first time, each
   page is compared against the previous folder (which holds every in-place
   edit made since that release, so the difference is exactly this release's
   change). A page that differs but is not listed in the release's `services`
   stops the build. Shared figures live on several pages — a component price
   appears on three assessments — and this is what stops a release listing one
   service when three actually moved.

   Usage
     node _build/build.js           build every page into guide/ and the
                                    latest version folder
     node _build/build.js --check   verify everything matches without writing
                                    (exit 1 on drift)

   Syntax, in a source page or partial:
     <!--@include partial-name-->   on its own line; replaced verbatim
     <!--@version-->                inline; replaced by the version line

   Partials are stored with their indentation already correct, so there is no
   re-indentation step — nothing that could quietly reflow content. Line
   endings are preserved exactly (the repo is LF, pinned by .gitattributes).
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(__dirname, 'pages');
const PARTS_DIR = path.join(__dirname, 'partials');
const REGISTRY  = path.join(__dirname, 'versions.json');
const OUT_DIR   = path.join(ROOT, 'guide');

/* Hand-written files every version folder carries a private copy of. */
const SUPPORT = ['guide.css', 'guide.js', 'guide-core.js', 'masthead-v2.js'];

/* The trailing \r is matched by lookahead, not consumed: consuming it would
   replace a CRLF line ending with a bare LF and quietly mix line endings
   through every built file. */
const INCLUDE = /^[ \t]*<!--@include[ \t]+([a-z0-9-]+)[ \t]*-->[ \t]*(?=\r?$)/gm;

const VERSION_MARK = /<!--@version-->/g;
/* What the marker becomes; the cut guard strips it back out to compare. */
const VERSION_LINE = /<p class="guide-version"[^>]*>.*?<\/p>/g;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

/* ---------------------------------------------------------------- partials */

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

function assemble(file) {
  return expand(fs.readFileSync(path.join(PAGES_DIR, file), 'utf8'), [], file);
}

/* ---------------------------------------------------------------- registry */

function loadRegistry(pageNames) {
  const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const versions = reg.versions;
  if (!Array.isArray(versions) || !versions.length) {
    throw new Error('versions.json lists no versions');
  }
  versions.forEach(function (v, i) {
    const where = 'versions.json entry ' + (i + 1);
    if (!/^\d{8}$/.test(v.version || '')) {
      throw new Error(where + ': version must be yyyymmdd, got "' + v.version + '"');
    }
    const iso = v.version.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    if (v.effective !== iso) {
      throw new Error(where + ': effective "' + v.effective + '" does not match version ' + v.version);
    }
    if (i && versions[i - 1].version >= v.version) {
      throw new Error(where + ': versions must be listed oldest first');
    }
    if (!Array.isArray(v.services) || !v.services.length) {
      throw new Error(where + ': services must name at least one page');
    }
    v.services.forEach(function (s) {
      if (pageNames.indexOf(s) === -1) {
        throw new Error(where + ': no source page named "' + s + '"');
      }
    });
  });
  pageNames.forEach(function (n) {
    if (!effectiveFor(versions, n)) {
      throw new Error('versions.json: "' + n + '" appears in no release, so it has no effective date');
    }
  });
  return versions;
}

/* The release in which this service's quoted content last changed. */
function effectiveFor(versions, name) {
  for (let i = versions.length - 1; i >= 0; i--) {
    if (versions[i].services.indexOf(name) !== -1) { return versions[i]; }
  }
  return null;
}

function longDate(iso) {
  const p = iso.split('-').map(Number);
  return p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
}

function versionLine(release, effective) {
  const attrs = ' data-release="' + release.version + '" data-effective="' + effective.effective + '"';
  const t = function (iso) { return '<time datetime="' + iso + '">' + longDate(iso) + '</time>'; };
  if (release.version === effective.version) {
    return '<p class="guide-version"' + attrs + '>Guide version ' + t(release.effective) + '</p>';
  }
  return '<p class="guide-version"' + attrs + '>Guide release ' + t(release.effective) +
         ' &middot; fees and terms for this service effective ' + t(effective.effective) + '</p>';
}

function stamp(html, line, where) {
  let n = 0;
  const out = html.replace(VERSION_MARK, function () { n++; return line; });
  if (n !== 1) {
    throw new Error(where + ': expected exactly one <!--@version--> marker, found ' + n);
  }
  return out;
}

function unstamp(html) {
  return html.replace(VERSION_LINE, '<!--@version-->');
}

/* --------------------------------------------------------------- cut guard */

function cutGuard(versions, latest, built) {
  const prev = versions[versions.length - 2];
  if (!prev) { return; }   // the first release has nothing to compare against

  const prevDir = path.join(OUT_DIR, prev.version);
  if (!fs.existsSync(prevDir)) {
    throw new Error('guide/' + prev.version + ' is missing, so what release ' + latest.version + ' changes cannot be verified');
  }

  const unlisted = [], unchanged = [];
  Object.keys(built).forEach(function (page) {
    const name = page.replace(/\.html$/, '');
    const prevFile = path.join(prevDir, page);
    const before = fs.existsSync(prevFile) ? unstamp(fs.readFileSync(prevFile, 'utf8')) : null;
    const changed = before !== unstamp(built[page]);
    const listed = latest.services.indexOf(name) !== -1;
    if (changed && !listed) { unlisted.push(name); }
    if (!changed && listed) { unchanged.push(name); }
  });

  if (unchanged.length) {
    console.warn('note: listed in release ' + latest.version + ' but identical to guide/' + prev.version +
                 ': ' + unchanged.join(', ') + ' (expected for a terms-only release)');
  }
  if (unlisted.length) {
    throw new Error('release ' + latest.version + ' changes pages it does not list: ' + unlisted.join(', ') +
                    '.\n  Either add them to its services, or — if the change is wording, not fees — build BEFORE' +
                    ' adding the registry entry so it lands in guide/' + prev.version + ' in place, then cut.');
  }
}

/* Older version folders must exist (a family holds a link into each) and
   must not have been edited. The build never writes them; git says whether
   anything else has. */
function frozenProblems(versions) {
  const frozen = versions.slice(0, -1).map(function (v) { return 'guide/' + v.version; });
  const problems = [];
  frozen.forEach(function (dir) {
    if (!fs.existsSync(path.join(ROOT, dir))) { problems.push(dir + ' is missing'); }
  });
  if (!frozen.length) { return problems; }
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--'].concat(frozen),
                             { cwd: ROOT, encoding: 'utf8' });
    out.split(/\r?\n/).filter(Boolean).forEach(function (line) {
      problems.push('frozen folder touched: ' + line.trim());
    });
  } catch (e) {
    console.warn('note: could not ask git about frozen folders (' + String(e.message).split('\n')[0] + ')');
  }
  return problems;
}

/* -------------------------------------------------------------------- main */

function main() {
  const check = process.argv.indexOf('--check') !== -1;
  const pages = fs.readdirSync(PAGES_DIR).filter(function (f) { return /\.html$/.test(f); });

  if (!pages.length) {
    console.error('no sources in _build/pages');
    process.exit(1);
  }

  const versions = loadRegistry(pages.map(function (p) { return p.replace(/\.html$/, ''); }));
  const latest = versions[versions.length - 1];
  const creating = !fs.existsSync(path.join(OUT_DIR, latest.version));

  const built = {};
  pages.forEach(function (page) {
    const name = page.replace(/\.html$/, '');
    built[page] = stamp(assemble(page), versionLine(latest, effectiveFor(versions, name)), page);
  });

  if (creating) { cutGuard(versions, latest, built); }

  /* Everything the build owns, as [path under guide/, content]. */
  const targets = [];
  pages.forEach(function (page) {
    targets.push([page, built[page]]);
    targets.push([latest.version + '/' + page, built[page]]);
  });
  SUPPORT.forEach(function (f) {
    const src = path.join(OUT_DIR, f);
    if (!fs.existsSync(src)) { throw new Error('guide/' + f + ' is missing'); }
    targets.push([latest.version + '/' + f, fs.readFileSync(src, 'utf8')]);
  });
  targets.push(['versions.json', fs.readFileSync(REGISTRY, 'utf8')]);

  let drift = 0;
  targets.forEach(function (t) {
    const rel = t[0], content = t[1];
    const dest = path.join(OUT_DIR, rel);
    const existing = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;

    if (check) {
      if (existing !== content) {
        drift++;
        console.error('DRIFT      guide/' + rel);
      } else {
        console.log('ok         guide/' + rel);
      }
      return;
    }

    if (existing === content) {
      console.log('unchanged  guide/' + rel);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, 'utf8');
      console.log('written    guide/' + rel + '  (' + content.length + ' chars)');
    }
  });

  const frozen = frozenProblems(versions);
  frozen.forEach(function (p) { console.error('FROZEN     ' + p); });

  if (check && (drift || frozen.length)) {
    if (drift) { console.error('\n' + drift + ' file(s) out of date — run: node _build/build.js'); }
    if (frozen.length) { console.error('\nfrozen version folders must not change; restore them from git'); }
    process.exit(1);
  }
  if (!check && creating) {
    console.log('\ncreated guide/' + latest.version + ' — tag this release once committed');
  }
}

try {
  main();
} catch (err) {
  console.error('build failed:', err.message);
  process.exit(1);
}
