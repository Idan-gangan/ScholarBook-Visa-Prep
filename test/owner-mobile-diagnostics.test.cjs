const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const js = fs.readFileSync(path.join(__dirname, '../public/owner-mobile-diagnostics.js'),'utf8');
  const nodes = {};
  for(const id of ['ownerOperationMobileCards','ownerCostsMobile','ownerOperationMobileFilter']) {
    nodes[id] = { innerHTML:'', value:'all', replaceChildren(){this.innerHTML='';} };
  }
  const window = {};
  const document = { getElementById:id=>nodes[id] || null };
  vm.runInNewContext(js,{document,window,Date,Number,String,Map});
  return {window,nodes};
}

const sample = {
  days: [
    {day:'2026-10-29',operation:'voice_start',requests:31,successes:15,rejected:16,failures:0},
    {day:'2026-10-30',operation:'registration',requests:2,successes:0,rejected:2,failures:0},
    {day:'2026-10-30',operation:'report_generation',requests:1,successes:1,rejected:0,failures:0}
  ],
  costs: [
    {category:'mock',attempts:7,samples:7,priced_samples:7,elapsed_seconds:1758,estimated_usd:1.4763},
    {category:'report',source:'provider_response',attempts:5,samples:5,priced_samples:0,elapsed_seconds:null,estimated_usd:null,input_tokens:10600,cached_tokens:0,output_tokens:10861}
  ]
};
test('mobile activity groups by UTC date and shows labels beside corresponding numbers',()=>{
  const {window,nodes}=setup();window.renderOwnerMobileDiagnostics(sample);
  const html=nodes.ownerOperationMobileCards.innerHTML;
  assert.match(html,/Oct 30, 2026/);
  assert.match(html,/Oct 29, 2026/);
  assert.match(html,/Voice session started/);
  assert.match(html,/31 requests/);
  assert.match(html,/<span>Rejected<\/span><strong>16<\/strong>/);
  assert.match(html,/Service errors/);
  assert.ok(html.indexOf('Oct 30, 2026')<html.indexOf('Oct 29, 2026'));
});
test('filter distinguishes rejected from actual service failures',()=>{
  const {window,nodes}=setup();
  window.renderOwnerMobileDiagnostics(sample);
  nodes.ownerOperationMobileFilter.value='failures';
  window.setOwnerOperationMobileFilter();
  assert.match(nodes.ownerOperationMobileCards.innerHTML,/No operations match this filter/);
  nodes.ownerOperationMobileFilter.value='rejected';
  window.setOwnerOperationMobileFilter();
  assert.match(nodes.ownerOperationMobileCards.innerHTML,/Voice session started/);
  assert.doesNotMatch(nodes.ownerOperationMobileCards.innerHTML,/Report generation/);
});
test('mobile costs avoid treating unpriced text usage as zero dollars',()=>{
  const {window,nodes}=setup();window.renderOwnerMobileDiagnostics(sample);
  const html=nodes.ownerCostsMobile.innerHTML;
  assert.match(html,/\$1\.48/);
  assert.match(html,/Not priced/);
  assert.match(html,/10,600/);
  assert.match(html,/10,861/);
  assert.match(html,/29\.3 min/);
  assert.match(html,/Not recorded/);
  assert.doesNotMatch(html,/\$0\.00/);
});
test('injected provider operation names are escaped as plain text',()=>{
  const {window,nodes}=setup();
  window.renderOwnerMobileDiagnostics({days:[{day:'2026-10-30',operation:'<script>alert(1)</script>',requests:1}],costs:[]});
  assert.doesNotMatch(nodes.ownerOperationMobileCards.innerHTML,/<script>/);
  assert.match(nodes.ownerOperationMobileCards.innerHTML,/&lt;script&gt;/);
});
test('clearing diagnostics removes previously displayed data',()=>{
  const {window,nodes}=setup();
  window.renderOwnerMobileDiagnostics(sample);
  window.clearOwnerMobileDiagnostics();
  assert.equal(nodes.ownerOperationMobileCards.innerHTML,'');
  assert.equal(nodes.ownerCostsMobile.innerHTML,'');
  assert.equal(nodes.ownerOperationMobileFilter.value,'all');
});
