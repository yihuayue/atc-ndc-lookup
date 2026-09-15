export const RX='https://rxnav.nlm.nih.gov/REST';
export const INGREDIENT_TYPES=['IN','PIN','MIN'];
export const PRODUCT_TYPES=['SCD','SBD','GPCK','BPCK'];
const former={N03AX12:'N02BF01',N03AX16:'N02BF02'};
export function normalizeAtc(value){const code=String(value??'').toUpperCase().replace(/[\s-]/g,'');if(!/^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/.test(code))throw new Error('Enter an ATC code, such as N03A, N03AX, or N03AX14.');return code;}
export const mappingPath=atc=>'/rxcui.json?idtype=ATC&id='+encodeURIComponent(atc)+'&allsrc=0';
export const productPath=rxcui=>'/rxcui/'+encodeURIComponent(rxcui)+'/related.json?tty=SCD+SBD+GPCK+BPCK';
export const ndcPath=rxcui=>'/rxcui/'+encodeURIComponent(rxcui)+'/ndcs.json';
export const historyPath=rxcui=>'/rxcui/'+encodeURIComponent(rxcui)+'/allhistoricalndcs.json?history=2';
export const coverageLabel=mode=>mode==='history'?'Current + historical':'Current only';
export const ndcStatus=n=>n.current?'Current association':n.currentComplete?'History API only':'Current check incomplete';
const validMonth=value=>/^\d{4}(0[1-9]|1[0-2])$/.test(value);
export function associationPeriod(evidence){
 const dated=evidence.filter(e=>validMonth(e.startDate)&&validMonth(e.endDate)&&e.startDate<=e.endDate);
 return {first:dated.map(e=>e.startDate).sort()[0]||'',last:dated.map(e=>e.endDate).sort().at(-1)||''};
}
export const csv=(headers,rows)=>'\uFEFF'+[headers,...rows].map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
const delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('Stopped','AbortError'));const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,ms);function abort(){clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));}signal?.addEventListener('abort',abort,{once:true});});

export class API {
 constructor(signal,fetcher=(url,options)=>fetch(url,options)){this.signal=signal;this.fetcher=fetcher;this.cache=new Map();this.slot=Promise.resolve();}
 async request(url){if(this.cache.has(url))return this.cache.get(url);const promise=this.fetchJSON(url);this.cache.set(url,promise);try{return await promise;}catch(e){this.cache.delete(url);throw e;}}
 async fetchJSON(url){for(let attempt=0;attempt<3;attempt++){
  this.signal?.throwIfAborted();const before=this.slot;this.slot=before.catch(()=>{}).then(()=>delay(220,this.signal)).catch(()=>{});await before;this.signal?.throwIfAborted();
  const timeout=new AbortController(),abort=()=>timeout.abort();this.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,25000);
  try{const response=await this.fetcher(url,{signal:timeout.signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();if(data.error)throw new Error(typeof data.error==='string'?data.error:'API error');return data;}
  catch(e){if(this.signal?.aborted)throw new DOMException('Stopped','AbortError');if(attempt===2)throw new Error('RxNorm request failed: '+(e.name==='AbortError'?'request timed out':e.message));await delay(1000*(attempt+1),this.signal);}
  finally{clearTimeout(timer);this.signal?.removeEventListener('abort',abort);}
 }}
 rx(path){return this.request(RX+path);}
}

export function makeRow(atc,name='',inventorySource='Entered ATC code'){
 return {atc,name,inventorySource,ids:[],concepts:[],products:[],ndcs:[],notes:[],errors:[],requests:[],stage:'Waiting',reason:'',done:false,enriched:false,productsDone:0,currentLookupComplete:false,coverage:'current',mappingSource:RX+mappingPath(atc)};
}
export async function discover(code,seed,api){
 code=normalizeAtc(code);
 if(code.length===7){const known=seed.find(s=>s.atc===code);const row=makeRow(code,known?.name||'');if(former[code])row.notes.push('Former ATC code. The current code is '+former[code]+'. This lookup uses only the entered code.');return [row];}
 const members=await api.rx('/rxclass/classMembers.json?classId='+code+'&relaSource=ATC&trans=0');
 const rows=new Map();
 for(const s of seed)if(!s.historical&&s.atc.startsWith(code))rows.set(s.atc,makeRow(s.atc,s.name,'WHO 2026 N03A reference list'));
 for(const member of members.drugMemberGroup?.drugMember||[]){
  const attrs=member.nodeAttr||[],ids=attrs.filter(a=>a.attrName==='SourceId').map(a=>a.attrValue),names=attrs.filter(a=>a.attrName==='SourceName').map(a=>a.attrValue);
  for(let i=0;i<ids.length;i++)if(/^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(ids[i])&&ids[i].startsWith(code)&&!former[ids[i]]&&!rows.has(ids[i]))rows.set(ids[i],makeRow(ids[i],names[i]||names[0]||member.minConcept?.name||'','Current RxClass ATC members'));
 }
 if(!rows.size)throw new Error('No ATC level-5 members were found for this class in the available reference and RxClass data.');
 return [...rows.values()].sort((a,b)=>a.atc.localeCompare(b.atc));
}

const stepNames={atc:'ATC → RxCUI',ingredient:'Ingredient check',products:'Ingredient → product',current:'Product → NDC (current)',history:'Product → NDC (historical)'};
async function stepRequest(row,api,step,path){
 const request={step,url:RX+path,status:'pending'};row.requests.push(request);
 try{const data=await api.rx(path);request.status='completed';return data;}
 catch(error){request.status=error.name==='AbortError'?'stopped':'failed';request.error=error.message;throw error;}
}
export function mappingDiagnostic(row){
 const requests=row.requests||[];
 const sources=items=>items.map(r=>({label:stepNames[r.step]+(r.url.match(/\/rxcui\/(\d+)\//)?.[1]?' · '+r.url.match(/\/rxcui\/(\d+)\//)[1]:''),url:r.url}));
 const interrupted=requests.filter(r=>['failed','stopped'].includes(r.status));
 if(interrupted.length)return {step:[...new Set(interrupted.map(r=>stepNames[r.step]))].join('; '),outcome:interrupted.some(r=>r.status==='failed')?'Request failed — results may be incomplete':'Lookup stopped — results may be incomplete',sources:sources(interrupted)};
 const pending=requests.filter(r=>r.status==='pending');
 if(row.errors.length){
  const ndcRequests=requests.filter(r=>['current','history'].includes(r.step));
  return {step:ndcRequests.length?'Product → NDC':row.enriched&&row.products.length?'Product → NDC':requests.length?stepNames[requests.at(-1).step]:'Not started',outcome:!row.done?'Lookup not completed':'Returned data needs review',sources:sources(ndcRequests.length?ndcRequests:requests.slice(-1))};
 }
 if(!row.done)return {step:pending.length?[...new Set(pending.map(r=>stepNames[r.step]))].join('; '):row.enriched&&row.products.length?'Product → NDC':row.stage,outcome:'In progress',sources:[]};
 if(row.ndcs.length)return {step:'Complete',outcome:'NDCs found',sources:[]};
 const step=row.products.length?'ndcs':row.concepts.some(c=>c.accepted)?'products':row.ids.length?'ingredient':'atc';
 const relevant=requests.filter(r=>step==='ndcs'?['current','history'].includes(r.step):r.step===step);
 return {step:step==='ndcs'?'Product → NDC':stepNames[step],outcome:step==='ndcs'?(row.coverage==='history'?'No current or historical NDCs returned':'No current NDCs returned'):step==='products'?'No related products returned':step==='ingredient'?'No active ingredient concept':'No RxCUI returned',sources:sources(relevant)};
}

export async function enrichSubstance(row,api,onUpdate=()=>{}){
 row.stage='Finding ingredient RxCUIs';onUpdate();
 const data=await stepRequest(row,api,'atc',mappingPath(row.atc));
 row.ids=[...new Set((data.idGroup?.rxnormId||[]).map(String))];
 if(!row.ids.length){row.reason='No active RxCUI was returned for this ATC code by findRxcuiById.';if(former[row.atc])row.reason+=' Current ATC code: '+former[row.atc]+'.';row.enriched=true;onUpdate();return row;}
 for(const id of row.ids){
  try{const d=await stepRequest(row,api,'ingredient','/rxcui/'+id+'/properties.json'),p=d.properties;
   const active=!!p?.name&&String(p.rxcui)===id&&p.suppress!=='Y';
   row.concepts.push({rxcui:id,name:p?.name||'',tty:p?.tty||'',status:active?'Active':'No active properties',accepted:active&&INGREDIENT_TYPES.includes(p.tty),source:RX+'/rxcui/'+id+'/properties.json'});
  }catch(e){if(e.name==='AbortError')throw e;row.errors.push('Concept lookup failed for '+id+': '+e.message);}
 }
 if(!row.name)row.name=row.concepts.map(c=>c.name).filter(Boolean).join(' / ');
 const ingredients=row.concepts.filter(c=>c.accepted);
 if(!ingredients.length){row.reason='No active ingredient concept (IN, PIN, or MIN) was returned for product expansion.';row.enriched=true;onUpdate();return row;}
 row.stage='Finding drug products';onUpdate();const products=new Map();
 for(const c of ingredients){
  try{const d=await stepRequest(row,api,'products',productPath(c.rxcui));
   for(const group of d.relatedGroup?.conceptGroup||[])for(const p of group.conceptProperties||[]){
    const tty=p.tty||group.tty;
    if(!p.rxcui||!PRODUCT_TYPES.includes(tty))continue;
    const id=String(p.rxcui);
    if(!products.has(id))products.set(id,{rxcui:id,name:p.name||'',tty,ingredientRxcuis:[],relatedSources:[]});
    const product=products.get(id);if(!product.ingredientRxcuis.includes(c.rxcui))product.ingredientRxcuis.push(c.rxcui);if(!product.relatedSources.includes(RX+productPath(c.rxcui)))product.relatedSources.push(RX+productPath(c.rxcui));
   }
  }catch(e){if(e.name==='AbortError')throw e;row.errors.push('Product lookup failed for '+c.rxcui+': '+e.message);}
 }
 row.products=[...products.values()].sort((a,b)=>a.rxcui.localeCompare(b.rxcui));
 if(!row.products.length)row.reason='Ingredient RxCUIs were found, but getRelatedByType returned no active SCD, SBD, GPCK, or BPCK products.';
 row.enriched=true;row.stage=row.products.length?'Ready for NDC lookup':'No products';onUpdate();return row;
}

export async function retrieveNDCs(row,api,onUpdate=()=>{},coverage='current'){
 if(!['current','history'].includes(coverage))throw new Error('Unsupported NDC coverage.');
 row.coverage=coverage;row.stage='Retrieving NDCs';row.currentLookupComplete=false;onUpdate();let currentFailed=false;
 await parallel(row.products,3,async product=>{
  const values=new Map();
  function record(value){
   const ndc=String(value);
   if(!values.has(ndc)){
    if(!/^\d{11}$/.test(ndc))row.errors.push('Unexpected NDC format returned for product '+product.rxcui+'; original API value retained.');
    const item={ndc,atc:row.atc,substance:row.name,ingredientRxcuis:product.ingredientRxcuis,productRxcui:product.rxcui,productName:product.name,tty:product.tty,source:RX+ndcPath(product.rxcui),relatedSources:product.relatedSources,current:false,historySources:[],historyEvidence:[]};
    values.set(ndc,item);row.ndcs.push(item);
   }
   return values.get(ndc);
  }
  try{
   try{
    const data=await stepRequest(row,api,'current',ndcPath(product.rxcui));
    for(const value of data.ndcGroup?.ndcList?.ndc||[]){const item=record(value);item.current=true;item.source=RX+ndcPath(product.rxcui);}
   }catch(e){if(e.name==='AbortError')throw e;currentFailed=true;row.errors.push('Current NDC lookup failed for '+product.rxcui+': '+e.message);}
   if(coverage==='history'){
    try{
     const data=await stepRequest(row,api,'history',historyPath(product.rxcui)),source=RX+historyPath(product.rxcui);
     for(const group of data.historicalNdcConcept?.historicalNdcTime||[])for(const time of group.ndcTime||[])for(const value of time.ndc||[]){
      const item=record(value),evidence={productRxcui:product.rxcui,associatedRxcui:String(group.rxcui||''),route:group.status||'',startDate:time.startDate||'',endDate:time.endDate||'',source};
      if(!item.historySources.includes(source))item.historySources.push(source);
      if(!item.historyEvidence.some(e=>JSON.stringify(e)===JSON.stringify(evidence)))item.historyEvidence.push(evidence);
      if(!validMonth(evidence.startDate)||!validMonth(evidence.endDate)||evidence.startDate>evidence.endDate)row.errors.push('Missing or invalid history dates for product '+product.rxcui+'; original values retained.');
     }
    }catch(e){if(e.name==='AbortError')throw e;row.errors.push('Historical NDC lookup failed for '+product.rxcui+': '+e.message);}
   }
  }finally{row.productsDone++;onUpdate();}
 });
 row.currentLookupComplete=!currentFailed;
 if(row.products.length&&!row.ndcs.length&&!row.errors.length)row.reason=coverage==='history'?'Related products were found, but getNDCs and getAllHistoricalNDCs returned no NDCs for them.':'Related products were found, but getNDCs returned no current RxNorm-curated NDCs for them.';
 if(coverage==='history'&&row.ndcs.length&&!row.ndcs.some(n=>n.current)&&!row.errors.length){
  const period=associationPeriod(row.ndcs.flatMap(n=>n.historyEvidence));
  row.reason='No current NDC associations; codes were returned by the history API.'+(period.last?' Latest recorded association: '+period.last.slice(0,4)+'-'+period.last.slice(4)+'.':'');
 }
 row.done=true;row.stage=row.errors.length?'Partial':row.ndcs.length?'Mapped':!row.ids.length?'No RxCUI':!row.products.length?'No products':'No NDCs';onUpdate();return row;
}

export const rowStatus=row=>row.errors.length?'Partial':row.done?(row.ndcs.length?'Mapped':'No NDCs'):row.stage;
export function rowExplanation(row){if(row.errors.length)return 'Incomplete lookup; counts may be partial. '+[...new Set(row.errors)].join(' | ');if(!row.done)return row.stage;return [row.reason,...row.notes].filter(Boolean).join(' | ')||'Completed';}
export function consolidate(rows){
 const records=new Map();
 for(const row of rows)for(const n of row.ndcs){
  const key=n.atc+'|'+n.ndc;if(!records.has(key))records.set(key,{ndc:n.ndc,atc:n.atc,substance:n.substance,ingredientRxcuis:[],productRxcuis:[],productNames:[],termTypes:[],sources:[],relatedSources:[],historySources:[],historyEvidence:[],current:false,currentComplete:row.currentLookupComplete,mappingSource:row.mappingSource});
  const out=records.get(key);out.current=out.current||n.current;
  for(const [field,values] of [['ingredientRxcuis',n.ingredientRxcuis],['productRxcuis',[n.productRxcui]],['productNames',[n.productName]],['termTypes',[n.tty]],['sources',n.source?[n.source]:[]],['relatedSources',n.relatedSources],['historySources',n.historySources]])for(const value of values)if(!out[field].includes(value))out[field].push(value);
  for(const evidence of n.historyEvidence)if(!out.historyEvidence.some(e=>JSON.stringify(e)===JSON.stringify(evidence)))out.historyEvidence.push(evidence);
 }
 return [...records.values()].sort((a,b)=>a.atc.localeCompare(b.atc)||a.ndc.localeCompare(b.ndc));
}
export function substanceTable(rows,meta={}){return {headers:['ATC level 5','Chemical substance','Ingredient RxCUI(s)','RxNorm concept name(s)','Ingredient term type(s)','Related product count','Unique NDC count','Status','ATC-to-RxCUI API URL','ATC inventory source','RxNorm release','Retrieved UTC','Run status','NDC coverage','Current NDC count','History API only NDC count','Mapping step','Step outcome','Step API URL(s)'],rows:rows.map(r=>{const active=r.concepts.filter(c=>c.accepted),ndcs=consolidate([r]),diagnostic=mappingDiagnostic(r);return [r.atc,r.name,active.map(c=>c.rxcui).join('; '),active.map(c=>c.name).join('; '),active.map(c=>c.tty).join('; '),r.products.length,ndcs.length,rowStatus(r),r.mappingSource,r.inventorySource,meta.version,meta.retrieved,meta.status,coverageLabel(r.coverage),ndcs.filter(n=>n.current).length,r.currentLookupComplete?ndcs.filter(n=>!n.current).length:'Unknown',diagnostic.step,diagnostic.outcome,diagnostic.sources.map(s=>s.url).join(' | ')];})};}
export function ndcTable(rows,meta={}){return {headers:['NDC11 - import as text','ATC level 5','Chemical substance','Ingredient RxCUI(s)','Product RxCUI(s)','Product name(s)','Product term type(s)','ATC-to-RxCUI API URL','Related-products API URL(s)','getNDCs API URL(s)','RxNorm release','Retrieved UTC','Run status','NDC coverage','Current association status for retrieved products','getAllHistoricalNDCs API URL(s)','Earliest first RxNorm association release','Latest last RxNorm association release','RxNorm association evidence (JSON)'],rows:consolidate(rows).map(n=>{const period=associationPeriod(n.historyEvidence);return [n.ndc,n.atc,n.substance,n.ingredientRxcuis.join('; '),n.productRxcuis.join('; '),n.productNames.join(' | '),n.termTypes.join('; '),n.mappingSource,n.relatedSources.join(' | '),n.sources.join(' | '),meta.version,meta.retrieved,meta.status,coverageLabel(meta.coverage||rows.find(r=>r.atc===n.atc)?.coverage),ndcStatus(n),n.historySources.join(' | '),period.first,period.last,JSON.stringify(n.historyEvidence)];})};}
export async function parallel(items,limit,fn){let index=0,failed=false;const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length&&!failed){const i=index++;try{await fn(items[i],i);}catch(e){failed=true;throw e;}}});const result=await Promise.allSettled(workers),error=result.find(r=>r.status==='rejected');if(error)throw error.reason;}
