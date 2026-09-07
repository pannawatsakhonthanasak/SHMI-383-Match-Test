(() => {
  const state = {
    mode: 'match', level: 1, index: 0, questions: [], selected: null,
    answer: '', matched: {}, score: 0, checked: false, finished: false
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const shuffle = a => [...a].sort(() => Math.random() - .5);
  const levelName = n => ({1:'ง่าย',2:'ปานกลาง',3:'ยาก'}[n] || '');
  const modeName = m => m === 'match' ? 'จับคู่' : m === 'blank' ? 'เติมลงในช่องว่าง' : 'ก, ข, ค, ง';
  const norm = s => (s || '').toLowerCase().trim().replace(/[.,;:()\[\]{}]/g, '').replace(/\s+/g, ' ');

  async function load() {
    const course = document.body.dataset.course;
    const r = await fetch(`data/${course}.json?v=${Date.now()}`, {cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    window.examData = data;
    document.title = `${data.code} ${data.name}`;
    $('#courseCode').textContent = data.code;
    $('#courseName').textContent = data.name;
    $('#sourceSummary').textContent = `Lecture ${data.sources.length} แหล่ง · คลัง ${data.questions.length} ชุดข้อสอบ`;
    bind();
    reset();
  }

  function bind() {
    $$('.mode-btn').forEach(b => b.onclick = () => {
      state.mode = b.dataset.mode;
      $$('.mode-btn').forEach(x => x.classList.toggle('active', x === b));
      reset();
    });
    $$('.level-btn').forEach(b => b.onclick = () => {
      state.level = Number(b.dataset.level);
      $$('.level-btn').forEach(x => x.classList.toggle('active', x === b));
      reset();
    });
    $('#check').onclick = check;
    $('#next').onclick = next;
    $('#restart').onclick = reset;
  }

  function reset() {
    state.questions = shuffle((window.examData.questions || []).filter(q => q.level === state.level && q.mode === state.mode));
    state.index = 0;
    state.score = 0;
    state.finished = false;
    render();
  }

  function resetAnswerState() {
    state.selected = null;
    state.answer = '';
    state.matched = {};
    state.checked = false;
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    $('#check').hidden = false;
    $('#check').disabled = false;
    $('#next').hidden = true;
  }

  function updateProgress() {
    const total = state.questions.length;
    $('#progress').textContent = total ? `ข้อ ${Math.min(state.index + 1, total)} / ${total} · ${state.score} คะแนน` : 'ยังไม่มีข้อสอบ';
    $('#modeLabel').textContent = `${modeName(state.mode)} · ${levelName(state.level)}`;
  }

  function render() {
    resetAnswerState();
    updateProgress();
    const q = state.questions[state.index];
    if (!q) {
      $('#questionArea').innerHTML = '<div class="empty">ยังไม่มีข้อสอบสำหรับรูปแบบและระดับนี้</div>';
      $('#check').hidden = true;
      return;
    }
    let html = `<div class="question-kicker">${escapeHtml(q.source || '')}</div><h2>${escapeHtml(q.prompt)}</h2>`;
    if (state.mode === 'choice') {
      html += `<div class="options">${q.options.map((o,i)=>`<button class="option" data-i="${i}"><b>${['ก','ข','ค','ง'][i]}.</b><span>${escapeHtml(o)}</span></button>`).join('')}</div>`;
    } else if (state.mode === 'blank') {
      html += '<input id="blankAnswer" class="blank-input" autocomplete="off" spellcheck="false" placeholder="พิมพ์คำตอบที่นี่">';
    } else {
      const choices = shuffle(q.pairs.map(p => p.right));
      html += `<div class="match-list">${q.pairs.map((p,i)=>`<div class="match-row"><div>${escapeHtml(p.left)}</div><select data-i="${i}"><option value="">เลือกคำตอบ</option>${choices.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></div>`).join('')}</div>`;
    }
    $('#questionArea').innerHTML = html;
    if (state.mode === 'choice') {
      $$('.option').forEach(o => o.onclick = () => {
        if (state.checked) return;
        $$('.option').forEach(x => x.classList.remove('selected'));
        o.classList.add('selected');
        state.selected = Number(o.dataset.i);
      });
    } else if (state.mode === 'match') {
      $$('#questionArea select').forEach(s => s.onchange = () => state.matched[s.dataset.i] = s.value);
    }
  }

  function hasAnswer(q) {
    if (state.mode === 'choice') return state.selected !== null;
    if (state.mode === 'blank') return !!$('#blankAnswer')?.value.trim();
    return q.pairs.every((_, i) => state.matched[i]);
  }

  function check() {
    const q = state.questions[state.index];
    if (!q || state.checked) return;
    if (!hasAnswer(q)) {
      $('#feedback').textContent = 'กรุณาตอบให้ครบก่อนตรวจคำตอบ';
      $('#feedback').className = 'feedback warn';
      return;
    }
    let ok = false;
    if (state.mode === 'choice') ok = state.selected === q.answer;
    if (state.mode === 'blank') {
      state.answer = $('#blankAnswer').value;
      ok = (q.answers || []).some(a => norm(a) === norm(state.answer));
    }
    if (state.mode === 'match') ok = q.pairs.every((p,i) => state.matched[i] === p.right);
    state.checked = true;
    if (ok) state.score += 1;
    lockAndReveal(q, ok);
    $('#feedback').textContent = `${ok ? 'ถูกต้อง' : 'ยังไม่ถูก'} — ${q.explanation}`;
    $('#feedback').className = `feedback ${ok ? 'good' : 'bad'}`;
    $('#check').hidden = true;
    $('#next').hidden = false;
    $('#next').textContent = state.index === state.questions.length - 1 ? 'ดูผลลัพธ์' : 'ข้อต่อไป';
    updateProgress();
  }

  function lockAndReveal(q, ok) {
    if (state.mode === 'choice') {
      $$('.option').forEach((o,i) => {
        o.disabled = true;
        if (i === q.answer) o.classList.add('correct');
        if (i === state.selected && i !== q.answer) o.classList.add('wrong');
      });
    } else if (state.mode === 'blank') {
      const input = $('#blankAnswer');
      input.disabled = true;
      input.classList.toggle('correct', ok);
      input.classList.toggle('wrong', !ok);
    } else {
      $$('#questionArea select').forEach((s,i) => {
        s.disabled = true;
        s.classList.toggle('correct', s.value === q.pairs[i].right);
        s.classList.toggle('wrong', s.value !== q.pairs[i].right);
      });
    }
  }

  function next() {
    if (!state.checked) return;
    if (state.index >= state.questions.length - 1) return finish();
    state.index += 1;
    render();
  }

  function finish() {
    state.finished = true;
    const total = state.questions.length;
    const pct = total ? Math.round(state.score * 100 / total) : 0;
    $('#progress').textContent = `เสร็จสิ้น · ${state.score} / ${total} คะแนน`;
    $('#questionArea').innerHTML = `<div class="result-card"><div class="score-ring">${pct}%</div><h2>${state.score} / ${total} คะแนน</h2><p>${modeName(state.mode)} · ระดับ${levelName(state.level)}</p><button class="button primary" id="again">ทำชุดใหม่</button></div>`;
    $('#feedback').textContent = '';
    $('#check').hidden = true;
    $('#next').hidden = true;
    $('#again').onclick = reset;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  load().catch(e => {
    $('#questionArea').innerHTML = '<div class="empty">โหลดคลังข้อสอบไม่สำเร็จ</div>';
    $('#feedback').textContent = 'กรุณาลองรีเฟรชหน้าอีกครั้ง';
    console.error(e);
  });
})();
