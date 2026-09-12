// Smoke test for the lfp. Usage: BIN=<chromium binary> OUT=<dir> node smoke.mjs   (dev server on :5199)
import { chromium } from 'playwright';
const out = process.env.OUT ?? '/tmp';
const b = await chromium.launch({ executablePath: process.env.BIN }); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const r = {};
await p.goto('http://localhost:5199/#overview'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.card');
r.overview = { cards: await p.locator('.card').count(), cols: await p.locator('.col').count(), dogfood: await p.locator('.dogfood').innerText(), basicsHidden: (await p.locator('.card', { hasText: 'Bropilot turns a hazy idea' }).count()) === 0 };
await p.locator('button', { hasText: /basics/i }).first().click(); r.overview.basicsShownAfterToggle = await p.locator('.card', { hasText: 'Bropilot turns a hazy idea' }).count();
await p.locator('.card > .title', { hasText: 'Guided articulation path' }).first().click(); await p.waitForSelector('.inspector'); await p.waitForTimeout(200);
r.overview.linesDrawn = await p.locator('.links line').count(); r.overview.litCards = await p.locator('.card.lit').count(); r.overview.chips = await p.locator('.chip').count();
r.provFull = { quotes: await p.locator('.inspector .quote').count(), ctx: await p.locator('.inspector .ctx').count() };
await p.locator('.inspector .more').first().click(); r.provFull.fullBrief = await p.locator('.inspector .full-brief').count();
await p.locator('.prov.said').first().hover(); await p.waitForTimeout(150); r.hoverPop = await p.locator('.pop').count();
await p.screenshot({ path: `${out}/overview.png` });
// definition
await p.goto('http://localhost:5199/#definition'); await p.waitForSelector('.q, [class*=tree]');
r.definition = { roots: await p.getByText('template', { exact: true }).count() };
await p.getByText('Who is it for?').first().click(); await p.waitForTimeout(100);
p.once('dialog', (d) => d.accept('Which of them pays?'));
await p.locator('button', { hasText: /sub-question/ }).first().click(); await p.waitForTimeout(150);
r.definition.subAdded = await p.getByText('Which of them pays?').count();
await p.getByText('Which of them pays?').first().click(); await p.waitForTimeout(100);
await p.fill('textarea', 'Small teams with a budget');
await p.locator('button', { hasText: 'Stage effects' }).click(); await p.waitForSelector('.effect');
r.definition.effects = await p.locator('.effect').count();
await p.locator('button', { hasText: /^Commit/ }).click(); await p.waitForTimeout(200); r.definition.commits = await p.locator('.history li').count();
await p.screenshot({ path: `${out}/definition.png` });
// domain
await p.goto('http://localhost:5199/#domain'); await p.waitForTimeout(300);
r.domain = { l0: (await p.locator('body').innerText()).includes('Planned changes') };
await p.screenshot({ path: `${out}/domain-l0.png` });
await p.getByText('1. Context').first().click(); await p.waitForTimeout(150);
r.domain.l1Text = (await p.locator('body').innerText()).includes('GitHub');
await p.screenshot({ path: `${out}/domain-l1.png` });
await p.getByText('2. Modules').first().click(); await p.waitForTimeout(150); await p.screenshot({ path: `${out}/domain-l2.png` });
r.domain.modules = await p.getByText('Representation', { exact: true }).count();
await p.getByText('Inside a module').first().click(); await p.waitForTimeout(150);
r.domain.things = await p.locator('.item-card').count();
await p.locator('.item-card .title', { hasText: /^🔷 Node$/ }).first().click(); await p.waitForTimeout(150);
r.domain.dimmedRulesAfterSelectingNode = await p.locator('.item-card.dim').count();
r.domain.codeLinks = await p.locator('a[href*="github.com"]').count();
await p.getByText('Orchestration', { exact: true }).first().click(); await p.waitForTimeout(150);
r.domain.testChips = await p.locator('.test-chip').count(); r.domain.testsPassed = await p.locator('.test-chip.pass').count();
await p.screenshot({ path: `${out}/domain-l3.png` });
// glossary
await p.locator('.glossary-btn').click(); await p.waitForTimeout(200);
r.glossary = { terms: await p.getByText('Representation layer').count() };
await p.screenshot({ path: `${out}/glossary.png` });
// reference anchors
await p.goto('http://localhost:5199/#kernel'); await p.waitForSelector('table'); r.anchors = (await p.locator('body').innerText()).includes('every statement anchors');
r.errors = errors; console.log(JSON.stringify(r, null, 1)); await b.close();
