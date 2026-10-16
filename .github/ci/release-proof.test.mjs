import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse, stringify } from "yaml";
import { verifyReleaseQuality } from "../../scripts/release-gate-check.mjs";
const workflow=fileURLToPath(new URL("../workflows/release.yml",import.meta.url));
function mutate(change) {const document=parse(readFileSync(workflow,"utf8"));change(document);return stringify(document);}
const step=(w,job,part)=>w.jobs[job].steps.find(s=>s.run?.includes(part)||s.uses?.includes(part));
test("actual parsed release YAML proves prerequisite for scalar and list needs",()=>{
 assert.equal(verifyReleaseQuality(readFileSync(workflow,"utf8")),true);
 assert.equal(verifyReleaseQuality(mutate(w=>{w.jobs['build-linux'].needs=['quality-gates'];})),true);
});
test("missing dependencies or conditional jobs cannot reuse quality evidence",()=>{
 for(const change of [w=>delete w.jobs['build-linux'].needs,w=>{w.jobs['build-win'].needs=['build-linux'];},w=>{w.jobs['quality-gates'].if=false;},w=>{w.jobs['build-linux'].if='always()';},w=>{w.jobs['quality-gates']['continue-on-error']=true;}])assert.equal(verifyReleaseQuality(mutate(change)),false);
});
test("required quality commands must execute unconditionally without suppression",()=>{
 for(const change of [w=>{step(w,'quality-gates','run.mjs quality').if=false;},w=>{step(w,'quality-gates','run.mjs quality')['continue-on-error']=true;},w=>{step(w,'quality-gates','run.mjs quality').run+=' || true';},w=>{step(w,'quality-gates','run.mjs quality').run='echo "node .github/ci/run.mjs quality"';},w=>{w.jobs['quality-gates'].steps=w.jobs['quality-gates'].steps.filter(s=>!s.run?.includes('run.mjs renderer'));}])assert.equal(verifyReleaseQuality(mutate(change)),false);
});
test("different source runtime matrix or working directory invalidates proof",()=>{
 for(const change of [w=>{w.jobs['quality-gates'].strategy={matrix:{node:['20','22']}};},w=>{w.jobs['build-linux']['runs-on']='ubuntu-latest';},w=>{step(w,'quality-gates','setup-node').with['node-version']='22';},w=>{step(w,'build-linux','checkout').with={ref:'main'};},w=>{step(w,'quality-gates','checkout').with={repository:'other/repo'};},w=>{w.defaults={run:{'working-directory':'other'}};},w=>{step(w,'quality-gates','run.mjs quality').env={PATH:'/fake'};}])assert.equal(verifyReleaseQuality(mutate(change)),false);
});
test("actual shared phase plan cannot omit a required check",()=>{
 assert.equal(verifyReleaseQuality(readFileSync(workflow,'utf8'),()=>[]),false);
});
test("Linux runtime libraries remain mandatory before package and invalid YAML never passes",()=>{
 assert.equal(verifyReleaseQuality(mutate(w=>{w.jobs['build-linux'].steps=w.jobs['build-linux'].steps.filter(s=>!s.run?.includes('install-deps chromium'));})),false);
 assert.equal(verifyReleaseQuality('jobs:\n  x: [\n'),false);
 assert.equal(verifyReleaseQuality('jobs: {}\njobs: {}\n'),false);
});
