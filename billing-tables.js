'use strict';
// Only these hard-coded identifiers may be interpolated into billing SQL.
function tablesFor(mode='test') {
  if(!['test','live'].includes(mode))throw Error('Invalid billing ledger mode');
  return Object.freeze({checkouts:`paystack_${mode}_checkouts`,payments:`paystack_${mode}_payments`,
    entitlements:`billing_${mode}_entitlements`,usage:`billing_${mode}_usage`,
    pending:`paystack_${mode}_one_pending_checkout`,holds:`billing_${mode}_holds`});
}
module.exports={tablesFor};
