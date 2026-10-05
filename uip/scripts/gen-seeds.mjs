// Generates public/projects/{ledgerly,tidepool}.graph.json (SPEC §8). Usage: node scripts/gen-seeds.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/projects');
const slug = (s) => {
  const words = s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  let out = '';
  for (const w of words) { if ((out + '-' + w).length > 40 && out) break; out = out ? out + '-' + w : w; }
  return out;
};
function build(nodes, edgeText) {
  const keyToId = {}, list = [];
  for (const [key, [kind, title, description]] of Object.entries(nodes)) {
    const id = `${kind}-${slug(title)}`;
    if (list.some((n) => n.id === id)) throw new Error('dup id ' + id);
    keyToId[key] = id;
    const n = { id, kind, title, status: 'committed', source: { kind: 'inferred', note: 'uip seed' } };
    if (description) n.description = description;
    list.push(n);
  }
  const edges = [];
  for (const line of edgeText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
    const [src, type, ...dsts] = line.split(/\s+/);
    for (const dst of dsts) {
      if (!keyToId[src] || !keyToId[dst]) throw new Error('bad key in: ' + line);
      edges.push({ id: `e${edges.length + 1}`, src: keyToId[src], dst: keyToId[dst], type, status: 'committed' });
    }
  }
  return { nodes: list, edges };
}

// ── ledgerly ────────────────────────────────────────────────────────────────
const ledgerlyNodes = {
  name: ['name', 'Ledgerly'],
  purpose: ['purpose', 'Freelancers get paid on time and always know what cash is coming', 'Cash is the oxygen of a one-person business; Ledgerly exists so a freelancer never has to guess whether next month is covered.'],
  summary: ['summary', 'Invoicing, polite payment chasing and a 60-day cash forecast for freelancers and their accountants', 'Ledgerly turns delivered work into a sent invoice in under a minute, chases payment on the freelancer\'s behalf, projects the next 60 days of cash, and hands the accountant a clean quarter.'],
  audFree: ['audience', 'Independent freelancer', 'Designers, developers and writers billing their own clients.'],
  audAcct: ['audience', 'Freelancer\'s accountant', 'Prepares quarterly VAT and the annual return for several freelancers.'],
  ctx: ['context', 'Solo practices billing 3-15 clients, often in two currencies'],
  ucSend: ['usecase', 'Send an invoice the day work is delivered'],
  ucHandoff: ['usecase', 'Hand a clean quarter of books to the accountant'],
  pLate: ['problem', 'Clients pay late and chasing them feels awkward'],
  pBlind: ['problem', 'No idea whether next month\'s rent is covered'],
  pRecon: ['problem', 'Matching bank deposits to invoices by hand at tax time'],
  oPaid: ['outcome', 'Invoices are paid within terms'],
  oConf: ['outcome', 'Freelancers plan spending with confidence'],
  goal: ['goal', 'Median days-to-paid under 14 by end of Q2'],
  hRemind: ['hypothesis', 'Polite automatic reminders shorten days-to-paid more than manual chasing'],
  hForecast: ['hypothesis', 'A 60-day forecast reduces end-of-month cash anxiety'],
  hPaylink: ['hypothesis', 'A one-click pay link doubles same-week payments'],
  aEmail: ['assumption', 'Clients open invoice emails within two days'],
  aBank: ['assumption', 'Freelancers will connect a bank feed during onboarding'],
  mDtp: ['metric', 'Median days to paid'],
  mFcErr: ['metric', 'Forecast error at 30 days'],
  cInv: ['capability', 'Invoicing'],
  cColl: ['capability', 'Collections'],
  cCash: ['capability', 'Cash-flow forecasting'],
  fBuilder: ['feature', 'Invoice builder with saved line items'],
  fRemind: ['feature', 'Automatic payment reminders'],
  fForecast: ['feature', '60-day cash forecast'],
  flCreate: ['flow', 'Create and send an invoice'],
  flPay: ['flow', 'Client pays from the email link'],
  flReview: ['flow', 'Review the weekly cash forecast'],
  flExport: ['flow', 'Export the quarter for the accountant'],
  sEditor: ['screen', 'Invoice editor'],
  sPay: ['screen', 'Client payment page'],
  sDash: ['screen', 'Cash dashboard'],
  sList: ['screen', 'Invoice list'],
  agColl: ['agent', 'Collections agent', 'Decides when and how firmly to nudge each overdue client.'],
  agFc: ['agent', 'Forecast agent', 'Rebuilds the 60-day projection whenever an invoice or expense changes.'],
  tNet: ['term', 'Net terms', 'Days a client has to pay after the invoice date, e.g. Net 30.'],
  tRunway: ['term', 'Cash runway', 'How many weeks current cash plus expected receipts cover known expenses.'],
  sys: ['system', 'Ledgerly platform'],
  extStripe: ['external', 'Stripe'],
  modInv: ['module', 'Invoicing service'],
  modPay: ['module', 'Payments service'],
  modFc: ['module', 'Forecast engine'],
  modMail: ['module', 'Reminder mailer'],
  inf: ['infra', 'Managed Postgres and job queue'],
  iInv: ['interface', 'Invoices API'],
  iHook: ['interface', 'Stripe webhook endpoint'],
  iFc: ['interface', 'Forecast API'],
  thInvoice: ['thing', 'Invoice'],
  thClient: ['thing', 'Client'],
  thPayment: ['thing', 'Payment'],
  thForecast: ['thing', 'Cash forecast'],
  rNum: ['rule', 'Invoice numbers are sequential with no gaps'],
  rOver: ['rule', 'A payment never exceeds the open balance'],
  rTax: ['rule', 'Tax rate is frozen once an invoice is sent'],
  evSent: ['event', 'Invoice sent'],
  evPaid: ['event', 'Payment received'],
  prIdem: ['protocol', 'Idempotent webhook handling'],
  aifMatch: ['ai-function', 'Match a bank deposit to an open invoice'],
  testSeq: ['test', 'Concurrent sends keep invoice numbers sequential'],
  testOver: ['test', 'Overpayment is rejected with a refund prompt'],
  testPart: ['test', 'Partial payment leaves the invoice open'],
  repo: ['repository', 'ledgerly monorepo'],
  cb: ['codebase', 'api service (TypeScript)'],
  practice: ['practice', 'Replay last week\'s webhooks before every deploy'],
  trSeq: ['test-result', 'Concurrent sends: pass (run 412)'],
  trOver: ['test-result', 'Overpayment rejected: pass (run 412)'],
  trPart: ['test-result', 'Partial payment stays open: fail (run 413)'],
  epic: ['epic', 'Bank-feed reconciliation'],
  taskImport: ['task', 'Import bank transactions nightly'],
  taskMatch: ['task', 'Auto-match deposits to open invoices'],
  mrDtp: ['metric-reading', 'Median days to paid: 19 in September'],
  mrFc: ['metric-reading', 'Forecast error at 30 days: 11% in September'],
  ue: ['usage-event', 'Client opened pay link from reminder'],
  fb: ['feedback', 'Accountant: quarterly export is missing the VAT column'],
  evdPilot: ['evidence', 'Pilot cohort paid 6 days faster with reminders on'],
  evdLink: ['evidence', 'Pay-link invoices: 41% paid same week vs 22% without'],
  evdInterviews: ['evidence', 'Interviews: freelancers ignore forecasts beyond 30 days'],
  evdBank: ['evidence', 'Only 1 in 5 trial users connected a bank feed'],
};
const ledgerlyEdges = `
# intent
purpose motivates oPaid oConf
pLate motivates oPaid
hRemind references oPaid mDtp
hPaylink references oPaid mDtp
hForecast references oConf mFcErr
mDtp monitors oPaid
mFcErr monitors oConf
aEmail references hRemind hPaylink
aBank references hForecast
evdPilot supports hRemind
evdLink supports hPaylink
evdInterviews refutes hForecast
evdBank refutes hForecast
mrDtp measures mDtp
mrFc measures mFcErr
goal combines mDtp mFcErr
cColl references hRemind
cCash references hForecast
# user
audFree has ucSend pLate pBlind ctx
audAcct has ucHandoff pRecon
cInv satisfies ucSend ucHandoff
fBuilder satisfies ucSend
cColl satisfies pLate pRecon
fRemind satisfies pLate
cCash satisfies pBlind
fForecast satisfies pBlind
cInv serves audFree audAcct
flCreate implements cInv
flExport implements cInv
flPay implements cColl
flReview implements cCash
sDash implements cCash
sList implements cInv
fBuilder has flCreate
fRemind has flPay
fForecast has flReview
flCreate uses sEditor sList
flPay uses sPay
flReview uses sDash
sEditor uses iInv thClient
sList uses iInv
sPay uses iInv extStripe
sDash uses iFc
iInv carries thInvoice thClient
iHook carries thPayment
iFc carries thForecast
iInv emits evSent
iHook emits evPaid
# domain (modMail deliberately exposes nothing)
sys contains modInv modPay modFc modMail prIdem
modInv exposes iInv sEditor sList
modPay exposes iHook sPay
modFc exposes iFc sDash
modInv contains evSent
modPay contains evPaid aifMatch rOver
modInv triggers modMail
evSent triggers modMail
modPay uses extStripe
aifMatch uses thPayment thInvoice
rNum governs thInvoice
rTax governs thInvoice
rOver governs thPayment
testSeq verifies rNum
testOver verifies rOver
testPart verifies rOver
# delivery
epic contains taskImport taskMatch
taskImport targets testPart
taskMatch targets testOver testPart
trSeq reports testSeq
trOver reports testOver
trPart reports testPart
# product
cColl has agColl
cCash has agFc
agColl implements fRemind
agFc implements fForecast
# current + extras
repo contains cb
cb realises modInv modPay modFc modMail
inf hosts modInv modPay
practice realises prIdem
practice governs cb
prIdem uses iHook
tNet defines thInvoice
tRunway defines thForecast
ue measures flPay
fb measures flExport
`;

// ── tidepool ────────────────────────────────────────────────────────────────
const tidepoolNodes = {
  name: ['name', 'Tidepool'],
  purpose: ['purpose', 'Turn volunteer shore walks into survey data marine biologists can publish on'],
  summary: ['summary', 'An offline-first field app for timed intertidal transects, with photo ID help and expert verification', 'Tidepool guides volunteers through a timed transect at low tide, captures species counts and photos without signal, and routes every record to a biologist before it joins the open dataset.'],
  audVol: ['audience', 'Weekend shore volunteer'],
  audBio: ['audience', 'Marine biologist running a monitoring site'],
  ctx: ['context', 'Rocky intertidal sites with no mobile signal and a two-hour low-tide window'],
  ucSurvey: ['usecase', 'Log a transect survey during one low tide'],
  ucVerify: ['usecase', 'Verify a week of volunteer records in one sitting'],
  pSignal: ['problem', 'Field data is lost when phones have no signal'],
  pMisid: ['problem', 'Species are misidentified so records cannot be trusted'],
  oUsable: ['outcome', 'Volunteer records are accepted into the dataset'],
  oReturn: ['outcome', 'Volunteers come back for the next good tide'],
  goal: ['goal', 'Two-thirds of records verified within 7 days'],
  hOffline: ['hypothesis', 'Offline-first capture halves abandoned surveys'],
  hPhoto: ['hypothesis', 'Photo ID suggestions lift verification acceptance above 80%'],
  hStreak: ['hypothesis', 'Low-tide reminders double repeat visits'],
  aPhotos: ['assumption', 'Volunteers will photograph every quadrat'],
  aTides: ['assumption', 'Public tide tables are accurate to 15 minutes per site'],
  mAccept: ['metric', 'Record acceptance rate'],
  mRepeat: ['metric', 'Volunteers returning within 30 days'],
  cCapture: ['capability', 'Field capture'],
  cVerify: ['capability', 'Expert verification'],
  cEngage: ['capability', 'Volunteer engagement'],
  fOffline: ['feature', 'Offline transect logger'],
  fId: ['feature', 'Photo ID suggestions'],
  fAlert: ['feature', 'Low-tide reminders'],
  flTransect: ['flow', 'Walk a transect and log each quadrat'],
  flSync: ['flow', 'Sync records once back in signal'],
  flReview: ['flow', 'Review and verify a record'],
  flAlert: ['flow', 'Get a reminder before the next good tide'],
  sTransect: ['screen', 'Transect logger'],
  sSpecies: ['screen', 'Species picker'],
  sQueue: ['screen', 'Verification queue'],
  sSite: ['screen', 'Site map'],
  agId: ['agent', 'ID suggestion agent'],
  agTide: ['agent', 'Tide watch agent'],
  tCover: ['term', 'Percent cover', 'Share of a quadrat\'s area occupied by one species, estimated in 5% steps.'],
  tVerified: ['term', 'Verified record', 'An observation a biologist has accepted with a final species ID.'],
  sys: ['system', 'Tidepool platform'],
  extTaxa: ['external', 'iNaturalist taxonomy API'],
  modCapture: ['module', 'Field capture app'],
  modSync: ['module', 'Sync service'],
  modVerify: ['module', 'Verification service'],
  inf: ['infra', 'Edge functions and photo storage'],
  iSync: ['interface', 'Records sync API'],
  iTaxa: ['interface', 'Taxonomy lookup'],
  iVerify: ['interface', 'Verification API'],
  thObs: ['thing', 'Observation'],
  thQuadrat: ['thing', 'Quadrat'],
  thSite: ['thing', 'Survey site'],
  thPhoto: ['thing', 'Field photo'],
  rGps: ['rule', 'Every observation carries a GPS fix within 20 m of its site'],
  rWindow: ['rule', 'Surveys start no earlier than 90 minutes before low tide'],
  rVerdict: ['rule', 'A record has exactly one final verdict'],
  evSynced: ['event', 'Survey synced'],
  evVerified: ['event', 'Record verified'],
  prMerge: ['protocol', 'Conflict-free merge of offline edits'],
  aif: ['ai-function', 'Suggest species from a field photo'],
  testGps: ['test', 'Observation logged 40 m off-site is flagged'],
  testResume: ['test', 'Photo uploaded after reconnect keeps its GPS fix'],
  testVerdict: ['test', 'Second verdict on a record is rejected'],
  repo: ['repository', 'tidepool repo'],
  cb: ['codebase', 'field app (React Native)'],
  practice: ['practice', 'Weekly offline drill in airplane mode'],
  trGps: ['test-result', 'Off-site flag: pass (build 88)'],
  trResume: ['test-result', 'Reconnect keeps GPS: fail (build 89)'],
  trVerdict: ['test-result', 'Single verdict: pass (build 88)'],
  epic: ['epic', 'Offline photo sync'],
  taskQueue: ['task', 'Queue photos for background upload'],
  taskResume: ['task', 'Resume interrupted photo uploads'],
  mrAccept: ['metric-reading', 'Acceptance rate: 64% in August'],
  mrRepeat: ['metric-reading', '30-day return: 38% in August'],
  ue: ['usage-event', 'Survey abandoned mid-transect'],
  fb: ['feedback', 'Biologist: blurry photos slow down verification'],
  evdPilot: ['evidence', 'Spring pilot: abandoned surveys fell from 31% to 12% offline'],
  evdAccept: ['evidence', 'Verifiers accepted 86% of photo-suggested IDs'],
  evdCohort: ['evidence', 'Reminder cohort returned no more often than control'],
  evdCrabs: ['evidence', 'Suggestions were wrong on 40% of juvenile crabs'],
};
const tidepoolEdges = `
# intent
purpose motivates oUsable oReturn
pMisid motivates oUsable
hOffline references oUsable mAccept
hPhoto references oUsable mAccept
hStreak references oReturn mRepeat
mAccept monitors oUsable
mRepeat monitors oReturn
aPhotos references hPhoto hOffline
aTides references hStreak
evdPilot supports hOffline
evdAccept supports hPhoto
evdCohort refutes hStreak
evdCrabs refutes hPhoto
mrAccept measures mAccept
mrRepeat measures mRepeat
goal combines mAccept mRepeat
cCapture references hOffline
cVerify references hPhoto
# user
audVol has ucSurvey pSignal ctx
audBio has ucVerify pMisid
cCapture satisfies ucSurvey pSignal
cEngage satisfies ucSurvey
cVerify satisfies ucVerify pMisid
fOffline satisfies ucSurvey pSignal
fId satisfies pMisid
fAlert satisfies ucSurvey
flTransect implements cCapture
flSync implements cCapture
flReview implements cVerify
flAlert implements cEngage
sQueue implements cVerify
sSite implements cEngage
fOffline has flTransect flSync
fId has flReview
fAlert has flAlert
flTransect uses sTransect sSpecies
flSync uses sTransect
flReview uses sQueue
sTransect uses iSync
sSpecies uses iTaxa
sQueue uses iVerify thPhoto
sSite uses thSite
iSync carries thObs thQuadrat thPhoto
iVerify carries thObs
iTaxa uses extTaxa
iSync emits evSynced
iVerify emits evVerified
# domain (modSync deliberately exposes nothing; rWindow deliberately has no test)
sys contains modCapture modSync modVerify prMerge
modCapture exposes sTransect sSpecies sSite
modVerify exposes iVerify sQueue
modVerify contains aif evVerified
modSync contains evSynced
evSynced triggers modVerify
aif uses thPhoto extTaxa
rGps governs thObs
rWindow governs thSite
rVerdict governs thObs
testGps verifies rGps
testResume verifies rGps
testVerdict verifies rVerdict
# delivery
epic contains taskQueue taskResume
taskQueue targets testResume
taskResume targets testResume
trGps reports testGps
trResume reports testResume
trVerdict reports testVerdict
# product
cVerify has agId
cEngage has agTide
agId implements fId
agTide implements fAlert
# current + extras
repo contains cb
cb realises modCapture modSync modVerify
inf hosts modSync modVerify
practice realises prMerge
practice governs cb
prMerge uses iSync
tCover defines thObs
tVerified defines evVerified
ue measures flTransect
fb measures sQueue
`;

for (const [id, n, e] of [['ledgerly', ledgerlyNodes, ledgerlyEdges], ['tidepool', tidepoolNodes, tidepoolEdges]]) {
  const g = build(n, e);
  writeFileSync(`${OUT}/${id}.graph.json`, JSON.stringify(g, null, 2) + '\n');
  console.log(id, g.nodes.length, 'nodes', g.edges.length, 'edges');
}
