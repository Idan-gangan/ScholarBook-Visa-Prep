const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('student dashboard script and stylesheet assets share one release version',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const names=['student-dashboard.js','student-dashboard-v2.js','student-dashboard-v2.css'];
  const versions=names.map(name=>{
    const hits=[...html.matchAll(new RegExp('(?:src|href)="/'+name.replaceAll('.','\\.')+'\\?v=([a-zA-Z0-9-]+)"','g'))];
    assert.equal(hits.length,1,'exactly one versioned reference for '+name);
    return hits[0][1];
  });
  assert.equal(new Set(versions).size,1,'dashboard style and scripts must load from same release');
});
test('server ignores query parameters in static asset path and requests revalidation',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.match(server,/let rel=req\.url\.split\("\?"\)\[0\]/);
  assert.match(server,/Cache-Control":recovery\?'no-store':'no-cache'/);
});
