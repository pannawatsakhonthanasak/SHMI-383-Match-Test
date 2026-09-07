const grid=document.getElementById('courseGrid');
const term=document.getElementById('currentTerm');
const academicYear=document.getElementById('academicYear');
const schedulePeriod=document.getElementById('schedulePeriod');
const termLink=document.getElementById('termLink');
const catalogContext=document.getElementById('catalogContext');
const termStatus=document.getElementById('termStatus');

function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}

function renderCourse(course,context){
  const card=course.available?document.createElement('a'):document.createElement('article');
  card.className=`course-card ${course.available?'available':'unavailable'}`;
  if(course.available){card.href=course.path;card.setAttribute('aria-label',`เปิดแบบทดสอบ ${course.code} ${course.name} ${context}`)}

  const top=make('div','course-top');
  top.append(make('span','course-code',course.code));
  top.append(make('span','course-status',course.available?(course.testType||'พร้อมทำแบบทดสอบ'):'ยังไม่มีแบบทดสอบ'));

  const title=make('h3','',course.name);
  const courseContext=make('p','course-context',context);
  const meta=make('div','course-meta');
  meta.append(make('span','',course.day||'รายวิชาในเทอมนี้'));
  meta.append(make('span','course-action',course.available?'เริ่มทำ →':'รออัปเดต'));

  card.append(top,title,courseContext,meta);
  return card;
}

async function loadCourses(){
  try{
    const response=await fetch(`courses.json?v=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const termText=`ปี ${data.yearLevel} · เทอม ${data.semester}`;
    const yearText=`ปีการศึกษา ${data.academicYear}`;
    const context=`ปี ${data.yearLevel} · ปีการศึกษา ${data.academicYear} · เทอม ${data.semester}`;
    const calendar=data.academicCalendar||{};

    if(term)term.textContent=termText;
    if(academicYear)academicYear.textContent=yearText;
    if(termLink)termLink.setAttribute('aria-label',`ดูรายวิชา ${context}`);
    if(catalogContext)catalogContext.textContent=context;
    if(termStatus){
      termStatus.textContent=calendar.label||'';
      termStatus.className=`term-status ${calendar.status||''}`.trim();
      termStatus.hidden=!calendar.label;
    }
    if(schedulePeriod){
      const schedule=data.schedule?.period?`ตารางเรียน ${data.schedule.period}`:'';
      const official=calendar.period?`ภาคการศึกษา ${calendar.period}`:'';
      schedulePeriod.textContent=[schedule,official].filter(Boolean).join(' · ');
    }
    if(grid)grid.replaceChildren(...data.courses.map(course=>renderCourse(course,context)));
  }catch(error){
    if(grid){
      const message=make('div','error','โหลดรายการวิชาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      grid.replaceChildren(message);
    }
    console.error(error);
  }
}

loadCourses();
