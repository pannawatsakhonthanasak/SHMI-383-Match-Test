(() => {
  const state = {
    course: '', mode: 'match', level: 1, current: null,
    selected: null, answer: '', matched: {}, score: 0, completed: 0,
    checked: false, loadingNext: false
  };

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const shuffle = a => [...a].sort(() => Math.random() - .5);
  const sample = (a, n) => shuffle(a).slice(0, Math.min(n, a.length));
  const levelName = n => ({1:'ง่าย',2:'ปานกลาง',3:'ยาก'}[n] || '');
  const modeName = m => m === 'match' ? 'จับคู่' : m === 'blank' ? 'เติมลงในช่องว่าง' : 'ก, ข, ค, ง';
  const difficultyText = n => ({
    1:'พื้นฐานระดับอุดมศึกษา · ความรู้ นิยาม และหลักการที่ Lecture ระบุโดยตรง',
    2:'ระดับอุดมศึกษา · เชื่อมโยง เปรียบเทียบ และประยุกต์แนวคิดจาก Lecture',
    3:'ระดับอุดมศึกษา · วิเคราะห์รายละเอียด หลายเงื่อนไข และการตัดสินใจจาก Lecture'
  }[n] || '');
  const norm = s => (s || '').toLowerCase().trim().replace(/[.,;:()\[\]{}]/g, '').replace(/\s+/g, ' ');

  const contextKey = suffix => `subject-exam:${suffix}:${state.course}:${state.mode}:${state.level}`;
  const getUsed = () => {
    try { return new Set(JSON.parse(sessionStorage.getItem(contextKey('used')) || '[]')); }
    catch { return new Set(); }
  };
  const setUsed = set => {
    const values = [...set];
    if (values.length > 6000) values.splice(0, values.length - 6000);
    sessionStorage.setItem(contextKey('used'), JSON.stringify(values));
  };
  const nextSerial = () => {
    const key = contextKey('serial');
    const value = Number(sessionStorage.getItem(key) || '0') + 1;
    sessionStorage.setItem(key, String(value));
    return value;
  };

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
    $('#sourceSummary').textContent = `Lecture ${sourceCount} ไฟล์ · สร้างข้อแบบต่อเนื่องโดยไม่ผูกจำนวนข้อกับคลังสำเร็จรูป`;
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
    await showNextQuestion();
  }

  function nativeQuestions(mode = state.mode) {
    return (window.examData?.questions || []).filter(q => q.level === state.level && q.mode === mode);
  }

  function relationPool() {
    const map = new Map();
    nativeQuestions('match').forEach(q => {
      (q.pairs || []).forEach((p, i) => {
        const key = `${norm(p.left)}=>${norm(p.right)}`;
        if (!map.has(key)) map.set(key, {
          key,
          left: p.left,
          right: p.right,
          source: q.source || '',
          explanation: q.explanation || '',
          seedId: `${q.id || 'match'}:${i}`
        });
      });
    });
    return [...map.values()];
  }

  const promptLead = serial => {
    const leads = [
      'อ้างอิง Lecture แล้วตอบ',
      'พิจารณาข้อมูลจาก Lecture แล้วตอบ',
      'จากเนื้อหาใน Lecture ให้ตอบ',
      'ทบทวนจาก Lecture แล้วตอบ',
      'ใช้ข้อมูลใน Lecture เพื่อพิจารณา',
      'ประเมินจากหลักการใน Lecture แล้วตอบ',
      'เชื่อมโยงข้อมูลใน Lecture แล้วตอบ',
      'วิเคราะห์ตาม Lecture แล้วตอบ'
    ];
    return `${leads[(serial - 1) % leads.length]} · รอบฝึก ${serial}`;
  };

  function makeNativeVariant(serial) {
    const pool = nativeQuestions();
    if (!pool.length) return null;
    const q = pool[(serial - 1) % pool.length];
    const lead = promptLead(serial);

    if (state.mode === 'choice') {
      const indexed = q.options.map((text, i) => ({text, original:i}));
      const rotated = indexed.slice(serial % indexed.length).concat(indexed.slice(0, serial % indexed.length));
      if (Math.floor(serial / indexed.length) % 2) rotated.reverse();
      const answer = rotated.findIndex(x => x.original === q.answer);
      return {
        ...q,
        id: `runtime:${q.id}:n${serial}`,
        prompt: `${lead}: ${q.prompt}`,
        options: rotated.map(x => x.text),
        answer,
        _signature: `native:${q.id}:choice:${serial}`
      };
    }

    if (state.mode === 'blank') {
      return {
        ...q,
        id: `runtime:${q.id}:n${serial}`,
        prompt: `${lead}: ${q.prompt}`,
        _signature: `native:${q.id}:blank:${serial}`
      };
    }

    const pairs = q.pairs || [];
    const rotated = pairs.slice(serial % Math.max(1, pairs.length)).concat(pairs.slice(0, serial % Math.max(1, pairs.length)));
    return {
      ...q,
      id: `runtime:${q.id}:n${serial}`,
      prompt: `${lead}: ${q.prompt}`,
      pairs: Math.floor(serial / Math.max(1, pairs.length)) % 2 ? [...rotated].reverse() : rotated,
      _signature: `native:${q.id}:match:${serial}`
    };
  }

  function makeMatchGenerated(serial) {
    const relations = relationPool();
    if (relations.length < 2) return makeNativeVariant(serial);
    const desired = state.level === 1 ? 4 : state.level === 2 ? 5 : 6;
    const count = Math.min(Math.max(3, desired), relations.length);
    const offset = (serial - 1) % relations.length;
    const walked = relations.map((_, i) => relations[(offset + i * 3) % relations.length]);
    const unique = [];
    const seen = new Set();
    walked.forEach(r => { if (!seen.has(r.key) && unique.length < count) { seen.add(r.key); unique.push(r); } });
    const pairs = unique.map(r => ({left:r.left, right:r.right}));
    const source = [...new Set(unique.map(r => r.source).filter(Boolean))].join(' · ');
    const explanation = `คู่ที่ถูกต้องทั้งหมดมาจาก Lecture: ${unique.map(r => `${r.left} ↔ ${r.right}`).join('; ')}`;
    const prompts = {
      1:'จับคู่คำหรือรหัสกับความหมายให้ถูกต้องตาม Lecture',
      2:'จับคู่แนวคิดที่สัมพันธ์กันให้ถูกต้องตาม Lecture',
      3:'จับคู่ความสัมพันธ์หลายเงื่อนไขให้ถูกต้องตาม Lecture'
    };
    return {
      id:`runtime:generated-match:${serial}`,
      level:state.level,
      mode:'match',
      prompt:`${promptLead(serial)}: ${prompts[state.level]}`,
      pairs,
      source,
      explanation,
      _signature:`generated:match:${serial}:${unique.map(r => r.key).join('|')}`
    };
  }

  function makeBlankGenerated(serial) {
    const relations = relationPool();
    if (!relations.length) return makeNativeVariant(serial);
    const r = relations[(serial - 1) % relations.length];
    const reverseAllowed = String(r.left).length <= 46 && String(r.right).length <= 46;
    const reverse = reverseAllowed && Math.floor((serial - 1) / Math.max(1, relations.length)) % 2 === 1;
    const questionSide = reverse ? r.right : r.left;
    const answerSide = reverse ? r.left : r.right;
    const prompts = {
      1:`${questionSide} ตรงกับ ______ ตาม Lecture`,
      2:`เมื่อเชื่อมโยงข้อมูลใน Lecture: ${questionSide} → ______`,
      3:`ระบุคำตอบที่ทำให้ความสัมพันธ์นี้ถูกต้องตาม Lecture: ${questionSide} → ______`
    };
    return {
      id:`runtime:generated-blank:${serial}`,
      level:state.level,
      mode:'blank',
      prompt:`${promptLead(serial)}: ${prompts[state.level]}`,
      answers:[String(answerSide)],
      source:r.source,
      explanation:`Lecture ระบุความสัมพันธ์ ${r.left} ↔ ${r.right}${r.explanation ? ` — ${r.explanation}` : ''}`,
      _signature:`generated:blank:${serial}:${r.key}:${reverse ? 'r' : 'f'}`
    };
  }

  function makeChoiceGenerated(serial) {
    const relations = relationPool();
    if (relations.length < 4) return makeNativeVariant(serial);
    const target = relations[(serial - 1) % relations.length];
    const reverse = Math.floor((serial - 1) / relations.length) % 2 === 1;
    const questionSide = reverse ? target.right : target.left;
    const correct = reverse ? target.left : target.right;
    const candidates = relations.filter(r => r.key !== target.key).map(r => reverse ? r.left : r.right);
    const distinct = [...new Set(candidates.filter(x => norm(x) !== norm(correct)))];
    if (distinct.length < 3) return makeNativeVariant(serial);
    const start = (serial * 3) % distinct.length;
    const distractors = [];
    for (let i = 0; i < distinct.length && distractors.length < 3; i++) {
      const x = distinct[(start + i * 2) % distinct.length];
      if (!distractors.some(d => norm(d) === norm(x))) distractors.push(x);
    }
    const raw = [correct, ...distractors];
    const shift = serial % 4;
    let options = raw.slice(shift).concat(raw.slice(0, shift));
    if (Math.floor(serial / 4) % 2) options = options.reverse();
    const answer = options.findIndex(x => norm(x) === norm(correct));
    const prompts = {
      1:`ข้อใดตรงกับ “${questionSide}” ตาม Lecture?`,
      2:`เมื่อเชื่อมโยงข้อมูลใน Lecture ข้อใดสัมพันธ์กับ “${questionSide}” ได้ถูกต้อง?`,
      3:`จากความสัมพันธ์ที่ Lecture ระบุ ข้อใดเป็นคำตอบที่ถูกต้องสำหรับ “${questionSide}”?`
    };
    return {
      id:`runtime:generated-choice:${serial}`,
      level:state.level,
      mode:'choice',
      prompt:`${promptLead(serial)}: ${prompts[state.level]}`,
      options,
      answer,
      source:target.source,
      explanation:`Lecture ระบุความสัมพันธ์ ${target.left} ↔ ${target.right}${target.explanation ? ` — ${target.explanation}` : ''}`,
      _signature:`generated:choice:${serial}:${target.key}:${reverse ? 'r' : 'f'}:${distractors.map(norm).join('|')}`
    };
  }

  function buildContinuousQuestion() {
    const serial = nextSerial();
    const used = getUsed();
    const preferNativeEvery = state.level === 3 ? 2 : state.level === 2 ? 3 : 4;
    let q;
    if (serial % preferNativeEvery === 0) q = makeNativeVariant(serial);
    else if (state.mode === 'match') q = makeMatchGenerated(serial);
    else if (state.mode === 'blank') q = makeBlankGenerated(serial);
    else q = makeChoiceGenerated(serial);
    if (!q) return null;
    if (used.has(q._signature)) {
      q = makeNativeVariant(serial + 1000000) || q;
    }
    return q;
  }

  async function showNextQuestion() {
    state.loadingNext = true;
    let q = buildContinuousQuestion();
    if (!q) {
      try { await fetchCourseData(); } catch {}
      q = buildContinuousQuestion();
    }
    state.loadingNext = false;
    state.current = q;
    if (!q) return renderUnavailable();
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
    const used = getUsed();
    used.add(q._signature || q.id);
    setUsed(used);
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
    await showNextQuestion();
  }

  function renderUnavailable() {
    syncSelectors();
    $('#progress').textContent = 'กำลังรอข้อมูล Lecture';
    $('#questionArea').innerHTML = '<div class="empty-state"><h2>ยังสร้างข้อสอบไม่ได้</h2><p>ไม่พบข้อมูลข้อสอบหรือความสัมพันธ์จาก Lecture สำหรับรูปแบบและระดับนี้</p></div>';
    $('#feedback').innerHTML = '';
    const action = $('#actionButton');
    action.textContent = 'ยังไม่มีข้อมูล';
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
