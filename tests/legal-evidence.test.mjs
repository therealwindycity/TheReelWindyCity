import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundledMinutes, ordinanceBlocks, matchMeasure, actionEvidence, matchSameMeeting, buildEvidence, refreshEvidence, minutesSource } from '../scripts/analysis/legal-evidence.mjs';

const indexed = JSON.parse(readFileSync('src/data/official-meetings.json','utf8'));
const make = (date, clip) => ({id:`city-council-${date}`, body:'city-council',date,official:{minutes:`https://cheyenne.granicus.com/MinutesViewer.php?view_id=5&clip_id=${clip}`}});
const meetings=[make('2026-01-12',1050), make('2026-01-26',1053), make('2026-02-09',1060)];
const raw=readFileSync('pipeline/notebooklm/cheyenne_minutes_2026.md','utf8');
const january=JSON.parse(readFileSync('src/data/jan-26-agenda-items.json','utf8'));
const minutes=bundledMinutes(meetings,raw);

test('local minutes require exact meeting date, governing body, and publisher clip',()=>{
  assert.equal(Object.keys(minutes).length,3);
  assert.equal(Object.keys(bundledMinutes([make('2026-01-26',9999)],raw)).length,0);
  assert(indexed.cityCouncil.length > 0);
});
test('real minutes link related items and distinguish postponement from final approval',()=>{
  const result=buildEvidence(meetings,{meetings:{'city-council-2026-01-26':{items:january}}},minutes);
  const entries=result.meetings['city-council-2026-01-26'];
  const warrant=entries['6'].evidence;
  assert.equal(warrant.find(e=>e.date==='2026-01-26').outcome,'not established');
  assert.equal(warrant.find(e=>e.date==='2026-02-09').outcome,'main approval motion recorded as carried');
  const annexation=entries['7'].evidence;
  assert.deepEqual(annexation.map(e=>[e.date,e.reading]),[['2026-01-12',1],['2026-01-26',2],['2026-02-09',3]]);
  assert.equal(annexation.at(-1).outcome,'approval motion recorded as carried');
  assert.equal(entries['11'].evidence[0].outcome,'text mention only; action not established');
  assert(!entries['7'].evidence.some(e=>e.excerpt.includes('16 parcels of land totaling')));
});
test('amendment and postponement motions cannot be mistaken for passage',()=>{
  const cases=[
    'ORDINANCE – 3rd READING – An example. Mr A moved to approve on third and final reading. Mr B moved to postpone. Motion carried.',
    'ORDINANCE – 3rd READING – An example. Mr A moved to approve on third and final reading. Mr B moved to amend. Motion carried.',
    'ORDINANCE – 3rd READING – An example. Mr A moved to approve on second reading. Motion carried.',
    'ORDINANCE – 3rd READING – An example. Referred to committee.\nRESOLUTION – Other business. Mr A moved to approve on third and final reading. Motion carried.',
  ];
  for (const sample of cases) assert.equal(actionEvidence(ordinanceBlocks(sample)[0]).outcome,'not established');
});
test('ambiguous or short matches are refused, and unrelated meeting action is not inferred',()=>{
  assert.equal(matchMeasure('ORDINANCE – 1st READING – Short title', ordinanceBlocks('ORDINANCE –1st READING – Short title')),null);
  const item={text:'A distinct fiscal budget resolution with twelve or more individual words designed to match a single exact record'};
  assert(matchSameMeeting(item, item.text + ' Motion carried.'));
  assert.equal(matchSameMeeting(item,item.text + ' and again ' + item.text),null);
});
test('failed retries preserve same-source minutes, while changed source discards stale evidence',async()=>{
  const a=make('2026-01-26',1053), b=make('2026-02-09',1060);
  const cache={ [a.id]:{requestedUrl:minutesSource(a),text:'a'.repeat(500)},[b.id]:{requestedUrl:'https://cheyenne.granicus.com/wrong',text:'b'.repeat(500)} };
  await refreshEvidence([a,b],cache,{limit:2,now:()=> '2026-03-01T00:00:00Z',get:async()=>{throw Error('unavailable')}});
  assert.equal(cache[a.id].text.length,500); assert.equal(cache[a.id].lastError,'unavailable');
  assert.equal(cache[b.id].text,undefined);
});
