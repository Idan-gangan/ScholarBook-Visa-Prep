const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','public');
const catalogs=Object.fromEntries(['fr','es','pt','ar','sw'].map(c=>[c,JSON.parse(fs.readFileSync(path.join(root,'locales',c+'.json'),'utf8'))]));
fs.writeFileSync(path.join(root,'written-catalogs.js'),'/* Generated from public/locales/*.json by scripts/build-written-catalogs.cjs. */\nwindow.VisaAtlasWrittenCatalogs='+JSON.stringify(catalogs)+';\n');
