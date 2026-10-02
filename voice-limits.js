// Persistent admission limits and server-side call expiry. No transcripts stored here.
const POLICY = Object.freeze({learn: {seconds:480,tokens:1024},mock: {seconds:720,tokens:512}});
function createVoiceLimits(pool, apiKey, request=fetch) {
  async function init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS voice_daily_usage (
      user_id TEXT PRIMARY KEY, usage_day DATE NOT NULL, starts INTEGER NOT NULL)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS voice_call_limits (
      call_id TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL)`);
  }
  async function reserve(userId) {
    // A single row per account: atomic across tabs, processes and redeployments.
    const result=await pool.query(`INSERT INTO voice_daily_usage (user_id,usage_day,starts)
      VALUES ($1,(NOW() AT TIME ZONE 'UTC')::date,1)
      ON CONFLICT (user_id) DO UPDATE SET
        usage_day=EXCLUDED.usage_day,
        starts=CASE WHEN voice_daily_usage.usage_day=EXCLUDED.usage_day THEN voice_daily_usage.starts+1 ELSE 1 END
      WHERE voice_daily_usage.usage_day<>EXCLUDED.usage_day OR voice_daily_usage.starts<6
      RETURNING starts`,[userId]);
    return result.rows.length>0;
  }
  function callId(location) {
    // Never fetch an upstream-provided URL directly.
    const match=/\/realtime\/calls\/([A-Za-z0-9_-]+)$/.exec(location||'');
    if(!match)throw new Error('Voice provider did not return a call identifier.');
    return match[1];
  }
  async function hangup(id) {
    const response=await request(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(id)}/hangup`,{
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(10000)
    });
    if(!response.ok && ![404,410].includes(response.status))throw new Error('Voice hangup failed');
  }
  async function track(location,mode) {
    const id=callId(location),seconds=POLICY[mode].seconds;
    try {
      await pool.query(`INSERT INTO voice_call_limits (call_id,expires_at)
        VALUES ($1,NOW()+($2 * INTERVAL '1 second'))`,[id,seconds]);
    } catch(error) {
      // Do not hand the browser an untracked call if persistence fails.
      try {await hangup(id)} catch {console.error('[voice] UNTRACKED_CALL_HANGUP_FAILED')}
      throw error;
    }
    return seconds;
  }
  let sweeping=false;
  async function sweep() {
    if(sweeping)return;
    sweeping=true;
    try {
      const result=await pool.query('SELECT call_id FROM voice_call_limits WHERE expires_at<=NOW() ORDER BY expires_at LIMIT 100');
      // Failed calls remain stored and retry on the next pass, including after restart.
      for(const row of result.rows) {
        try {await hangup(row.call_id);await pool.query('DELETE FROM voice_call_limits WHERE call_id=$1',[row.call_id])}
        catch {console.error('[voice] CALL_EXPIRY_RETRY')}
      }
    } finally {sweeping=false}
  }
  function start() {
    const tick=()=>sweep().catch(()=>console.error('[voice] CALL_EXPIRY_CHECK_FAILED'));
    tick();const timer=setInterval(tick,15000);timer.unref();return timer;
  }
  return {init,reserve,track,sweep,start};
}
module.exports={POLICY,createVoiceLimits};
