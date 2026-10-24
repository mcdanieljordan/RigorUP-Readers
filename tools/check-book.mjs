#!/usr/bin/env node
// QA check for one book folder.   Usage: node tools/check-book.mjs B001-K
// Prints PASS / WARN / FAIL lines. Exit code 1 if anything FAILs.
import fs from 'node:fs'; import path from 'node:path';

const id = process.argv[2];
if (!id) { console.error('Usage: node tools/check-book.mjs <book-id>   (example: B001-K)'); process.exit(2); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'books', id);
const out = []; let fails = 0;
const say = (lvl, msg) => { out.push(`${lvl.padEnd(4)}  ${msg}`); if (lvl === 'FAIL') fails++; };
const need = (ok, good, bad) => ok ? say('PASS', good) : say('FAIL', bad);

let book;
try { book = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'), 'utf8')); }
catch (e) { console.error('FAIL  cannot read books/' + id + '/book.json: ' + e.message); process.exit(1); }

// 1. required fields
for (const f of ['id', 'story', 'title', 'level', 'pages', 'questions'])
  need(book[f] !== undefined, `field "${f}" present`, `field "${f}" is missing`);
need(book.id === id, 'book id matches folder name', `book.id "${book.id}" does not match folder "${id}"`);

// 2. library entry matches
const lib = JSON.parse(fs.readFileSync(path.join(root, 'data/library.json'), 'utf8'));
const ver = lib.stories.flatMap(s => s.versions).find(v => v.id === id);
if (!ver) say('FAIL', 'book is not listed in data/library.json');
else {
  say('PASS', 'book is listed in data/library.json');
  need(ver.pages === book.pages.length, `library page count matches (${ver.pages})`, `library says ${ver.pages} pages but book has ${book.pages.length}`);
  need(ver.questions === book.questions.length, `library question count matches (${ver.questions})`, `library says ${ver.questions} questions but book has ${book.questions.length}`);
  const rq = book.questions.filter(q => q.type === 'choice').length, mq = book.questions.filter(q => q.type === 'number').length;
  need(ver.readingQuestions === rq && ver.mathQuestions === mq, `reading/math counts match (${rq}/${mq})`, `library reading/math counts (${ver.readingQuestions}/${ver.mathQuestions}) differ from book (${rq}/${mq})`);
}

// 3. pages: text present, images exist
let missingImg = 0, missingText = 0;
book.pages.forEach((p, i) => {
  if (!p.text || !p.text.trim()) { missingText++; say('FAIL', `page ${i + 1} has no text`); }
  if (!fs.existsSync(path.join(dir, p.image))) missingImg++;
});
need(missingText === 0, `all ${book.pages.length} pages have text`, `${missingText} pages missing text`);
if (missingImg) say('WARN', `${missingImg} of ${book.pages.length} page images are not in books/${id}/ yet (the app shows a placeholder)`);
else say('PASS', 'all page images exist');

// 4. questions
const ids = new Set(); let qProblems = 0;
for (const q of book.questions) {
  const bad = m => { qProblems++; say('FAIL', `${q.id}: ${m}`); };
  if (ids.has(q.id)) bad('duplicate id'); ids.add(q.id);
  if (!q.prompt) bad('no prompt'); if (!q.hint) bad('no hint'); if (!q.explanation) bad('no explanation');
  if (q.type === 'choice') {
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 4) bad('needs 2 to 4 choices');
    else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) bad('answer index is outside the choices');
    if (new Set(q.choices).size !== q.choices.length) bad('two choices are identical');
    if (!Number.isInteger(q.page) || q.page < 1 || q.page > book.pages.length) bad(`page ${q.page} is outside 1..${book.pages.length}`);
  } else if (q.type === 'number') {
    if (!Number.isInteger(q.answer)) bad('answer must be a whole number');
    if (q.answer > (q.max ?? 10)) bad(`answer ${q.answer} is bigger than the number pad (${q.max ?? 10})`);
    if (q.helper) {
      const { a, b, op } = q.helper, want = op === 'add' ? a + b : a - b;
      if (want !== q.answer) bad(`answer ${q.answer} does not match helper math (${a} ${op === 'add' ? '+' : '-'} ${b} = ${want})`);
    }
  } else bad(`unknown type "${q.type}"`);
}
need(qProblems === 0, `all ${book.questions.length} questions look good`, `${qProblems} question problems (listed above)`);

// 5. reading level (sentence length) against the level rules in the project instructions
const limits = { K: 8, '1': 10, '2': 12, 'K-2': 12 };
const limit = limits[book.level] ?? limits[book.gradeBand];
if (limit) {
  const long = [];
  book.pages.forEach((p, i) => p.text.split(/(?<=[.!?”"])\s+/).forEach(s => {
    const w = s.replace(/[^\w’' -]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    if (w > limit) long.push(`p${i + 1} (${w} words)`);
  }));
  if (long.length) say('WARN', `${long.length} sentences are longer than ${limit} words: ${long.slice(0, 8).join(', ')}${long.length > 8 ? ', ...' : ''}`);
  else say('PASS', `all sentences are ${limit} words or fewer`);
}

// 6. target words (optional: "targetWords": ["word", ...] in book.json)
if (Array.isArray(book.targetWords)) {
  const all = book.pages.map(p => p.text.toLowerCase()).join(' ');
  for (const w of book.targetWords) {
    const n = (all.match(new RegExp('\\b' + w.toLowerCase() + '\\b', 'g')) || []).length;
    n >= 4 ? say('PASS', `target word "${w}" appears ${n} times`) : say('WARN', `target word "${w}" appears only ${n} times (aim for 4 or more)`);
  }
} else say('WARN', 'no "targetWords" list in book.json (add one to check word repeats)');

console.log(`Checking books/${id}\n` + out.join('\n') + `\n\n${fails ? fails + ' FAIL' : 'No FAILs'}`);
process.exit(fails ? 1 : 0);
