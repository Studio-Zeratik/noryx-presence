#!/usr/bin/env node
/**
 * Blocks a commit that would add a secret (token, key, webhook…) or a private settings file.
 * Run by .githooks/pre-commit on the staged changes only. Enabled per clone with:
 *   git config core.hooksPath .githooks
 *
 * A false alarm (an example value, a test fixture)? Put `secret-scan: allow` on that line.
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Files that must never be committed */
const FORBIDDEN_FILES = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(local|production|development|prod|dev)$/,
  /(^|\/)\.dev\.vars$/,
  /(^|\/)\.dev\.vars\.[^/]+$/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/,
  /(^|\/)service-?account[^/]*\.json$/i,
];

/** Secrets recognised by their shape */
const PATTERNS = [
  ['Discord bot token', /\b[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/],
  ['Discord webhook', /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{30,}/],
  ['Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{20,}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+/]{40,}/],
  ['Cloudflare API token', /\b(?:CF|CLOUDFLARE)_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/],
  // NAME_SECRET = "long value", NAME_TOKEN: 'long value', etc. (placeholders like xxx or <...> are fine)
  ['Secret value', /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|WEBHOOK_URL)\b\s*[=:]\s*["']?(?!x{3}|<|your|change|example|exemple|remplacer|\$\{|process\.env|env\.)[A-Za-z0-9_\-+/=.:]{20,}/],
];

const ALLOW = /secret-scan:\s*allow/i;

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
const problems = [];

for (const file of staged) {
  if (FORBIDDEN_FILES.some((re) => re.test(file)) && !/\.example$/.test(file)) problems.push(`${file}: this file must never be committed`);
}

const diff = git('diff', '--cached', '-U0', '--diff-filter=ACMR', '--no-color');
let file = '';
let line = 0;
for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ ')) {
    file = raw.replace(/^\+\+\+ (b\/)?/, '');
    continue;
  }
  const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  if (hunk) {
    line = Number(hunk[1]);
    continue;
  }
  if (!raw.startsWith('+') || raw.startsWith('+++')) continue;
  const text = raw.slice(1);
  if (!ALLOW.test(text) && !/package-lock\.json$/.test(file)) {
    for (const [name, re] of PATTERNS) {
      if (re.test(text)) {
        problems.push(`${file}:${line}: looks like a ${name}`);
        break;
      }
    }
  }
  line++;
}

if (problems.length) {
  console.error('\n✋ Commit blocked: it looks like a secret is about to be committed.\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error('\nMove the value to .env / .dev.vars (never committed) or `npx wrangler secret put NAME`,');
  console.error('then commit again. False alarm? Add `secret-scan: allow` on that line.\n');
  process.exit(1);
}
