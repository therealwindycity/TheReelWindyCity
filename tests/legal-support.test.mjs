import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHtmlItems, assemble } from '../scripts/analysis/legal-audit.mjs';
import { extractPdfLayout } from '../scripts/lib/pdf-layout.mjs';
import { safeSupportingUrl, findCitations, scanText, documentQueue, refreshSupport, assembleSupport } from '../scripts/analysis/legal-support.mjs';

const html=readFileSync('public/sources/2026-01-26-agenda.html','utf8');
const entries=parseHtmlItems(html);
const url=n=>`https://cheyenne.granicus.com/MetaViewer.php?view_id=2&clip_id=1053&meta_id=${n}`;

test('actual official agenda maps documents to exact parent and subitems without leakage',()=>{
  assert.deepEqual(entries.find(e=>e.number==='6').supporting.map(d=>d.url),[url(145737),url(145738)]);
  assert.deepEqual(entries.find(e=>e.number==='7').supporting.map(d=>d.url),[url(145740)]);
  assert.deepEqual(entries.find(e=>e.number==='22(b)').supporting.map(d=>d.url),[url(145788),url(145963)]);
  assert.equal(entries.find(e=>e.number==='22').supporting.length,0);
  const m={id:'city-council-2026-01-26',official:{},date:'2026-01-26'};
  const record=assemble([m],{}).meetings[m.id];
  assert.equal(record.items.find(e=>e.number==='6').supporting[1].url,url(145738));
});
test('only explicitly cited statutes are extracted, preserving separate sections',()=>{
  assert.deepEqual(findCitations('W.S. §§ 16-4-112 & 16-4-113, 15-1-402. See Wyo. Stat. § 15-1-115(c).'),['16-4-112','16-4-113','15-1-402','15-1-115(c)']);
  assert.deepEqual(findCitations('UDC section 15-1-402 and code 16-4-113.'),[]);
  assert(!safeSupportingUrl('https://evil.example/MetaViewer.php?meta_id=4'));
  assert(!safeSupportingUrl('https://cheyenne.granicus.com:444/MetaViewer.php?meta_id=4'));
  assert(!safeSupportingUrl('https://person@cheyenne.granicus.com/MetaViewer.php?meta_id=4'));
  assert(!safeSupportingUrl('https://cheyenne.granicus.com/MetaViewer.php?meta_id=../foo'));
});
test('scans the actual bundled fire department brief, not a signed ordinance',async()=>{
  const bytes=readFileSync('public/sources/2026-01-26-warrants.pdf');
  const layout=await extractPdfLayout(new Uint8Array(bytes));
  assert.match(layout.text,/Policy Brief for the Governing Body/);
  const found=scanText(layout.text);
  assert(found.snippets.length>0);
  assert(found.snippets.every(s=>layout.text.replace(/\s+/g,' ').includes(s.excerpt)));
});
test('queues each source once, never promotes error to finding, and preserves previous extraction',async()=>{
  const agenda={meetings:{m:{items:[{number:'6',text:'First item',supporting:[{label:'A',url:url(1)}]},{number:'7',text:'Second item',supporting:[{label:'B',url:url(1)},{label:'C',url:url(2)}]}]}}};
  const cache={[url(1)]:{requestedUrl:url(1),fetchedAt:'old',snippets:[{topic:'notice',label:'Notice or service',excerpt:'No notice was sent.'}],citations:[]}};
  assert.equal(documentQueue(agenda,cache,20).length,2);
  await refreshSupport(agenda,cache,{limit:2,now:()=> '2026-02-01T00:00:00Z',get:async()=>{throw Error('publisher offline')}});
  const result=assembleSupport(agenda,cache).meetings.m;
  assert.equal(result['6'].documents[0].lastError,'publisher offline');
  assert.equal(result['6'].documents[0].snippets[0].excerpt,'No notice was sent.');
  assert.deepEqual(result['7'].documents[1].snippets,[]);
  assert.equal(result['6'].itemText,'First item');
});
test('short and invalid documents fail closed',()=>{
  assert.throws(()=>scanText('notice'),/too short/);
  const prose='No certified mail was sent. ' + 'An applicant may ask for a hearing. '.repeat(10);
  const found=scanText(prose);
  assert(found.snippets.some(x=>x.excerpt.includes('No certified mail was sent.')));
  assert(!Object.hasOwn(found,'compliant'));
});

test('an unrecognized table resets association so a document is never silently attributed to the previous item',()=>{
  const table=(number,text)=>`<table><tr><td>${number}.</td><td>${text}</td></tr></table>`;
  const fake=`${table(1,'First real entry')}<table><tr><td>unknown</td><td>something else</td></tr></table><a class="Document" href="${url(50)}">Supporting Document</a>${table(2,'Second real entry')}${table(3,'Third real entry')}`;
  const parsed=parseHtmlItems(fake);
  assert.equal(parsed.length,3);
  assert.equal(parsed[0].supporting.length,0);
});
