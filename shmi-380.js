const state={data:null,level:1,topic:"all",queue:[],index:0,score:0,checked:false,answers:[],choice:null,match:{},order:[]};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const levelNames={1:"ง่าย",2:"ปานกลาง",3:"ยาก"};
const levelHelp={1:"ทบทวนคำศัพท์ นิยาม องค์ประกอบ และข้อเท็จจริงที่ Lecture ระบุโดยตรง",2:"เชื่อมโยง เปรียบเทียบ แยกความแตกต่าง และประยุกต์แนวคิดจาก Lecture",3:"วิเคราะห์ความสัมพันธ์ เงื่อนไข และหลายขั้นจากข้อมูลที่ Lecture รองรับ"};
const typeNames={choice:"เลือกคำตอบ",fill:"เติมคำ",match:"จับคู่",order:"จัดลำดับ"};
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalize=s=>String(s??"").trim().toLowerCase().replace(/[._-]+/g," ").replace(/\s+/g," ");
function questionsForSelection(){
  return state.data.questions.filter(q=>q.level===state.level&&(state.topic==="all"||q.source===state.topic));
}
function start(){
  const pool=questionsForSelection();
  state.queue=shuffle(pool);state.index=0;state.score=0;state.checked=false;state.answers=[];
  $("#results").hidden=true;$("#score").textContent="0 คะแนน";render();
}
function buildTopics(){
  const select=$("#topic");const sources=[...new Set(state.data.questions.map(q=>q.source))];
  for(const s of sources){const o=document.createElement("option");o.value=s;o.textContent=s;select.appendChild(o)}
}
function render(){
  const q=state.queue[state.index];
  if(!q){$("#questionWrap").innerHTML='<div class="review"><strong>ยังไม่มีคำถามในตัวกรองนี้</strong><p>ลองเลือก “รวมทุก Lecture” หรือเปลี่ยนระดับ</p></div>';$("#check").disabled=true;return}
  state.checked=false;state.choice=null;state.match={};state.order=q.type==="order"?shuffleUntilDifferent(q.items):[];
  $("#feedback").textContent="";$("#feedback").className="";$("#check").hidden=false;$("#next").hidden=true;$("#check").disabled=true;
  $("#progress").textContent=`ข้อ ${state.index+1} / ${state.queue.length}`;$("#formatLabel").textContent=typeNames[q.type]||q.type;
  $("#levelLabel").textContent=levelNames[state.level];$("#levelHelp").textContent=levelHelp[state.level];
  let body=`<article class="question-card"><div class="q-meta"><span class="q-type">${esc(typeNames[q.type]||q.type)}</span><span class="q-source">${esc(q.source)}</span></div><h2>${esc(q.prompt)}</h2>`;
  if(q.type==="choice"){
    body+='<div class="option-list">'+q.options.map((o,i)=>`<button class="option-btn" data-choice="${i}"><span class="option-key">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join("")+'</div>';
  }else if(q.type==="fill"){
    body+='<div class="fill-box"><input id="fillAnswer" autocomplete="off" placeholder="พิมพ์คำตอบที่นี่" aria-label="คำตอบ"></div>';
  }else if(q.type==="match"){
    const rights=shuffle(q.pairs.map(p=>p.right));
    body+='<div class="match-grid">'+q.pairs.map((p,i)=>`<div class="match-row" data-match-row="${i}"><div class="match-left">${esc(p.left)}</div><div class="match-arrow">→</div><select data-match="${i}"><option value="">เลือกคำตอบ</option>${rights.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select></div>`).join("")+'</div>';
  }else if(q.type==="order"){
    body+='<div id="orderList" class="order-list">'+renderOrderItems()+'</div>';
  }
  body+=`<div class="source-note"><strong>Source:</strong> ${esc(q.source)}</div></article>`;
  $("#questionWrap").innerHTML=body;bindQuestion();
}
function shuffleUntilDifferent(items){
  if(items.length<2)return [...items];let x=shuffle(items);let tries=0;
  while(x.every((v,i)=>v===items[i])&&tries++<8)x=shuffle(items);return x;
}
function renderOrderItems(){
  return state.order.map((item,i)=>`<div class="order-item"><span class="order-num">${i+1}</span><span>${esc(item)}</span><span class="order-controls"><button data-move="${i}" data-dir="-1" aria-label="เลื่อนขึ้น">↑</button><button data-move="${i}" data-dir="1" aria-label="เลื่อนลง">↓</button></span></div>`).join("");
}
function bindQuestion(){
  $$(".option-btn").forEach(b=>b.addEventListener("click",()=>{if(state.checked)return;state.choice=Number(b.dataset.choice);$$(".option-btn").forEach(x=>x.classList.toggle("selected",x===b));$("#check").disabled=false}));
  const fill=$("#fillAnswer");if(fill)fill.addEventListener("input",()=>{$("#check").disabled=!fill.value.trim()});
  $$("[data-match]").forEach(s=>s.addEventListener("change",()=>{state.match[s.dataset.match]=s.value;$("#check").disabled=$$("[data-match]").some(x=>!x.value)}));
  $$("#orderList [data-move]").forEach(b=>b.addEventListener("click",()=>{if(state.checked)return;const i=Number(b.dataset.move),d=Number(b.dataset.dir),j=i+d;if(j<0||j>=state.order.length)return;[state.order[i],state.order[j]]=[state.order[j],state.order[i]];$("#orderList").innerHTML=renderOrderItems();bindOrder();$("#check").disabled=false}));
  if($("#orderList")){$("#check").disabled=false;bindOrder()}
}
function bindOrder(){
  $$("#orderList [data-move]").forEach(b=>b.onclick=()=>{if(state.checked)return;const i=Number(b.dataset.move),d=Number(b.dataset.dir),j=i+d;if(j<0||j>=state.order.length)return;[state.order[i],state.order[j]]=[state.order[j],state.order[i]];$("#orderList").innerHTML=renderOrderItems();bindOrder()});
}
function evaluate(){
  const q=state.queue[state.index];let ok=false,chosen="";
  if(q.type==="choice"){ok=state.choice===q.answer;chosen=q.options[state.choice]??"";$$(".option-btn").forEach((b,i)=>{b.disabled=true;if(i===q.answer)b.classList.add("correct");if(i===state.choice&&i!==q.answer)b.classList.add("wrong")})}
  if(q.type==="fill"){const val=$("#fillAnswer").value;chosen=val;ok=q.answers.map(normalize).includes(normalize(val));$("#fillAnswer").disabled=true}
  if(q.type==="match"){ok=q.pairs.every((p,i)=>state.match[i]===p.right);chosen=q.pairs.map((p,i)=>`${p.left} → ${state.match[i]||"—"}`).join(" | ");$$("[data-match]").forEach((s,i)=>{s.disabled=true;s.closest(".match-row").classList.add(state.match[i]===q.pairs[i].right?"correct":"wrong")})}
  if(q.type==="order"){ok=q.items.every((v,i)=>state.order[i]===v);chosen=state.order.join(" → ");$("#orderList").classList.add(ok?"correct":"wrong");$$("#orderList button").forEach(b=>b.disabled=true)}
  state.checked=true;if(ok)state.score++;state.answers.push({id:q.id,prompt:q.prompt,ok,chosen,correct:correctText(q),explanation:q.explanation,source:q.source});
  $("#score").textContent=`${state.score} คะแนน`;$("#feedback").textContent=(ok?"ถูกต้อง · ":"ยังไม่ถูก · ")+q.explanation;$("#feedback").className=ok?"good":"bad";
  $("#check").hidden=true;$("#next").hidden=false;$("#next").textContent=state.index===state.queue.length-1?"ดูสรุป →":"ข้อต่อไป →";
}
function correctText(q){
  if(q.type==="choice")return q.options[q.answer];
  if(q.type==="fill")return q.answers[0];
  if(q.type==="match")return q.pairs.map(p=>`${p.left} → ${p.right}`).join(" | ");
  if(q.type==="order")return q.items.join(" → ");return "";
}
function next(){
  if(state.index<state.queue.length-1){state.index++;render()}else finish();
}
function finish(){
  $("#questionWrap").innerHTML='<div class="review"><strong>จบชุดแบบทดสอบแล้ว</strong><p>ดูคะแนนและทบทวนคำตอบด้านล่าง</p></div>';$("#check").hidden=true;$("#next").hidden=true;
  const pct=state.queue.length?Math.round(state.score/state.queue.length*100):0;
  $("#summary").innerHTML=`<div class="score-big">${state.score}/${state.queue.length}<span>${pct}% · ระดับ${levelNames[state.level]}</span></div>`;
  $("#reviewList").innerHTML=state.answers.map(a=>`<div class="review"><span class="state ${a.ok?"":"bad"}">${a.ok?"ตอบถูก":"ทบทวนอีกครั้ง"}</span><p class="prompt">${esc(a.prompt)}</p>${a.ok?"":`<p class="chosen">คำตอบของคุณ: ${esc(a.chosen||"—")}</p>`}<p class="answer-line"><strong>เฉลย:</strong> ${esc(a.correct)}</p><p>${esc(a.explanation)}</p><small class="source-line">Source: ${esc(a.source)}</small></div>`).join("");
  $("#results").hidden=false;$("#results").scrollIntoView({behavior:"smooth",block:"start"});
}
async function init(){
  try{
    const res=await fetch("shmi-380-questions.json",{cache:"no-store"});if(!res.ok)throw new Error("โหลดคลังคำถามไม่สำเร็จ");
    state.data=await res.json();$("#bankCount").textContent=state.data.questions.length;$("#sourceCount").textContent=`${state.data.sources.length} Lecture sources`;$("#updated").textContent=new Date(state.data.generatedAt).toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"});
    $("#sources").innerHTML=state.data.sources.map(s=>`<div>${esc(s.title)}</div>`).join("");buildTopics();start();
  }catch(e){$("#questionWrap").innerHTML=`<div class="review"><strong>โหลดข้อมูลไม่สำเร็จ</strong><p>${esc(e.message)}</p></div>`}
}
$$(".levels button").forEach(b=>b.addEventListener("click",()=>{state.level=Number(b.dataset.level);$$(".levels button").forEach(x=>{const on=x===b;x.classList.toggle("active",on);x.setAttribute("aria-pressed",on)});start()}));
$("#topic").addEventListener("change",e=>{state.topic=e.target.value;start()});
$("#restart").addEventListener("click",start);$("#check").addEventListener("click",evaluate);$("#next").addEventListener("click",next);
init();