#!/usr/bin/env node
/**
 * Generates nl/index.html and fr/index.html from index.html.
 *
 * Why a build step rather than runtime switching: the user asked for real /nl and
 * /fr URLs. A static host serves those from nl/index.html and fr/index.html, so the
 * translated pages have to exist as files. Keeping three hand-maintained copies of
 * an 800 KB catalogue would guarantee they drift, so English stays the single
 * source and the other two are regenerated from it plus a dictionary.
 *
 * What is translated: the interface and the editorial copy — navigation, labels,
 * buttons, page headings, the checklist and prep guidance, the legal text.
 *
 * What is deliberately NOT translated: programme names, school names, and the
 * figures/blurbs in the catalogue. "MSc Data Science" at UCL is called that on the
 * application form, and a student searching for it needs the name the school
 * actually uses. Translating 668 programme blurbs would also create 668 new places
 * for a factual error to appear without any of them being re-verified.
 *
 * Untranslated strings fall back to English rather than breaking, so the dictionary
 * can grow incrementally. Run `node build-i18n.js` after editing index.html.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "index.html");
const LANGS = [
  { code: "nl", dir: "nl", label: "Nederlands", htmlLang: "nl" },
  { code: "fr", dir: "fr", label: "Français", htmlLang: "fr" },
];

function loadDict(code) {
  const file = path.join(ROOT, "i18n", `${code}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing dictionary: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Replacement has to be context-aware, not global. A naive global replace turns
// openFields:["Any"] into openFields:["Alles"] and silently breaks the eligibility
// matching — the first draft of this script made 902 substitutions from 174 phrases,
// which is the shape of exactly that bug. So a key is only substituted where it is
// unambiguously display text:
//
//   1. a whole HTML text node            >Key<
//   2. a whole user-facing attribute     placeholder="Key"  aria-label="Key"  title="Key"
//   3. a whole JS string literal         "Key"     — only for keys ≥ 30 chars, i.e. full
//                                                    sentences that cannot collide with data
//   4. a whole template literal          `Key`     — for keys containing ${...}
//
// Anything shorter than 30 characters therefore never touches script data; it can only
// be replaced where it is already sitting in the markup as visible text.
const JS_LITERAL_MIN = 30;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Longest first, so a long sentence is replaced before a short phrase inside it.
function applyDict(html, dict) {
  const keys = Object.keys(dict).filter(k => k !== "_comment").sort((a, b) => b.length - a.length);
  const unused = [];
  let replaced = 0;

  for (const key of keys) {
    const value = dict[key];
    if (!value || value === key) continue;
    let hits = 0;
    const k = escapeRe(key);

    const sub = (re, build) => {
      html = html.replace(re, (...args) => { hits++; return build(...args); });
    };

    if (key.includes("${")) {
      sub(new RegExp("`" + k + "`", "g"), () => "`" + value + "`");
    } else {
      // allow surrounding whitespace: markup often reads ">\n      Key\n    <"
      sub(new RegExp(">(\\s*)" + k + "(\\s*)<", "g"), (m, a, b2) => ">" + a + value + b2 + "<");
      sub(new RegExp('(placeholder|aria-label|title)="' + k + '"', "g"), (m, attr) => `${attr}="${value}"`);
      if (key.length >= JS_LITERAL_MIN) sub(new RegExp('"' + k + '"', "g"), () => `"${value}"`);
      // Short UI labels that live in a JS lookup rather than in markup — the odds
      // bands and the eligibility badges. Anchoring on the property name keeps this
      // away from catalogue data, which never uses these keys.
      sub(new RegExp('(label|eligible|check|mismatch): "' + k + '"', "g"), (m, prop) => `${prop}: "${value}"`);
    }

    if (!hits) unused.push(key); else replaced += hits;
  }
  return { html, unused, replaced };
}

function setLangAttrs(html, lang) {
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang.htmlLang}"`);

  // Rewrite both switchers so the current language is the active pill.
  html = html.replace(/class="lang-opt is-active" aria-current="true"/g, 'class="lang-opt"');
  const marker = new RegExp(`(<a href="\\.\\./${lang.dir}/index\\.html" hreflang="${lang.code}" )class="lang-opt"`, "g");
  html = html.replace(marker, `$1class="lang-opt is-active" aria-current="true"`);
  return html;
}

// The generated pages live one directory down, so every relative path in them has to
// climb back out. Absolute "/assets/..." would be wrong on a project-path deployment
// (e.g. GitHub Pages at /campusatlas/), so "../" is used instead — that works whether
// the site is served from a domain root or a subpath.
function fixRelativePaths(html) {
  html = html.replace(/(src|href)="assets\//g, '$1="../assets/');
  // language switcher: from /nl/ or /fr/, English is one level up
  html = html.replace(/<a href="index\.html" hreflang="en"/g, '<a href="../index.html" hreflang="en"');
  html = html.replace(/<a href="nl\/index\.html" hreflang="nl"/g, '<a href="../nl/index.html" hreflang="nl"');
  html = html.replace(/<a href="fr\/index\.html" hreflang="fr"/g, '<a href="../fr/index.html" hreflang="fr"');
  return html;
}

function build() {
  if (!fs.existsSync(SRC)) throw new Error("index.html not found");
  const source = fs.readFileSync(SRC, "utf8");
  const report = [];

  for (const lang of LANGS) {
    const dict = loadDict(lang.code);
    let { html, unused, replaced } = applyDict(source, dict);
    html = fixRelativePaths(html);
    html = setLangAttrs(html, lang);

    const outDir = path.join(ROOT, lang.dir);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);

    const total = Object.keys(dict).length;
    report.push({ lang: lang.code, phrases: total, replaced, missing: unused });
  }

  for (const r of report) {
    console.log(`${r.lang}: ${r.phrases} phrases in dictionary, ${r.replaced} replacements made`);
    if (r.missing.length) {
      console.log(`  ${r.missing.length} dictionary entries no longer match index.html (stale — the English copy changed):`);
      r.missing.slice(0, 15).forEach(m => console.log(`    · ${m.slice(0, 90)}`));
      if (r.missing.length > 15) console.log(`    … and ${r.missing.length - 15} more`);
    }
  }
}

build();
