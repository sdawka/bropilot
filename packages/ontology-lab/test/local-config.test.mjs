import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localSemanticProvider} from '../local-config.mjs';
test('local semantic config handles absent, placeholder and disabled credentials',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'lab-env-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'typesafe.env'); assert.equal(await localSemanticProvider(path),undefined);
 await writeFile(path,'TYPESAFE_API_KEY=PASTE_YOUR_TYPESAFE_API_KEY_HERE\n'); assert.equal(await localSemanticProvider(path),undefined);
 await writeFile(path,'TYPESAFE_API_KEY=synthetic-test-key\nOTHER_SECRET=ignored\n');
 assert.equal(await localSemanticProvider(path,{disabled:true}),undefined);
 const p=await localSemanticProvider(path); assert.equal(typeof p.evaluate,'function');
 assert.ok(!JSON.stringify(p).includes('synthetic-test-key'));
});
