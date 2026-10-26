// Refuses remote connections. Production cutover requires a separately reviewed procedure.
const {Pool}=require('pg'),store=require('../record-store');
const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.startsWith('/visaatlas_'))throw Error('Explicit disposable local test database required');
if(!['migrate','rollback'].includes(process.argv[2]))throw Error('Use migrate or rollback');
const pool=new Pool({connectionString:url});(async()=>{const c=await pool.connect();try{await store[process.argv[2]](c);}finally{c.release();await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
