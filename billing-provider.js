'use strict';
const {createPartnerAccess}=require('./partner-access');
function createBilling(pool,{env=process.env}={}){
  const provider=env.BILLING_PROVIDER||'paystack';
  if(!['paystack','stripe'].includes(provider))throw Error('Unknown billing provider');
  const base=provider==='paystack'?require('./paystack-billing').createBilling(pool,{env}):require('./billing').createBilling(pool,{env});
  const partners=createPartnerAccess(pool,{enabled:env.BILLING_MODE==='live'&&provider==='paystack'});
  const existing=base.access;
  if(!existing)return {...base,partnerAccess:partners};
  const access={...existing,
    async status(user){return (await partners.status(user))||existing.status(user);},
    async requireActive(user){if(await partners.status(user))return;return existing.requireActive(user);},
    async reserve(user,token,mode){if(await partners.reserve(user,token,mode))return;return existing.reserve(user,token,mode);},
    async commit(user,token){if(await partners.commit(user,token))return;return existing.commit(user,token);},
    async release(user,token){await partners.release(user,token);return existing.release(user,token);},
    async removeTrial(client,userId,email){await partners.removeUser(userId);return existing.removeTrial?.(client,userId,email);}
  };
  const withStatus=async(user)=>({...await base.status(user),access:await access.status(user)});
  const combined={
    ...base,access,partnerAccess:partners,
    async init(){await base.init();await partners.init();},
    status:withStatus,
    async checkout(user,planId){if(await partners.status(user))throw Object.assign(new Error('Scholarbook-sponsored access is already active. No personal payment is needed.'),{status:409,publicMessage:'Scholarbook-sponsored access is already active. No personal payment is needed.'});return base.checkout(user,planId);}
  };
  if(base.verify)combined.verify=async user=>({...await base.verify(user),access:await access.status(user)});
  if(provider==='stripe')combined.webhook=(raw,headers)=>base.webhook(raw,headers['stripe-signature']);
  return combined;
}
module.exports={createBilling};
