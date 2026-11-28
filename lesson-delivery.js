'use strict';
const course=require('./public/curriculum');
const written=require('./public/written-languages');
const preview=({id,title,summary})=>({id,title,summary});
const catalog=Object.fromEntries(written.codes.map(code=>{
  const data=require('./public/locales/'+code+'.json');
  return [code,{strings:data.strings,formats:data.formats,lessons:data.lessons.map(preview)}];
}));
const publicCourse='window.VisaAtlasCurriculum='+JSON.stringify(course.map(preview))+
  ';window.VisaAtlasCurriculum.studyLevels='+JSON.stringify(course.studyLevels)+
  ';window.VisaAtlasCurriculum.resolveLevel='+course.resolveLevel.toString()+';';
const publicTranslations='window.VisaAtlasWrittenCatalogs='+JSON.stringify(catalog)+';';
function content(student,id){
  return Object.fromEntries(['en',...written.codes].map(code=>{
    const lesson=written.lessons(code).find(item=>item.id===id);
    return [code,{guidance:written.forStudent(code,student,id),prompts:lesson.prompts}];
  }));
}
module.exports={publicCourse,publicTranslations,content};
