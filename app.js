import {API,RX,coverageLabel,ndcStatus,associationPeriod,normalizeAtc,discover,enrichSubstance,retrieveNDCs,parallel,csv,consolidate,rowStatus,substanceTable,ndcTable} from './engine.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
const state={rows:[],tab:'substances',page:0,busy:false,code:'',version:'',retrieved:'',stopped:false,error:false,started:false,coverage:'history'};
const records=()=>consolidate(state.rows);
const month=value=>value?value.slice(0,4)+'-'+value.slice(4):'Unknown';
function associationHTML(n){
 const p=associationPeriod(n.historyEvidence);
 return '<span class="tag'+(!n.current?' warn':'')+'">'+esc(ndcStatus(n))+'</span>'+(n.historyEvidence.length?'<div class="subtle">First: '+esc(month(p.first))+'<br>Last: '+esc(month(p.last))+'</div><details><summary>Association details</summary>'+n.historyEvidence.map(e=>'<p class="subtle">Product '+esc(e.productRxcui)+' · Associated RxCUI '+esc(e.associatedRxcui)+' · '+esc(e.route)+'<br>'+esc(month(e.startDate))+' → '+esc(month(e.endDate))+'</p>').join('')+'</details>':'<div class="subtle">'+(state.coverage==='current'?'History not requested':'No dated history returned')+'</div>');
}

function runStatus(){return !state.started?'Ready':state.busy?'In progress':state.stopped||state.error||state.rows.some(r=>r.errors.length||!r.done)?'Partial':'Completed';}
function summary(){return {atc:state.code,status:runStatus(),coverage:coverageLabel(state.coverage),ndcSource:state.coverage==='history'?'RxNorm getNDCs + getAllHistoricalNDCs (history=2)':'RxNorm getNDCs (current release)',rxNormVersion:state.version,retrieved:state.retrieved,substanceCount:state.rows.length,productCount:new Set(state.rows.flatMap(r=>r.products.map(p=>p.rxcui))).size,uniqueNdcCount:new Set(records().map(n=>n.ndc)).size,currentNdcCount:new Set(records().filter(n=>n.current).map(n=>n.ndc)).size,zeroCount:state.rows.filter(r=>r.done&&!r.errors.length&&!r.ndcs.length).length};}
function message(text,error=false){$('message').hidden=false;$('message').textContent=text;$('message').className=error?'error':'';}
let scheduled=false;
function queueRender(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});}}
function render(){
 const s=summary(),ndcs=records(),term=$('filter').value.trim().toLowerCase();
 $('results').hidden=!state.rows.length;$('empty').hidden=state.rows.length>0;
 $('result-code').textContent=state.code;$('result-title').textContent=state.rows.length===1?state.rows[0].name||'Substance lookup':'ATC level-5 summary';
 $('result-meta').textContent=coverageLabel(state.coverage)+' · Release '+(state.version||'pending')+' · '+s.currentNdcCount.toLocaleString()+' current NDCs · '+runStatus();
 for(const [id,key] of [['substance-count','substanceCount'],['product-count','productCount'],['ndc-count','uniqueNdcCount'],['zero-count','zeroCount']])$(id).textContent=s[key].toLocaleString();
 $('export-substances').disabled=!state.rows.length;$('export-ndcs').disabled=!state.rows.length;
 $('substances-panel').hidden=state.tab!=='substances';$('ndcs-panel').hidden=state.tab!=='ndcs';
 for(const name of ['substances','ndcs']){$('tab-'+name).setAttribute('aria-selected',String(state.tab===name));$('tab-'+name).tabIndex=state.tab===name?0:-1;}
 const rows=state.rows.filter(r=>[r.atc,r.name,...r.concepts.flatMap(c=>[c.rxcui,c.name]),rowStatus(r)].join(' ').toLowerCase().includes(term));
 $('substances-body').innerHTML=rows.map(r=>'<tr><td><strong class="code">'+esc(r.atc)+'</strong><div>'+esc(r.name||'Substance name not returned')+'</div></td><td>'+
  (r.concepts.map(c=>'<div class="concept-item"><strong class="code">'+link(c.source,c.rxcui)+'</strong> <span class="tag">'+esc(c.tty||'No active properties')+'</span><div>'+esc(c.name)+'</div></div>').join('')||'<span class="subtle">'+(r.enriched?'—':'Pending')+'</span>')+
  '</td><td><strong>'+r.products.length.toLocaleString()+'</strong> products<br><button class="row-button" data-ndc-atc="'+esc(r.atc)+'" '+(r.ndcs.length?'':'disabled')+'>'+new Set(r.ndcs.map(n=>n.ndc)).size.toLocaleString()+' NDCs</button>'+(state.coverage==='history'?'<div class="subtle">'+new Set(r.ndcs.filter(n=>n.current).map(n=>n.ndc)).size+' current · '+(r.currentLookupComplete?consolidate([r]).filter(n=>!n.current).length:'?')+' history API only</div>':'')+'</td><td class="status-cell"><span class="tag'+(r.errors.length?' warn':'')+'">'+esc(rowStatus(r))+'</span>'+(r.errors.length?'<p class="subtle">'+esc([...new Set(r.errors)].join(' | '))+'</p>':'')+'<div>'+link(r.mappingSource,'ATC API response')+'</div></td></tr>').join('')||'<tr><td colspan="4" class="nodata">No matching substances.</td></tr>';
 const filtered=ndcs.filter(n=>[n.ndc,n.atc,n.substance,...n.productRxcuis,...n.productNames].join(' ').toLowerCase().includes(term));
 const pages=Math.max(1,Math.ceil(filtered.length/50));state.page=Math.min(state.page,pages-1);const slice=filtered.slice(state.page*50,state.page*50+50);
 $('ndcs-body').innerHTML=slice.map(n=>'<tr><td><strong class="code">'+esc(n.ndc)+'</strong></td><td><span class="code">'+esc(n.atc)+'</span><div>'+esc(n.substance)+'</div></td><td>'+n.productRxcuis.map(id=>link(RX+'/rxcui/'+id+'/properties.json',id)).join('<br>')+ '<div class="subtle">'+esc(n.termTypes.join(', '))+'</div></td><td>'+n.productNames.map(esc).join('<br>')+'</td><td>'+associationHTML(n)+'</td><td>'+n.sources.map(url=>link(url,'Current API')).concat(n.historySources.map(url=>link(url,'History API'))).join('<br>')+'</td></tr>').join('')||'<tr><td colspan="6" class="nodata">'+(state.busy?'NDCs will appear as product API calls finish.':'No NDCs found.')+'</td></tr>';
 $('page-label').textContent=filtered.length.toLocaleString()+' ATC–NDC rows · Page '+(state.page+1)+' of '+pages;$('prev').disabled=state.page===0;$('next').disabled=state.page===pages-1;
 if(state.busy){const total=state.rows.reduce((a,r)=>a+r.products.length,0),done=state.rows.reduce((a,r)=>a+r.productsDone,0);$('progress-text').textContent=state.phase==='ndcs'?state.coverage==='history'?'Calling current and historical NDC APIs for each product':'Calling getNDCs for each drug product':'Finding ingredients and related products through the APIs';$('progress-count').textContent=state.phase==='ndcs'?done+' / '+total+' products':state.rows.filter(r=>r.enriched||r.done).length+' / '+state.rows.length+' substances';$('progress').value=state.phase==='ndcs'?(total?done/total*100:100):(state.rows.length?state.rows.filter(r=>r.enriched||r.done).length/state.rows.length*100:0);}
}
function setBusy(busy){state.busy=busy;for(const id of ['atc','coverage','lookup'])$(id).disabled=busy;document.querySelectorAll('[data-example]').forEach(b=>b.disabled=busy);$('cancel').hidden=!busy;$('progress-box').hidden=!busy;$('lookup').textContent=busy?'Finding NDCs…':'Find NDCs ↗';}
async function lookup(code,coverage=$('coverage').value){
 if(state.busy)throw new Error('A lookup is already running. Stop it before starting another.');
 if(!['current','history'].includes(coverage))throw new Error('Choose current or current + historical coverage.');
 code=normalizeAtc(code);Object.assign(state,{rows:[],code,coverage,version:'',retrieved:new Date().toISOString(),stopped:false,error:false,started:true,phase:'substances',tab:'substances',page:0});
 $('atc').value=code;$('coverage').value=coverage;$('filter').value='';setBusy(true);render();message('Finding the ATC substances…');
 const controller=new AbortController();state.controller=controller;const api=new API(controller.signal);
 try{
  const [seed,version]=await Promise.all([fetch('./n03a.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('The ATC reference file could not be loaded.');return r.json();}),api.rx('/version.json')]);state.version=version.version||'Unknown';
  state.rows=await discover(code,seed,api);for(const row of state.rows)row.coverage=coverage;render();message('Finding ingredient RxCUIs and related drug products through RxNorm APIs…');
  await parallel(state.rows,3,async row=>{try{await enrichSubstance(row,api,queueRender);}catch(e){if(e.name==='AbortError')throw e;row.errors.push(e.message);row.stage='Partial';row.done=true;queueRender();}});
  state.phase='ndcs';render();message(coverage==='history'?'Retrieving current and historical NDCs through the RxNorm APIs…':'Retrieving current NDCs with getNDCs for each drug-product RxCUI…');
  await parallel(state.rows.filter(r=>!r.done),2,row=>retrieveNDCs(row,api,queueRender,coverage));
  message('Finished: '+new Set(records().map(n=>n.ndc)).size.toLocaleString()+' unique NDCs ('+summary().currentNdcCount.toLocaleString()+' current). '+(state.rows.some(r=>r.errors.length)?'Some requests failed; exports are partial.':'Ready to export.'));
 }catch(e){state.error=true;state.stopped=e.name==='AbortError';for(const row of state.rows)if(!row.done){row.stage='Partial / stopped';row.errors.push(e.name==='AbortError'?'Lookup stopped before completion':e.message);}message(e.name==='AbortError'?'Stopped. Retrieved results remain available as a partial export.':e.message,e.name!=='AbortError');}
 finally{setBusy(false);render();}
 return summary();
}
function download(filename,text){
 const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
 const dialog=document.createElement('dialog');dialog.className='export-dialog';dialog.setAttribute('aria-label','Export CSV');
 dialog.innerHTML='<h2>Your CSV is ready</h2><p class="export-name"></p><p>Download the file, or copy its contents. Import NDC columns as text to preserve leading zeros.</p><div class="export-actions"><a class="secondary export-file">Download CSV</a><button class="secondary export-copy" type="button">Copy CSV</button><button class="secondary export-close" type="button">Close</button></div><p class="export-status subtle" role="status"></p><details><summary>View or select CSV text</summary><textarea aria-label="CSV contents" readonly spellcheck="false"></textarea></details>';
 dialog.querySelector('.export-name').textContent=filename+' · '+(text.split('\r\n').length-1).toLocaleString()+' data rows';
 const a=dialog.querySelector('.export-file');a.href=url;a.download=filename;
 const area=dialog.querySelector('textarea');area.value=text;
 dialog.querySelector('.export-copy').addEventListener('click',async()=>{let timer;try{await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Clipboard unavailable')),1500)})]);dialog.querySelector('.export-status').textContent='CSV copied.'}catch{dialog.querySelector('details').open=true;area.focus();area.select();dialog.querySelector('.export-status').textContent='CSV selected. Press Ctrl+C (or Command+C) to copy.'}finally{clearTimeout(timer)}});
 dialog.querySelector('.export-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove()},{once:true});document.body.append(dialog);dialog.showModal();
}

function exportTable(kind){const meta={version:state.version,retrieved:state.retrieved,status:runStatus(),coverage:state.coverage},table=kind==='substances'?substanceTable(state.rows,meta):ndcTable(state.rows,meta),suffix=runStatus()==='Completed'?'':'-PARTIAL';download(state.code+'-'+(kind==='substances'?'ATC-summary':'NDC-mapping')+'-'+state.coverage+suffix+'.csv',csv(table.headers,table.rows));}
function tab(name){state.tab=name;state.page=0;render();}
document.querySelector('#lookup-form').addEventListener('submit',event=>{event.preventDefault();lookup($('atc').value).catch(e=>message(e.message,true));});
$('cancel').addEventListener('click',()=>state.controller?.abort());
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{$('atc').value=b.dataset.example;$('atc').focus();}));
for(const name of ['substances','ndcs']){$('tab-'+name).addEventListener('click',()=>tab(name));$('tab-'+name).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=name==='substances'?'ndcs':'substances';tab(next);$('tab-'+next).focus();}});}
$('filter').addEventListener('input',()=>{state.page=0;render();});$('prev').addEventListener('click',()=>{state.page--;render();});$('next').addEventListener('click',()=>{state.page++;render();});
$('substances-body').addEventListener('click',event=>{const button=event.target.closest('[data-ndc-atc]');if(button){$('filter').value=button.dataset.ndcAtc;tab('ndcs');}});
$('export-substances').addEventListener('click',()=>exportTable('substances'));$('export-ndcs').addEventListener('click',()=>exportTable('ndcs'));
const context=navigator.modelContext||document.modelContext;
if(context?.registerTool){
 const lifecycle=new AbortController(),register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'lookup_atc',description:'Map an ATC code through active ingredient and product RxCUIs to current and optionally historical NDCs using RxNorm APIs. Updates the visible page.',inputSchema:{type:'object',properties:{code:{type:'string'},coverage:{type:'string',enum:['current','history'],description:'history includes current NDCs and historical associations; default is the page selection.'}},required:['code'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async args=>({content:[{type:'text',text:JSON.stringify(await lookup(args.code,args.coverage))}]})});
 register({name:'read_atc_results',description:'Read the ATC summary and a sample of NDC mappings with current status and historical evidence.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>({content:[{type:'text',text:JSON.stringify({...summary(),substances:state.rows.map(r=>({atc:r.atc,name:r.name,concepts:r.concepts,productCount:r.products.length,uniqueNdcCount:new Set(r.ndcs.map(n=>n.ndc)).size,status:rowStatus(r),errors:r.errors})),ndcSample:records().slice(0,20)})}]})});
 addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
