(function(root){
 const validDate=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 function daysUntil(value,now=new Date()){
  if(!validDate(value))return null;
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((Date.parse(value+'T00:00:00Z')-today)/86400000);
 }
 const api={validDate,daysUntil};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VisaAtlasPlanning=api;
})(typeof window==='undefined'?globalThis:window);
