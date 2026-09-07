const grid=document.getElementById('courseGrid');
const term=document.getElementById('currentTerm');
const academicYear=document.getElementById('academicYear');
const schedulePeriod=document.getElementById('schedulePeriod');
const lastUpdated=document.getElementById('lastUpdated');

function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}

function renderCourse(course){
  const card=course.available?document.createElement('a'):document.createElement('article');
  card.className=`course-card ${course.available?'available':'unavailable'}`;
  if(course.available){card.href=course.path;card.setAttribute('aria-label',`เปิดแบบทดสอบ ${course.code} ${course.name}`)}

  const top=make('div','course-top');
  top.append(make('span','course-code',course.code));
  top.append(make('span','course-status',course.available?(course.testType||'พร้อมทำแบบทดสอบ'):'ยังไม่มีแบบทดสอบ'));
  const title=make('h3','',course.name);
  const meta=make('div','course-meta');
  meta.append(make('span','',course.day||'รายวิชาในเทอมนี้'));
  meta.append(make('span','course-action',course.available?'เริ่มทำ →':'รออัปเดต'));
  card.append(top,title,meta);
  return card;
}

async function loadCourses(){
  try{
    const response=await fetch(`courses.json?v=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    term.textContent=`ปี ${data.yearLevel} · เทอม ${data.semester}`;
    academicYear.textContent=`ปีการศึกษา ${data.academicYear}`;
    schedulePeriod.textContent=data.schedule?.period?`ช่วงเรียน ${data.schedule.period}`:'';
    lastUpdated.textContent=data.generatedAt?`ข้อมูลล่าสุด ${new Date(data.generatedAt).toLocaleDateString('th-TH',{dateStyle:'medium'})}`:'';
    grid.replaceChildren(...data.courses.map(renderCourse));
  }catch(error){
    const message=make('div','error','โหลดรายการวิชาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    grid.replaceChildren(message);
    console.error(error);
  }
}

loadCourses();
