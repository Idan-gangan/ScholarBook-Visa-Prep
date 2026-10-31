const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const script = fs.readFileSync(path.join(__dirname, '../public/owner-command-center.js'), 'utf8');
  const nodes = {
    ownerAttention: { innerHTML: '' },
    ownerInsights: { innerHTML: '' },
  };
  const window = {};
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  vm.runInNewContext(script, {
    window,
    document: { getElementById: id => nodes[id] || null },
    escapeHtml,
  }, { filename: 'owner-command-center.js' });
  return { window, nodes };
}

test('owner attention identifies unassigned students and paused accounts', () => {
  const { window, nodes } = setup();
  window.renderOwnerAttention({
    students: [{ id: 's1', staffIds: [] }, { id: 's2', staffIds: ['c1'] }],
    users: [{ id: 's1', accessSuspended: false }, { id: 's2', accessSuspended: true }]
  });
  assert.match(nodes.ownerAttention.innerHTML, /1 student without assigned staff/);
  assert.match(nodes.ownerAttention.innerHTML, /1 paused account/);
  assert.match(nodes.ownerAttention.innerHTML, /1 urgent alert/);
  assert.match(nodes.ownerAttention.innerHTML, /OPTIONAL TEAM COVERAGE/);
  assert.match(nodes.ownerAttention.innerHTML, /setOwnerTab\('assignments'\)/);
});

test('owner attention shows an actionable all-clear state', () => {
  const { window, nodes } = setup();
  window.renderOwnerAttention({
    students: [{ id: 's1', staffIds: ['c1'] }],
    users: [{ id: 's1', accessSuspended: false }]
  });
  assert.match(nodes.ownerAttention.innerHTML, /No urgent account alerts/);
  assert.match(nodes.ownerAttention.innerHTML, /0 urgent alerts/);
});

test('owner insight metrics reflect existing data without treating estimates as invoices', () => {
  const { window, nodes } = setup();
  window.renderOwnerInsights({
    aiEnabled: true,
    days: [
      { day: '2026-10-28', requests: 13, successes: 12, rejected: 1, failures: 0 },
      { day: '2026-10-29', requests: 31, successes: 15, rejected: 16, failures: 0 }
    ],
    costs: [
      { category: 'learn', attempts: 14, samples: 11, priced_samples: 10, elapsed_seconds: 1692, estimated_usd: 2.1742 },
      { category: 'mock', attempts: 7, samples: 7, priced_samples: 7, elapsed_seconds: 1758, estimated_usd: 1.4763 },
      { category: 'report', attempts: 5, samples: 5, priced_samples: 0, elapsed_seconds: null, estimated_usd: null }
    ]
  });
  const html = nodes.ownerInsights.innerHTML;
  assert.match(html, /44/);
  assert.match(html, /27/);
  assert.match(html, /\$3\.65/);
  assert.match(html, /57\.5 observed voice minutes/);
  assert.match(html, /Incomplete pricing/);
  assert.match(html, /Not your final bill/);
  assert.doesNotMatch(html, /Total profit|Actual total spending/);
});

test('owner insight handles empty data without inventing activity or spending', () => {
  const { window, nodes } = setup();
  window.renderOwnerInsights({ aiEnabled: false, days: [], costs: [] });
  assert.match(nodes.ownerInsights.innerHTML, /AI paused/);
  assert.match(nodes.ownerInsights.innerHTML, /Activity data has not been recorded/);
  assert.match(nodes.ownerInsights.innerHTML, /\$0\.00/);
  assert.match(nodes.ownerInsights.innerHTML, /not a complete invoice/);
});

test('owner view does not render raw untrusted date markup', () => {
  const { window, nodes } = setup();
  window.renderOwnerInsights({
    aiEnabled: true,
    days: [{ day: '<img src=x onerror=alert(1)>', requests: 2, successes: 1 }],
    costs: []
  });
  assert.doesNotMatch(nodes.ownerInsights.innerHTML, /<img /);
  assert.match(nodes.ownerInsights.innerHTML, /&lt;img/);
});

test('unassigned owner-managed students are informational, not urgent flags', () => {
  const { window, nodes } = setup();
  window.renderOwnerAttention({
    students: Array.from({length:40},(_,i)=>({id:'s'+i,staffIds:[]})),
    users:[{id:'o1',role:'owner',accessSuspended:false}]
  });
  assert.match(nodes.ownerAttention.innerHTML,/40 students without assigned staff/);
  assert.match(nodes.ownerAttention.innerHTML,/0 urgent alerts/);
  assert.doesNotMatch(nodes.ownerAttention.innerHTML,/40 flagged/);
});
