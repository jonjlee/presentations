#!/usr/bin/env node
/*
 * Writes presentations.json, the list the gallery page reads, from the files here.
 * Every .html file below this folder is a presentation, so adding one is a copy and
 * removing one is a delete. Runs after each publish and again in the Pages workflow.
 *
 * A presentation's card comes from the file itself:
 *   <meta name="present-card">   title, summary, date, notes, live. Written by publish.mjs.
 *   <title>                      the title, for a page that was copied in by hand
 *   an image with the same name  the card picture, e.g. deck.jpg beside deck.html
 *
 * live means the page speaks the live worker's postMessage protocol, from live.ts in
 * the templates, so the gallery offers to present it. A card without live has its
 * file searched for the protocol instead. An encrypted page cannot be searched.
 */

import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp'];
// Cards and titles sit in the head. Presentations are megabytes, so only the start is read.
const HEAD_BYTES = 64 * 1024;
// live.ts announcing itself, minified or not. publish.mjs uses the same test.
const LIVE_PROTOCOL = /present\s*:\s*["'`]ready["'`]/;

function htmlFiles(folder = '') {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') && path !== 'index.html' ? [path] : [];
  });
}

function readHead(path) {
  const buffer = Buffer.alloc(HEAD_BYTES);
  const file = openSync(join(root, path), 'r');
  const length = readSync(file, buffer, 0, HEAD_BYTES, 0);
  closeSync(file);
  return buffer.toString('utf8', 0, length);
}

const unescape = (text) => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[name]);

function describe(path) {
  const head = readHead(path);
  const card = head.match(/<meta name="present-card" content="([^"]*)">/)?.[1];
  const fields = card ? JSON.parse(unescape(card)) : {};
  const name = path.slice(0, -'.html'.length);
  const image = IMAGE_TYPES.map((type) => `${name}.${type}`).find((file) => existsSync(join(root, file)));
  return {
    path,
    title: unescape(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? '') || name.split('/').at(-1),
    ...fields,
    live: fields.live ?? LIVE_PROTOCOL.test(readFileSync(join(root, path), 'utf8')),
    image,
    protected: head.includes('<meta name="present-protected"'),
  };
}

const site = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'));
const presentations = htmlFiles().sort().map(describe);
writeFileSync(join(root, 'presentations.json'), JSON.stringify({ ...site, presentations }, null, 2) + '\n');
console.log(`listed ${presentations.length} presentation${presentations.length === 1 ? '' : 's'}`);
