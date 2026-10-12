import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestionResponse, questionPrompt } from '../question-model.mjs';
const snapshot={objects:[{id:'booking',title:'Room booking'}]};
const evaluation={findings:[{ruleId:'scope',objectIds:['booking']}]};
test('questions require actual unresolved finding and object references',()=>{
 const q={text:'Does a pending booking hold its slot?',why:'This changes when conflicts occur.',findingIds:['scope:0'],objectIds:['booking']};
 assert.equal(validateQuestionResponse({questions:[q]},snapshot,evaluation).length,1);
 assert.throws(()=>validateQuestionResponse({questions:[{...q,findingIds:['made-up']}]},snapshot,evaluation));
 assert.throws(()=>validateQuestionResponse({questions:[{...q,objectIds:['other']}]},snapshot,evaluation));
 assert.deepEqual(validateQuestionResponse({questions:[]},snapshot,evaluation),[]);
});
test('prompt retains role-aware context and provisional semantic gap',()=>{
 const text=questionPrompt({messages:[{role:'assistant',text:'Publish it?'},{role:'user',text:'No'}],snapshot,evaluation,stage:'exploring',semanticReview:{judgments:[{id:'semantic:1',disposition:'flagged'}]}});
 assert.match(text,/Only user messages settle decisions/); assert.match(text,/semantic:1/); assert.match(text,/never proof that a test ran/);
});
