// Learning report for grown-ups. Pure functions: data in, HTML or CSV text out.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TIPS = {
  'Addition within 10': 'Build two groups with small objects. Count them together and say the number sentence.',
  'Subtraction within 10': 'Start with a group, move some away, and count what remains.',
  'Story details & events': 'Return to the story page with the clue. Ask the child to point to it before answering.',
  'Feelings & learning strategies': 'Talk about how the character felt. Connect the feeling to something that happened in the story.',
  'Meaning, clues & inference': 'Ask “What in the story makes you think that?” Accept explanations the story supports.'
};
const DEFAULT_TIP = 'Go back to the story together. Ask the child to point to the clue and explain their thinking.';

export const secondsLabel = n => (n === null || n === undefined ? 'Not recorded' : n.toFixed(1) + ' s');
export const durationLabel = n => { const s = Math.floor(n || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export function rows(book, prog) {
  return book.questions.map(q => {
    const a = prog?.attempts?.[q.id], r = a?.responses || [];
    return {
      id: q.id, subject: q.type === 'number' ? 'math' : 'reading', skill: q.skill || 'Practice',
      question: q.prompt, expected: String(q.type === 'number' ? q.answer : q.choices[q.answer]),
      status: !a ? 'Not started' : !a.done ? 'In progress' : a.firstCorrect ? 'Correct first try' : a.correct ? 'Correct second try' : 'Incorrect after two tries',
      first: a?.answers?.[0] ?? '', second: a?.answers?.[1] ?? '',
      firstSeconds: r[0]?.seconds ?? null, secondSeconds: r[1]?.seconds ?? null,
      totalSeconds: a && typeof a.elapsed === 'number' ? a.elapsed : null,
      tries: a?.tries || 0, firstCorrect: !!a?.firstCorrect, correct: !!a?.correct, done: !!a?.done,
      lb: a?.lb ?? 0, hint: !!a?.hintUsed || (!!a && a.tries > 1), counters: !!a?.usedCounters,
      timer: r[0]?.timer || 'Not recorded', date: a?.updatedAt || r.at(-1)?.at || null
    };
  });
}

export function summary(book, prog, recordingCount = 0) {
  const rs = rows(book, prog), done = rs.filter(x => x.done), timed = rs.filter(x => x.firstSeconds !== null);
  const finalCorrect = done.filter(x => x.correct).length;
  const bySkill = [...new Set(rs.map(x => x.skill))].map(skill => {
    const d = rs.filter(x => x.skill === skill && x.done);
    return { skill, total: d.length, missed: d.filter(x => !x.firstCorrect).length, tip: TIPS[skill] || DEFAULT_TIP };
  }).filter(x => x.total && x.missed).sort((a, b) => b.missed / b.total - a.missed / a.total);
  return {
    rows: rs, total: rs.length, completed: done.length, firstCorrect: done.filter(x => x.firstCorrect).length, finalCorrect,
    retries: done.filter(x => x.correct && !x.firstCorrect).length, incorrect: done.filter(x => !x.correct).length,
    inProgress: rs.filter(x => x.status === 'In progress').length, unanswered: rs.filter(x => x.status === 'Not started').length,
    grade: done.length ? Math.round(100 * done.filter(x => x.firstCorrect).length / done.length) : null,
    finalAccuracy: done.length ? Math.round(100 * finalCorrect / done.length) : null,
    avgFirst: timed.length ? timed.reduce((n, x) => n + x.firstSeconds, 0) / timed.length : null,
    answerSeconds: rs.reduce((n, x) => n + (x.totalSeconds || 0), 0),
    lb: rs.reduce((n, x) => n + x.lb, 0), hints: rs.filter(x => x.hint).length, counters: rs.filter(x => x.counters).length,
    recordings: recordingCount, advice: bySkill
  };
}

export function reportHtml({ profiles, owner, books, book, prog, recordingCount }) {
  const st = summary(book, prog, recordingCount);
  const stats = [
    [st.grade === null ? '—' : st.grade + '%', 'First-try accuracy'], [st.finalAccuracy === null ? '—' : st.finalAccuracy + '%', 'After both tries'],
    [st.completed + '/' + st.total, 'Questions completed'], [st.retries, 'Successful retries'], [st.incorrect, 'Still needs review'],
    [secondsLabel(st.avgFirst), 'Average first answer time'], [st.lb, 'LB from questions'], [st.recordings, 'Saved reading takes']
  ];
  return `<span class="eyebrow">Parent and teacher learning report</span><h2>Small steps, clearly seen</h2>
  <div class="row no-print"><button class="button secondary small" data-act="parent">← Settings</button>
    <select id="reportReader" aria-label="Select reader" style="max-width:220px">${profiles.map(x => `<option value="${esc(x.id)}" ${x.id === owner.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <select id="reportBook" aria-label="Select book" style="max-width:320px">${books.map(b => `<option value="${esc(b.id)}" ${b.id === book.id ? 'selected' : ''}>${esc(b.title)} · ${esc(b.level)}</option>`).join('')}</select></div>
  <div class="row no-print" style="margin:18px 0"><button class="button small" data-act="printreport">🖨 Print this report</button><button class="button ghost small" data-act="csv">↓ Question data (CSV)</button></div>
  <p class="print-only"><strong>Reader:</strong> ${esc(owner.name)} · <strong>Book:</strong> ${esc(book.title)} (${esc(book.level)}) · ${new Date().toLocaleDateString()}</p>
  <div class="grid four report-stats">${stats.map(([n, l]) => `<div class="report-stat"><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join('')}</div>
  <p class="note">Accuracy uses completed questions only. Answer time counts active time after Ready or an answer choice. These activity records do not measure reading fluency or diagnose learning needs.</p>
  <div class="grid two"><div class="panel"><h3>Learning support</h3><p>${st.hints} questions used a second-try hint.<br>${st.counters} questions used counting helpers.<br>${st.unanswered} not started · ${st.inProgress} in progress.</p>
   ${st.advice.length ? st.advice.map(a => `<p><strong>${esc(a.skill)}</strong> · ${a.missed}/${a.total} needed another look.<br>${esc(a.tip)}</p>`).join('') : '<p>As more questions are completed, focused practice suggestions will appear here.</p>'}</div>
   <div class="panel"><h3>Reading and rewards</h3><p>${(prog?.read || []).length}/${book.pages.length} pages visited<br>${durationLabel(st.answerSeconds)} active answer time<br>${owner.lifetime} lifetime LB · ${owner.balance} LB available<br>${owner.owned.length} creatures collected<br>${prog?.completed ? 'Completion gift earned' : 'Completion gift not earned yet'}</p>
   <button class="button secondary small no-print" data-act="review">Review voice recordings</button></div></div>
  <h3 style="margin-top:24px">Question-by-question evidence</h3>
  <div class="scroll"><table class="analytics-table"><thead><tr><th>Question</th><th>Answers</th><th>Result</th><th>Time</th><th>LB / support</th></tr></thead><tbody>
  ${st.rows.map(r => `<tr><td><strong>${r.subject === 'reading' ? 'Reading' : 'Math'} ${esc(r.id.slice(1))}</strong><br>${esc(r.question)}<br><small class="muted">${esc(r.skill)}</small></td><td>${r.first ? '1: ' + esc(r.first) : '—'}${r.second ? '<br>2: ' + esc(r.second) : ''}<br><small>Key: ${esc(r.expected)}</small></td><td>${esc(r.status)}</td><td>1: ${secondsLabel(r.firstSeconds)}<br>2: ${secondsLabel(r.secondSeconds)}<br>Total: ${secondsLabel(r.totalSeconds)}</td><td>${r.lb} LB<br>${r.hint ? 'Hint used' : ''}${r.counters ? '<br>Counting helper' : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

export function resultsCsv(owner, book, prog) {
  const head = ['Reader', 'Book ID', 'Question ID', 'Subject', 'Skill', 'Question', 'Correct Answer', 'First Answer', 'Second Answer', 'Status', 'First Try Correct', 'Final Correct', 'Attempts', 'First Answer Seconds', 'Second Answer Seconds', 'Total Active Seconds', 'Lit Bucks Earned', 'Hint Used', 'Counting Helper Used', 'Timer Mode', 'Last Answered At'];
  const cell = v => { let s = String(v ?? ''); if (/^[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  return '﻿' + [head, ...rows(book, prog).map(r => [owner.name, book.id, r.id, r.subject, r.skill, r.question, r.expected, r.first, r.second, r.status, r.firstCorrect, r.correct, r.tries, r.firstSeconds?.toFixed(2) ?? '', r.secondSeconds?.toFixed(2) ?? '', r.totalSeconds?.toFixed(2) ?? '', r.lb, r.hint, r.counters, r.timer, r.date ? new Date(r.date).toISOString() : ''])]
    .map(row => row.map(cell).join(',')).join('\r\n');
}
