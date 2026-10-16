const {getCountries,getCountryCallingCode,parsePhoneNumberFromString}=require('libphonenumber-js');
const names=new Intl.DisplayNames(['en'],{type:'region'});
const countries=getCountries().map(code=>({code,name:names.of(code),callingCode:'+'+getCountryCallingCode(code)})).sort((a,b)=>a.name.localeCompare(b.name));
const sports=['Not a student-athlete','Track and field','Basketball','Volleyball','Football / Soccer','American football','Baseball','Softball','Tennis','Table tennis','Swimming','Diving','Golf','Cross country','Wrestling','Gymnastics','Rowing','Lacrosse','Field hockey','Ice hockey','Rugby','Cricket','Badminton','Cycling','Fencing','Boxing','Judo','Taekwondo','Karate','Weightlifting','Water polo','Sailing','Skiing','Snowboarding','Bowling','Cheerleading','Esports','Other'];
const fundingSources=['Family / guardian','Personal funds','Academic scholarship','Athletic scholarship','Government sponsorship','Research / teaching assistantship','Employer sponsorship','Education loan','Other','Not decided yet'];
function normalizePhone(phone,country){
 if(!phone)return '';
 const parsed=parsePhoneNumberFromString(phone,country||undefined);
 if(!parsed?.isPossible())throw Object.assign(new Error('Enter a valid phone number and select its calling country, or leave phone blank.'),{status:400,publicMessage:'Enter a valid phone number and select its calling country, or leave phone blank.'});
 return parsed.number;
}
module.exports={countries,sports,fundingSources,normalizePhone};
