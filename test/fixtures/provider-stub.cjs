// Loaded only by the isolated HTTP integration test. Unknown requests fail closed.
if(process.env.VISAATLAS_SYNTHETIC_TEST!=='1')throw Error('Synthetic test opt-in required');
globalThis.fetch=async url=>{
 if(url==='https://api.openai.com/v1/realtime/calls')return new Response('v=0\r\n',{status:201,headers:{location:'/v1/realtime/calls/synthetic_call'}});
 if(url==='https://api.openai.com/v1/realtime/calls/synthetic_call/hangup')return new Response('',{status:200});
 if(url==='https://api.openai.com/v1/responses')return Response.json({output_text:JSON.stringify({summary:'Synthetic storage test report.',strengths:[],assessments:require('../../interview-design').TOPICS.map(([topic])=>({topic,status:'not_covered'}))})});
 throw Error('Unexpected external request in synthetic test');
};
