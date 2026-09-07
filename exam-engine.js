(() => {
  const state = {
    course: '', mode: 'match', level: 1, current: null,
    selected: null, answer: '', matched: {}, score: 0, completed: 0,
    checked: false, loadingNext: false
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const shuffle = a => [...a].sort(() => Math.random() - .5);
  const levelName = n => ({1:'ง่าย',2:'ปานกลาง',3:'ยาก'}[n] || '');
  const modeName = m => m === 'match' ? 'จับคู่' : m === 'blank' ? 'เติมลงในช่องว่าง' : 'ก, ข, ค, ง';
  const difficultyText = n => ({
    1:'พื้นฐานระดับอุดมศึกษา · ความรู้ นิยาม และหลักการที่ Lecture ระบุโดยตรง',
    2:'ระดับอุดมศึกษา · เชื่อมโยง เปรียบเทียบ และประยุกต์แนวคิดจาก Lecture',
    3:'ระดับอุดมศึกษา · วิเคราะห์รายละเอียด หลายเงื่อนไข และการตัดสินใจจาก Lecture'
  }[n] || '');
  const norm = s => (s || '').toLowerCase().trim().replace(/[.,;:()\[\]{}]/g, '').replace(/\s+/g, ' ');

  const seenKey = () => `subject-exam-seen:${state.course}:${state.mode}:${state.level}`;
  const getSeen = () => {
    try { return new Set(JSON.parse(sessionStorage.getItem(seenKey()) || '[]')); }
    catch { return new Set(); }
  };
  const setSeen = set => sessionStorage.setItem(seenKey(), JSON.stringify([...set]));

  async function fetchCourseData() {
    const r = await fetch(`data/${state.course}.json?_=${Date.now()}`, {cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    window.examData = await r.json();
    return window.examData;
  }

  async function load() {
    state.course = document.body.dataset.course;
    const [, sr] = await Promise.all([
      fetchCourseData(),
      fetch(`course-sources.json?_=${Date.now()}`, {cache:'no-store'})
    ]);
    const sourceIndex = sr.ok ? await sr.json() : {courses:{}};
    const sourceMeta = sourceIndex.courses?.[state.course] || null;
    const data = window.examData;
    document.title = `${data.code} ${data.name}`;
    $('#courseCode').textContent = data.code;
    $('#courseName').textContent = data.name;
    const sourceCount = sourceMeta?.files?.length || data.sources.length;
    $('#sourceSummary').textContent = `Lecture ${sourceCount} ไฟล์ · แบบทดสอบต่อเนื่อง · ไม่วนข้อซ้ำใน session`;
    renderSourcePanel(sourceMeta);
    bind();
    syncSelectors();
    await startContext();
  }

  function bind() {
    const modeSelect = $('#modeSelect');
    const levelSelect = $('#levelSelect');
    if (modeSelect) modeSelect.onchange = async () => {
      state.mode = modeSelect.value;
      await startContext();
    };
    if (levelSelect) levelSelect.onchange = async () => {
      state.level = Number(levelSelect.value);
      await startContext();
    };
    $('#actionButton').onclick = async () => {
      if (state.loadingNext) return;
      if (state.checked) await next();
      else check();
    };
  }

  function syncSelectors() {
    if ($('#modeSelect')) $('#modeSelect').value = state.mode;
    if ($('#levelSelect')) $('#levelSelect').value = String(state.level);
    if ($('#difficultyNote')) $('#difficultyNote').textContent = difficultyText(state.level);
  }

  async function startContext() {
    state.score = 0;
    state.completed = 0;
    state.current = null;
    state.checked = false;
    syncSelectors();
    await showNextUnseen(false);
  }

  function filteredQuestions() {
    return (window.examData?.questions || []).filter(q => q.level === state.level && q.mode === state.mode);
  }

  function chooseUnseen() {
    const seen = getSeen();
    const unseen = filteredQuestions().filter(q => !seen.has(q.id));
    return unseen.length ? unseen[Math.floor(Math.random() * unseen.length)] : null;
  }

  async function showNextUnseen(refreshIfEmpty = true) {
    state.loadingNext = true;
    let q = chooseUnseen();
    if (!q && refreshIfEmpty) {
      try { await fetchCourseData(); } catch {}
      q = chooseUnseen();
    }
    state.loadingNext = false;
    state.current = q;
    if (!q) return renderExhausted();
    renderQuestion();
  }

  function resetAnswerState() {
    state.selected = null;
    state.answer = '';
    state.matched = {};
    state.checked = false;
    $('#feedback').innerHTML = '';
    $('#feedback').className = 'feedback';
    const action = $('#actionButton');
    action.disabled = false;
    action.textContent = 'ตรวจคำตอบ';
    action.classList.remove('next-state');
  }

  function updateProgress() {
    $('#progress').textContent = state.checked
      ? `ทำแล้ว ${state.completed} ข้อ · ถูก ${state.score}`
      : `ข้อ ${state.completed + 1} · ถูก ${state.score}`;
    $('#modeLabel').textContent = `${modeName(state.mode)} · ระดับ${levelName(state.level)}`;
  }

  function renderQuestion() {
    syncSelectors();
    resetAnswerState();
    updateProgress();
    const q = state.current;
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
    const q = state.current;
    if (!q || state.checked) return;
    if (!hasAnswer(q)) {
      $('#feedback').innerHTML = '<div class="feedback-card warn"><strong>ยังตอบไม่ครบ</strong><span>ตอบคำถามให้ครบก่อน แล้วกดตรวจคำตอบอีกครั้ง</span></div>';
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
    state.completed += 1;
    if (ok) state.score += 1;
    const seen = getSeen();
    seen.add(q.id);
    setSeen(seen);
    lockAndReveal(q, ok);
    renderExplanation(q, ok);
    const action = $('#actionButton');
    action.textContent = 'ข้อต่อไป';
    action.classList.add('next-state');
    updateProgress();
  }

  function renderExplanation(q, ok) {
    const box = $('#feedback');
    if (ok) {
      box.innerHTML = `<div class="feedback-card good"><strong>ถูกต้อง</strong><span>${escapeHtml(q.explanation || 'คำตอบตรงกับ Lecture')}</span></div>`;
      return;
    }
    let detail = '';
    if (state.mode === 'choice') {
      const labels = ['ก','ข','ค','ง'];
      detail = `<p><b>คำตอบที่เลือก:</b> ${labels[state.selected]}. ${escapeHtml(q.options[state.selected])}</p><p><b>คำตอบที่ถูก:</b> ${labels[q.answer]}. ${escapeHtml(q.options[q.answer])}</p>`;
    } else if (state.mode === 'blank') {
      detail = `<p><b>คำตอบที่ส่ง:</b> ${escapeHtml(state.answer)}</p><p><b>คำตอบที่ Lecture รองรับ:</b> ${(q.answers || []).map(escapeHtml).join(' / ')}</p>`;
    } else {
      const wrong = q.pairs.map((p,i) => ({left:p.left, chosen:state.matched[i], right:p.right})).filter(x => x.chosen !== x.right);
      detail = `<ul>${wrong.map(x=>`<li><b>${escapeHtml(x.left)}</b>: เลือก “${escapeHtml(x.chosen)}” แต่ต้องเป็น “${escapeHtml(x.right)}”</li>`).join('')}</ul>`;
    }
    box.innerHTML = `<div class="feedback-card bad"><strong>ยังไม่ถูก — เพราะอะไร</strong>${detail}<p class="reason"><b>เหตุผลจาก Lecture:</b> ${escapeHtml(q.explanation || 'คำตอบที่เลือกไม่ตรงกับข้อมูลใน Lecture')}</p></div>`;
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

  async function next() {
    if (!state.checked) return;
    await showNextUnseen(true);
  }

  function renderExhausted() {
    syncSelectors();
    const total = filteredQuestions().length;
    $('#modeLabel').textContent = `${modeName(state.mode)} · ระดับ${levelName(state.level)}`;
    $('#progress').textContent = `ทำครบ ${total} ข้อที่ไม่ซ้ำในคลังปัจจุบันแล้ว`;
    $('#questionArea').innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><h2>ไม่มีข้อที่ยังไม่เคยทำ</h2><p>ระบบจะไม่วนข้อเก่าซ้ำ เมื่อคลังมีข้อใหม่จาก Lecture ระบบจะนำข้อใหม่มาใช้ต่อได้</p></div>';
    $('#feedback').innerHTML = '';
    const action = $('#actionButton');
    action.textContent = 'รอข้อใหม่';
    action.disabled = true;
  }

  function renderSourcePanel(meta) {
    const panel = $('#sourcePanel');
    if (!panel || !meta?.files?.length) return;
    const date = formatThaiDate(meta.lastUpdated);
    const files = meta.files.map(f => `<li><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.title)}</a></li>`).join('');
    panel.hidden = false;
    panel.innerHTML = `<div class="source-card glass"><div class="source-head"><div><div class="eyebrow">Lecture Sources</div><h2>แหล่งข้อมูลรายวิชา</h2></div><div class="source-date">อัปเดตล่าสุด ${escapeHtml(date)}</div></div><div class="source-meta"><span class="tag">Lecture-only</span><span class="tag">${meta.files.length} ไฟล์</span></div><ol class="source-list">${files}</ol><a class="source-folder" href="${escapeHtml(meta.lectureFolderUrl)}" target="_blank" rel="noopener noreferrer">เปิดโฟลเดอร์ Lecture ใน Google Drive ↗</a></div>`;
  }

  function formatThaiDate(value) {
    if (!value) return '-';
    try {
      return new Intl.DateTimeFormat('th-TH', {day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Bangkok'}).format(new Date(value));
    } catch { return value; }
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  load().catch(e => {
    $('#questionArea').innerHTML = '<div class="empty-state"><h2>โหลดคลังข้อสอบไม่สำเร็จ</h2><p>กรุณาลองรีเฟรชหน้าอีกครั้ง</p></div>';
    $('#actionButton').disabled = true;
    console.error(e);
  });
})();
