// Feature-gated record storage; legacy application callbacks remain transactional.
const {isDeepStrictEqual}=require('node:util');
function split(state){const meta={},rows=[];for(const [collection,value] of Object.entries(state)){if(!Array.isArray(value)){meta[collection]=value;continue;}meta[collection]=[];value.forEach((data,position)=>rows.push({collection,key:typeof data?.id==='string'?'id:'+data.id:'position:'+position,position,data}));}return {meta,rows};}
async function read(client,collections){const m=await client.query('SELECT data FROM record_store_meta WHERE id=1');if(!m.rows.length)throw Error('Record store has not been migrated');const state=collections?Object.fromEntries(collections.map(k=>[k,m.rows[0].data[k]??[]])):m.rows[0].data;for(const r of (await client.query(collections?'SELECT collection,data FROM record_store_rows WHERE collection=ANY($1::text[]) ORDER BY collection,position':'SELECT collection,data FROM record_store_rows ORDER BY collection,position',collections?[collections]:[])).rows)(state[r.collection]??=[]).push(r.data);return state;}
async function write(client,before,after,partial=false){const a=split(before),b=split(after),key=r=>JSON.stringify([r.collection,r.key]);const old=new Map(a.rows.map(r=>[key(r),r])),next=new Set(b.rows.map(key));for(const r of a.rows)if(!next.has(key(r)))await client.query('DELETE FROM record_store_rows WHERE collection=$1 AND record_key=$2',[r.collection,r.key]);for(const r of b.rows){const previous=old.get(key(r));if(previous&&previous.position===r.position&&isDeepStrictEqual(previous.data,r.data))continue;await client.query(`INSERT INTO record_store_rows(collection,record_key,position,data) VALUES($1,$2,$3,$4) ON CONFLICT(collection,record_key) DO UPDATE SET position=EXCLUDED.position,data=EXCLUDED.data`,[r.collection,r.key,r.position,r.data]);}if(!isDeepStrictEqual(a.meta,b.meta))await client.query(partial?'UPDATE record_store_meta SET data=data || $1::jsonb WHERE id=1':'UPDATE record_store_meta SET data=$1 WHERE id=1',[b.meta]);}
async function migrate(client){
 await client.query('BEGIN');try{
 // Maintenance-only operation: same lock as legacy state writers.
 const result=await client.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE');if(!result.rows.length)throw Error('Missing legacy state');
 await client.query(`CREATE TABLE record_store_meta(id integer PRIMARY KEY,data jsonb NOT NULL); CREATE TABLE record_store_rows(collection text NOT NULL,record_key text NOT NULL,position integer NOT NULL,data jsonb NOT NULL,PRIMARY KEY(collection,record_key)); CREATE INDEX record_store_email ON record_store_rows ((lower(trim(data->>'email')))) WHERE collection='users'; CREATE INDEX record_store_user ON record_store_rows(collection,(data->>'userId')); CREATE INDEX record_store_student ON record_store_rows(collection,(data->>'athleteId'));`);
 const state=result.rows[0].data;await client.query('INSERT INTO record_store_meta VALUES(1,$1)',[split(state).meta]);await write(client,{},state);if(!isDeepStrictEqual(await read(client),state))throw Error('Migration parity failed');await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}
}
async function rollback(client){await client.query('BEGIN');try{await client.query('SELECT id FROM record_store_meta WHERE id=1 FOR UPDATE');await client.query('SELECT id FROM app_state WHERE id=1 FOR UPDATE');await client.query('UPDATE app_state SET data=$1 WHERE id=1',[await read(client)]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}
// Permission predicates use the current stored account, including assignment revocation.
const accessSql = `EXISTS (SELECT 1 FROM record_store_rows u
 WHERE u.collection='users' AND u.record_key=$1 AND NOT COALESCE((u.data->>'accessSuspended')::boolean,false)
 AND (u.data->>'role'='owner'
 OR (u.data->>'role'='athlete' AND a.data->>'userId'=u.data->>'id')
 OR (u.data->>'role' IN ('coach','supervisor','manager') AND jsonb_typeof(a.data->'staffIds')='array' AND a.data->'staffIds' ? (u.data->>'id'))))`;
async function studentsFor(pool,userId){return (await pool.query(`SELECT a.data FROM record_store_rows a WHERE a.collection='athletes' AND ${accessSql} ORDER BY a.position`,['id:'+userId])).rows.map(r=>r.data);}
async function reportsFor(pool,userId){return (await pool.query(`SELECT r.data FROM record_store_rows r WHERE r.collection='reports' AND EXISTS (SELECT 1 FROM record_store_rows a WHERE a.collection='athletes' AND a.record_key='id:'||(r.data->>'athleteId') AND ${accessSql}) ORDER BY r.position`,['id:'+userId])).rows.map(r=>r.data);}
// Student operations load only one student's working set. The metadata lock remains
// the compatibility barrier with account deletion, guardian withdrawal and migration.
async function readStudent(client,{userId,athleteId}){
 const state={users:[],athletes:[],reports:[],transcripts:[],mockSessions:[]};
 state.users=(await client.query("SELECT data FROM record_store_rows WHERE collection='users' AND record_key=$1",['id:'+userId])).rows.map(r=>r.data);
 state.athletes=(await client.query("SELECT data FROM record_store_rows WHERE collection='athletes' AND (record_key=$1 OR data->>'userId'=$2) ORDER BY position",['id:'+athleteId,userId])).rows.map(r=>r.data);
 const ids=state.athletes.map(a=>a.id);
 const rows=(await client.query("SELECT collection,data FROM record_store_rows WHERE collection=ANY($1::text[]) AND data->>'athleteId'=ANY($2::text[]) ORDER BY collection,position",[['reports','transcripts','mockSessions'],ids])).rows;
 for(const row of rows)state[row.collection].push(row.data);
 return state;
}
async function writeStudent(client,before,after){
 if(!isDeepStrictEqual(Object.keys(before).sort(),Object.keys(after).sort()))throw Error('Student operation changed state collections');
 for(const collection of Object.keys(before)){
  if(isDeepStrictEqual(before[collection],after[collection]))continue;
  const identified=data=>typeof data?.id==='string';
  const legacyBefore=before[collection].filter(data=>!identified(data)),legacyAfter=after[collection].filter(data=>!identified(data));
  if(!isDeepStrictEqual(legacyBefore,legacyAfter))throw Error('Legacy records without IDs require a collection transaction');
  const old=new Map(before[collection].filter(identified).map(data=>[data.id,data]));
  const identifiedAfter=after[collection].filter(identified),next=new Set(identifiedAfter.map(data=>data.id));
  if(next.size!==identifiedAfter.length)throw Error('Student records require unique IDs');
  for(const id of old.keys())if(!next.has(id))await client.query('DELETE FROM record_store_rows WHERE collection=$1 AND record_key=$2',[collection,'id:'+id]);
  for(const data of identifiedAfter){
   if(isDeepStrictEqual(old.get(data.id),data))continue;
   if(old.has(data.id))await client.query('UPDATE record_store_rows SET data=$3 WHERE collection=$1 AND record_key=$2',[collection,'id:'+data.id,data]);
   else await client.query('INSERT INTO record_store_rows(collection,record_key,position,data) SELECT $1,$2,COALESCE(MAX(position),-1)+1,$3 FROM record_store_rows WHERE collection=$1',[collection,'id:'+data.id,data]);
  }
 }
}

function create(pool){return {studentsFor:userId=>studentsFor(pool,userId),reportsFor:userId=>reportsFor(pool,userId),async load(scope){const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state=scope?.collections?await read(c,scope.collections):scope?await readStudent(c,scope):await read(c);await c.query('COMMIT');return state;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},async userByEmail(email){return (await pool.query("SELECT data FROM record_store_rows WHERE collection='users' AND lower(trim(data->>'email'))=$1",[email])).rows[0]?.data||null;},async user(id){return (await pool.query("SELECT data FROM record_store_rows WHERE collection='users' AND record_key=$1",['id:'+id])).rows[0]?.data||null;},async mutate(change,scope){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM record_store_meta WHERE id=1 FOR UPDATE');const before=scope?.collections?await read(client,scope.collections):scope?await readStudent(client,scope):await read(client),after=structuredClone(before);const value=await change(after,client);if(scope&&!scope.collections)await writeStudent(client,before,after);else await write(client,before,after,!!scope?.collections);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}};}
module.exports={create,migrate,rollback,split};
