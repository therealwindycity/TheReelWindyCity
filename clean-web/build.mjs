import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(), mode=process.argv[2];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=u=>{try{const p=new URL(u);return p.protocol==='https:'&&!p.username&&!p.password?u:null;}catch{return null;}};
function write(p,s){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);}
if(mode==='--stage'){
  const source=json('src/data/meetings.json');
  if(!Array.isArray(source.meetings)||!source.meetings.length)throw Error('No public catalog to stage');
  const rows=new Map();
  for(const r of source.meetings){
    if(!/^[a-z0-9][a-z0-9-]{0,199}$/.test(r.id)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||new Date(r.date+'T12:00:00Z').toISOString().slice(0,10)!==r.date)throw Error('Invalid meeting identity or date');
    if(typeof r.bodyLabel!=='string'||!r.bodyLabel.trim())throw Error('Missing public body');
    const official=Object.fromEntries(Object.entries(r.official||{}).filter(([k,v])=>['agenda','minutes','video','granicus'].includes(k)&&safe(v)));
    const refs=list=>{if(!Array.isArray(list))throw Error('References must be arrays');return list.map(d=>{
      const allowed=new Set(['cheyenne-archives-2008-2013','cheyenne-archives-2014-2017','cheyenne-archives-2018-2021','cheyenne-archives-2022','cheyenne-archives-2023-2024','cheyenne-archives-2025-2026','The-Real-Windy-City-','TheReelWindyCity']);
      if(!allowed.has(d.repo)||typeof d.path!=='string'||!d.path||d.path.includes('\\')||d.path.startsWith('/')||d.path.split('/').some(x=>!x||x==='..'||x==='.') )throw Error('Unapproved public reference');
      const out={repo:d.repo,path:d.path};for(const [k,n]of [['sha256',64],['sha512',128]])if(d[k]){if(!new RegExp('^[a-fA-F0-9]{'+n+'}$').test(d[k]))throw Error('Invalid digest');out[k]=d[k];}return out;});};
    const row={id:r.id,date:r.date,bodyLabel:r.bodyLabel,time:typeof r.time==='string'?r.time:null,location:typeof r.location==='string'?r.location:null,official,documents:refs(r.docs||[]),transcripts:refs(r.transcripts||(r.transcript?[r.transcript]:[])),calendarStatus:r.calendarStatus||'unknown',items:(r.items||[]).filter(x=>typeof x.text==='string').map(x=>({number:String(x.number??''),text:x.text}))};
    if(rows.has(row.id)&&JSON.stringify(rows.get(row.id))!==JSON.stringify(row))throw Error('Conflicting duplicate '+row.id);rows.set(row.id,row);
  }
  const meetings=[...rows.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const catalog={schema:1,meta:{total_meetings:meetings.length,min_date:meetings.at(-1).date,max_date:meetings[0].date,total_documents:meetings.reduce((n,r)=>n+r.documents.length,0),total_transcripts:meetings.reduce((n,r)=>n+r.transcripts.length,0),count_basis:'Per-meeting document and transcript references; not independent retrieval verification'},meetings};
  const bytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
  const status={schema:1,project_credit:'CM',catalog_sha256:hash(bytes),snapshot_captured:source.captured??null,source_check:source.liveCheck??null,last_harvest_utc:null,warning:'Source timestamps preserved from committed input; this staging step performs no live retrieval. Structural acceptance is not factual verification.'};
  write(path.join(root,'public/data/verified_catalog.json.tmp'),bytes);fs.renameSync(path.join(root,'public/data/verified_catalog.json.tmp'),path.join(root,'public/data/verified_catalog.json'));
  write(path.join(root,'public/data/system_status.json'),JSON.stringify(status,null,2)+'\n');
  console.log(JSON.stringify({staged:meetings.length,catalog_sha256:hash(bytes)}));
}else if(mode==='--build'){
  const conf=json('config/release_manifest.json'),status=json('public/data/system_status.json');
  const bytes=fs.readFileSync(path.join(root,'public/data/verified_catalog.json'));
  if(hash(bytes)!==status.catalog_sha256)throw Error('Catalog/status digest mismatch');
  const cat=JSON.parse(bytes);if(cat.schema!==1||cat.meta.total_meetings!==cat.meetings.length)throw Error('Invalid catalog counts');
  const out=path.join(root,'clean-web/out');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
  const base='/TheReelWindyCity',href=p=>base+'/'+p.replace(/^\//,'');
  const names={upcoming_meetings:['Posted meetings',''],meeting_archive:['Archive','meetings/'],client_search:['Search','search/'],jurisdiction_directory:['Jurisdictions','jurisdictions/'],status_and_corrections:['Status & corrections','status/']};
  const enabled=k=>conf.features[k]===true;
  const footer=enabled('attribution_footer')?'<footer>Project direction &amp; civic engineering by Charles Miller (CM). Original public records credited to their respective issuing municipal bodies.</footer>':'';
  const shell=(title,body)=>'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' · Civic Cheyenne</title><style>body{max-width:76rem;margin:auto;padding:1.2rem;font:1.1rem/1.6 system-ui;color:#152c40;background:#fff}a{color:#0058a8}nav ul{display:flex;flex-wrap:wrap;gap:1.3rem;padding-left:1.2rem}article{border:1px solid #9aaabd;padding:1rem;margin:1rem 0}footer{border-top:1px solid;margin-top:2rem;padding-top:1rem}.skip{position:absolute;left:-10000px}.skip:focus{position:static}input,select{font:inherit;padding:.4rem}code{overflow-wrap:anywhere}</style><body><a class="skip" href="#main-content">Skip to main content</a><header><p>Civic Cheyenne — Independent public-record index</p><nav aria-label="Main navigation"><ul>'+Object.entries(names).filter(([k])=>enabled(k)).map(([,v])=>'<li><a href="'+href(v[1])+'">'+v[0]+'</a></li>').join(' ')+'</ul></nav></header><main id="main-content"><h1>'+esc(title)+'</h1>'+body+'</main>'+footer+'</body></html>';
  const page=(p,t,b)=>write(path.join(out,p,'index.html'),shell(t,b));
  const card=r=>'<article><h2><a href="'+href('meetings/'+r.id+'/')+'">'+esc(r.bodyLabel)+'</a></h2><p>'+esc([r.date,r.time,r.location].filter(Boolean).join(' · '))+'</p><p>'+r.documents.length+' document references · '+r.transcripts.length+' transcript references</p></article>';
  const check=status.source_check;const checkState=check?.ok===false?'failed':!check?.observedAt?'unknown':'snapshot-only';
  const warning='<p data-schedule-check="'+checkState+'">Published snapshot, not a live calendar. Last recorded check: '+esc(check?.observedAt||'unknown')+'. Source health: '+esc(check?.ok===true?'check reported success at recorded time':check?.ok===false?'check reported failure':'unknown')+'. Confirm cancellations, time changes, and participation details with the official source.</p>';
  if(enabled('upcoming_meetings'))page('','Posted meeting information','<h2 id="upcoming-meetings-title">Upcoming status requires a current source check</h2>'+warning+'<p><a href="https://www.cheyennecity.org/Your-Government/City-Council/Minutes-and-Agendas">Official City of Cheyenne calendar</a></p><p>Newest dated records are shown below; a future date alone does not confirm the meeting remains scheduled.</p>'+[...cat.meetings].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8).map(card).join(''));
  if(enabled('meeting_archive'))page('meetings','Meeting archive','<p>'+cat.meta.total_meetings+' meetings · '+esc(cat.meta.min_date)+' through '+esc(cat.meta.max_date)+'</p>'+cat.meetings.map(card).join(''));
  const reference=d=>{const u='https://github.com/therealwindycity/'+encodeURIComponent(d.repo)+'/blob/main/'+d.path.split('/').map(encodeURIComponent).join('/');return '<li><a href="'+esc(u)+'">'+esc(d.path)+'</a> · Source reference; retrieval not certified'+(d.sha256?' · Supplied SHA-256: <code>'+esc(d.sha256)+'</code>':d.sha512?' · Supplied SHA-512: <code>'+esc(d.sha512)+'</code>':' · Original-document digest not recorded')+'</li>';};
  if(enabled('meeting_archive'))for(const r of cat.meetings){let body='<p>'+esc([r.date,r.time,r.location].filter(Boolean).join(' · '))+'</p>'+warning+'<p><a href="'+href('meetings/')+'">Browse all '+cat.meta.total_meetings+' meetings</a></p><ul>'+Object.entries(r.official).map(([k,v])=>'<li><a href="'+esc(v)+'">Official '+esc(k)+' ('+esc(new URL(v).hostname)+')</a></li>').join('')+'</ul>';
    if(enabled('documents_and_transcripts'))body+='<h2>Documents</h2>'+(r.documents.length?'<ul>'+r.documents.map(reference).join('')+'</ul>':'<p>Local archive copy pending · Metadata-only coverage gap</p>')+'<h2>Transcripts</h2>'+(r.transcripts.length?'<ul>'+r.transcripts.map(reference).join('')+'</ul>':'<p>Transcript not yet indexed</p>');
    body+='<h2>Captured agenda text</h2>'+(r.items.length?r.items.map(i=>'<p>'+esc(i.number)+' · '+esc(i.text)+(/\(\s*(?:\.\.\.|…)\s*$/.test(i.text)?' <small>Captured excerpt may be truncated; consult original source.</small>':'')+'</p>').join(''):'<p>Agenda text not indexed in this snapshot.</p>');page('meetings/'+r.id,r.bodyLabel,body);}
  if(enabled('client_search')){write(path.join(out,'search.js'),`const box=document.querySelector('#q');const cards=[...document.querySelectorAll('[data-search]')];box.addEventListener('input',()=>{const terms=box.value.toLocaleLowerCase().trim().split(/\\s+/).filter(Boolean);let n=0;for(const c of cards){c.hidden=!terms.every(t=>c.textContent.toLocaleLowerCase().includes(t));if(!c.hidden)n++;}document.querySelector('#results').textContent=n+' matching meetings';});`);page('search','Search public meeting records','<label for="q">Search indexed meeting metadata and captured agenda text</label> <input id="q" type="search"><p id="results" role="status">'+cat.meta.total_meetings+' indexed meetings</p>'+cat.meetings.map(r=>'<div data-search>'+card(r)+'<p>'+esc(r.items.map(i=>i.text).join(' '))+'</p></div>').join('')+'<script src="'+href('search.js')+'" defer></script>');}
  if(enabled('jurisdiction_directory'))page('jurisdictions','Jurisdiction coverage','<h2>Cheyenne</h2><p>Meeting records populated from the accepted catalog; completeness not certified.</p><h2>Laramie County</h2><p>Telemetry pending in this release. Separate repository holdings are not automatically included.</p><h2>Other jurisdictions</h2><p>Planned · Telemetry pending. No statewide or national completeness claim.</p>');
  if(enabled('status_and_corrections'))page('status','Status and corrections','<p>Build commit: <code>'+esc(process.env.GITHUB_SHA||'local-uncommitted-test')+'</code></p><p>Last harvest timestamp: '+esc(status.last_harvest_utc||'unknown')+'</p>'+warning+'<p>'+esc(status.warning)+'</p><p>Catalog SHA-256: <code>'+status.catalog_sha256+'</code>. This identifies catalog bytes, not original-document authenticity.</p><p><a href="https://github.com/therealwindycity/TheReelWindyCity/issues/new">Submit a sourced correction</a></p>');
  write(path.join(out,'.nojekyll'),'');write(path.join(out,'data/verified_catalog.json'),bytes);write(path.join(out,'data/system_status.json'),JSON.stringify(status,null,2));
  const identity={schema:1,project_credit:'CM',revision:process.env.GITHUB_SHA||'local-uncommitted-test',run_id:process.env.GITHUB_RUN_ID||'local',catalog_sha256:status.catalog_sha256};write(path.join(out,'status/deployment.json'),JSON.stringify(identity,null,2));
  console.log(JSON.stringify({output:'clean-web/out',meetings:cat.meta.total_meetings,revision:identity.revision}));
}else throw Error('Use --stage or --build');
