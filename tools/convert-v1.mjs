// One-time converter: v1 (data.js + book.json) -> books/B001-K/book.json
import fs from 'node:fs'; import vm from 'node:vm';
const src = fs.readFileSync('/tmp/fontwork/v1-data.js','utf8') + '\n;globalThis.__out={reading,math};';
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
const {reading, math} = ctx.__out;
const v1pages = JSON.parse(fs.readFileSync('/tmp/fontwork/v1-book.json','utf8'));
const skillFor = n => [1,2,3,5,6,7,8,10,11,12,13,14,21].includes(n) ? 'Story details & events'
  : [4,9,17,19,20].includes(n) ? 'Feelings & learning strategies' : 'Meaning, clues & inference';
const questions = [];
reading.forEach((r,i)=>questions.push({
  id:'r'+(i+1), type:'choice', skill:skillFor(i+1), prompt:r[0], choices:r[1], answer:r[2],
  page:r[3], hint:r[4], explanation:r[5]
}));
math.forEach((m,i)=>{
  const [group,a,b,op,noun,emoji]=m, ans = op==='add'?a+b:a-b;
  questions.push({
    id:'m'+(i+1), type:'number', skill: op==='add'?'Addition within 10':'Subtraction within 10',
    group, prompt:`Ensley ${op==='add'?'saw':'had'} ${a} ${noun}. ${op==='add'?`${b} more joined them`:`${b} went away`}. How many ${noun} ${op==='add'?'were there altogether':'were left'}?`,
    answer:ans, max:10, helper:{a,b,op,emoji,noun},
    hint: op==='add'?`Start with ${a}. Count ${b} more.`:`Start with ${a}. Cross out ${b}, then count what stays.`,
    explanation:`${a} ${op==='add'?'plus':'minus'} ${b} equals ${ans}. ${op==='add'?'Count both groups together.':'Count the objects that are left.'}`
  });
});
const book = {
  id:'B001-K', story:'B001', title:"Who Took Ensley's Color Away?", level:'K-2', gradeBand:'K-2',
  intro:"Welcome, rainbow explorer! Read Ensley's story. Answer reading and math questions to earn Lit Bucks. You get two tries. If an answer is tricky, use the hint and try again. Mistakes help your rainbow grow!",
  textInImage:true, completionGift:40, mathAfterPage:'end',
  pages: v1pages.map(p=>({text:p.text, image:'pages/'+p.image.split('/').pop()})),
  questions
};
fs.writeFileSync('books/B001-K/book.json', JSON.stringify(book,null,1));
console.log('pages',book.pages.length,'questions',questions.length);
