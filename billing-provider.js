'use strict';
function createBilling(pool,{env=process.env}={}) {
  const provider=env.BILLING_PROVIDER||'paystack';
  if(!['paystack','stripe'].includes(provider))throw Error('Unknown billing provider');
  if(provider==='paystack')return require('./paystack-billing').createBilling(pool,{env});
  const billing=require('./billing').createBilling(pool,{env});
  return {...billing,webhook:(raw,headers)=>billing.webhook(raw,headers['stripe-signature'])};
}
module.exports={createBilling};
