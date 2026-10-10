import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GRAPH_PROBES} from './graph-probes.mjs';
import {localSemanticProvider} from '../local-config.mjs';
import {reviewSemantics} from '../semantic-review.mjs';
const baseline=GRAPH_PROBES.find(p=>p.id==='positive-baseline').build();
function proposal(snapshot){return {
 title:snapshot.title,purpose:snapshot.purpose.statement,evidence:[],
 entities:snapshot.objects.filter(o=>!['world','environment','thing'].includes(o.kind)).map(o=>({...o,evidence:[],assertion:'declared',properties:Object.entries(o.properties).map(([key,value])=>({key,value}))})),
 relations:snapshot.relations.map(r=>({...r,evidence:[],assertion:'declared'})),questions:[],
};}
export async function runSemanticGraphProbes(provider){
 const messages=[{id:'baseline',role:'user',text:'The desired specification is this baseline. Preserve its requirements and approval boundaries: '+JSON.stringify(proposal(baseline))}];
 const ids=['positive-baseline','false-entailment','irrelevant-indicator','conflicting-authorization-prose','authorization-scope-mismatch','nonsense-assay-linked'];
 const results=[];
 for(const id of ids){
  const snapshot=GRAPH_PROBES.find(p=>p.id===id).build();
  const review=await reviewSemantics({messages,proposal:proposal(snapshot),snapshot},{provider,limits:{maxChecks:96}});
  results.push({id,review});
 }
 return results;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(!args.includes('--live'))throw Error('--live required');
 const option=n=>args[args.indexOf(n)+1]; if(!args.includes('--env-file')||!args.includes('--out'))throw Error('--env-file and --out required');
 const provider=await localSemanticProvider(option('--env-file'));if(!provider)throw Error('Local TypeSafe credential unavailable');
 const out=option('--out');await writeFile(out+'.manifest.json',JSON.stringify({startedAt:new Date().toISOString(),method:'Exact baseline graph probe snapshots reviewed against synthetic baseline specification; labels not sent.'}),{flag:'wx'});
 const results=await runSemanticGraphProbes(provider);await writeFile(out,JSON.stringify(results,null,2),{flag:'wx'});
 console.log(JSON.stringify(results.map(({id,review})=>({id,summary:review.summary,flagged:review.judgments.filter(j=>j.disposition==='flagged').map(j=>j.id)}))));
}
