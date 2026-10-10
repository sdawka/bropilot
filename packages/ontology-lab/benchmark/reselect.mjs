import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {selectQuestionCandidates} from '../question-policy.mjs';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
if(!args.includes('--input')||!args.includes('--out'))throw Error('--input DIR --out DIR required');
const input=resolve(option('--input')),out=resolve(option('--out'));
const manifest=JSON.parse(await readFile(join(input,'manifest.json'),'utf8'));
const policyHash=createHash('sha256').update(await readFile(new URL('../question-policy.mjs',import.meta.url))).digest('hex');
await mkdir(out,{recursive:true});
await writeFile(join(out,'manifest.json'),JSON.stringify({...manifest,measurement:'offline_reselection',sourceRun:input,selectionPolicyHash:policyHash,reselectedAt:new Date().toISOString()},null,2),{flag:'wx'});
let changed=0,count=0;
for(const c of manifest.cases)for(let repeat=1;repeat<=manifest.repeats;repeat++){
 const filename=`${c.id}-${repeat}.json`;
 const run=JSON.parse(await readFile(join(input,filename),'utf8'));
 const selection=selectQuestionCandidates(run.questionSelection?.candidates??[],{messages:c.messages,stage:run.questionSelection?.stage??'exploring',judgments:run.semanticReview?.judgments??[]});
 const result={...run,measurement:'offline_reselection',previousQuestionCards:run.questionCards,questionSelection:selection,questionCards:selection.selected};
 if(JSON.stringify(run.questionCards?.map(q=>q.id))!==JSON.stringify(selection.selected.map(q=>q.id)))changed++;
 await writeFile(join(out,filename),JSON.stringify(result,null,2),{flag:'wx'});count++;
}
console.log(JSON.stringify({measurement:'offline_reselection',count,changed,policyHash}));
