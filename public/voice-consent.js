// A new agreement is requested for each voice session, before microphone access.
let voiceConsentOpen=false;
function requestVoiceConsent(mode,onAgree){
  if(voiceConsentOpen)return;
  voiceConsentOpen=true;
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='voice-consent';
  dialog.setAttribute('aria-labelledby','voiceConsentTitle');
  dialog.setAttribute('aria-describedby','voiceConsentSummary');
  const learning=mode==='learn';
  dialog.innerHTML=`<div class="consent-brand">VisaAtlas · ${learning?'Voice tutoring':'Mock interview'}</div>
    <h2 id="voiceConsentTitle">Before you start</h2>
    <p id="voiceConsentSummary">VisaAtlas uses OpenAI to power your AI ${learning?'tutor':'interviewer'}. Your microphone audio and study profile are shared with OpenAI during the session.</p>
    <p>${learning?'Your saved lesson notes are also shared. VisaAtlas saves your notes, but does not save the tutor conversation.':'We save your interview transcript and feedback report.'} Authorized staff can access your saved records.</p>
    <p>VisaAtlas does not save audio or video recordings. End the session anytime to stop microphone sharing.</p>
    <p><a href="/privacy.html" target="_blank" rel="noopener noreferrer">VisaAtlas Privacy Policy (opens in a new tab)</a></p>
    <details><summary>Privacy details</summary><p>Your speech is transcribed to support the conversation. ${learning?'Notes you choose to save remain in your learning profile.':'Your mock transcript is saved when you end the interview and used to create your feedback report.'}</p><p>Audio and information are processed by OpenAI. VisaAtlas’s statement about not saving recordings does not describe OpenAI’s retention practices. <a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noopener noreferrer">Read OpenAI’s privacy policy</a>.</p></details>
    <div class="consent-actions"><button type="button" class="btn secondary" data-cancel autofocus>Cancel</button><button type="button" class="btn primary" data-agree>Agree and start</button></div>`;
  let finished=false;
  function finish(agreed){
    if(finished)return;finished=true;
    dialog.close();dialog.remove();voiceConsentOpen=false;
    if(previous?.isConnected)previous.focus();
    if(agreed)onAgree();
  }
  dialog.querySelector('[data-cancel]').onclick=()=>finish(false);
  dialog.querySelector('[data-agree]').onclick=()=>finish(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
  dialog.addEventListener('close',()=>finish(false));
  document.body.append(dialog);
  try{dialog.showModal()}catch(error){dialog.remove();voiceConsentOpen=false;throw error}
}
