'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {commercialOverview}=require('../owner-commercial');
const fs=require('node:fs'),path=require('node:path');
test('disabled and test-mode business metrics cannot masquerade as real sales',async()=>{
 const neverUsed={query(){throw Error('no live database should be queried');}};
 const summary=await commercialOverview(neverUsed,{mode:'test',studentAccounts:18,studentProfiles:15});
 assert.equal(summary.mode,'test');assert.equal(summary.verifiedPayments,0);
 assert.equal(summary.financialsComplete,false);assert.equal(summary.studentAccounts,18);
});
test('owner commercial metrics count only verified, non-held live Paystack transactions',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 CREATE TABLE paystack_live_checkouts(
   reference TEXT PRIMARY KEY,user_id TEXT,plan_id TEXT,amount BIGINT,currency TEXT,state TEXT);
 CREATE TABLE paystack_live_payments(reference TEXT PRIMARY KEY,verified_at TIMESTAMPTZ);
 CREATE TABLE billing_live_holds(reference TEXT PRIMARY KEY,reason TEXT);
 CREATE TABLE billing_live_entitlements(reference TEXT PRIMARY KEY,expires_at TIMESTAMPTZ);
 CREATE TABLE mock_trial_accounts(user_id TEXT PRIMARY KEY);
 CREATE TABLE mock_trial_usage(token TEXT PRIMARY KEY,state TEXT);
 `);
 await db.query("INSERT INTO paystack_live_checkouts VALUES ('one','student-1','starter',2900,'USD','paid'),('two','student-2','standard',4900,'USD','paid'),('three','student-3','starter',2900,'USD','open'),('four','student-4','starter',2900,'USD','paid')");
 await db.query("INSERT INTO paystack_live_payments VALUES ('one',NOW()),('two',NOW()),('four',NOW())");
 await db.query("INSERT INTO billing_live_holds VALUES ('four','chargeback')");
 await db.query("INSERT INTO billing_live_entitlements VALUES ('one',NOW()+INTERVAL '10 days'),('two',NOW()-INTERVAL '1 day'),('four',NOW()+INTERVAL '10 days')");
 await db.query("INSERT INTO mock_trial_accounts VALUES ('student-1'),('student-3')");
 await db.query("INSERT INTO mock_trial_usage VALUES ('trial-1','consumed'),('trial-2','consumed'),('trial-3','released')");
 const result=await commercialOverview(db,{mode:'live',studentAccounts:4,studentProfiles:4});
 assert.equal(result.verifiedPayments,2);
 assert.equal(result.verifiedPayers,2);
 assert.equal(result.verifiedUsdCents,7800);
 assert.equal(result.verifiedUsd30dCents,7800);
 assert.equal(result.activePaidAccounts,1);
 assert.equal(result.onHoldPayments,1);
 assert.equal(result.openCheckouts,1);
 assert.equal(result.trialAccounts,2);
 assert.equal(result.trialMockSessionsUsed,2);
 assert.equal(result.trialAccountsWithPayment,1);
 assert.equal(result.trialOverlapRate,50);
 assert.equal(result.starterPurchases,1);
 assert.equal(result.standardPurchases,1);
 assert.equal(result.financialsComplete,false);
});
test('commercial route is protected by Owner guard and public pages do not access it',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const owner=src.indexOf("if(url.pathname.startsWith('/api/owner/'))");
 const guard=src.indexOf("if(!isOwner(u))return json(res,403",owner);
 const route=src.indexOf("url.pathname==='/api/owner/commercial'",owner);
 assert.ok(owner>0 && guard>owner && route>guard);
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/id="ownerCommercial"/);
 assert.match(html,/owner-commercial.js/);
});
