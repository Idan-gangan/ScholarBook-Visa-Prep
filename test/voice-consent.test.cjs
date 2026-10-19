const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/voice-consent.js'),'utf8');
function setup(){
 const buttons={'[data-cancel]':{},'[data-agree]':{}},events={};let calls=0,focused=0,created=0;
 const dialog={setAttribute(){},querySelector:s=>buttons[s],addEventListener:(s,fn)=>events[s]=fn,showModal(){this.open=true},close(){this.open=false},remove(){this.removed=true}};
 const ctx=vm.createContext({document:{activeElement:{isConnected:true,focus(){focused++}},body:{append(){}},createElement(){created++;return dialog}},agree(){calls++}});
 vm.runInContext(code,ctx);
 return {dialog,buttons,events,run:s=>vm.runInContext(s,ctx),calls:()=>calls,focused:()=>focused,created:()=>created};
}
test('mock and tutor notices explain distinct saved records',()=>{
 for(const mode of ['mock','learn']){const s=setup();s.run(`requestVoiceConsent('${mode}',agree)`);assert.match(s.dialog.innerHTML,/OpenAI/);assert.match(s.dialog.innerHTML,/Privacy details/);assert.match(s.dialog.innerHTML,mode==='mock'?/save your interview transcript/:/does not save the tutor conversation/);assert.equal(s.calls(),0)}
});
test('agree starts once and restores focus; repeated opening is ignored',()=>{
 const s=setup();s.run("requestVoiceConsent('mock',agree);requestVoiceConsent('mock',agree)");assert.equal(s.created(),1);
 s.buttons['[data-agree]'].onclick();s.buttons['[data-agree]'].onclick();assert.equal(s.calls(),1);assert.equal(s.focused(),1);assert.equal(s.dialog.removed,true);
});
test('Cancel and Escape never start microphone session and allow another prompt',()=>{
 for(const escape of [false,true]){const s=setup();s.run("requestVoiceConsent('learn',agree)");if(escape)s.events.cancel({preventDefault(){}});else s.buttons['[data-cancel]'].onclick();assert.equal(s.calls(),0);assert.equal(s.dialog.open,false);s.run("requestVoiceConsent('mock',agree)");assert.equal(s.created(),2)}
});
