(() => {
  const state = {
    course: '', mode: 'match', level: 1, current: null,
    selected: null, answer: '', matched: {}, score: 0, completed: 0,
    checked: false, loadingNext: false, exhausted: false
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
  const norm = s => String(s || '').toLowerCase().trim().replace(/[.,;:()\[\]{}“”"'`]/g, '').replace(/\s+/g, ' ');
  const canonicalPair = (a, b) => [norm(a), norm(b)].sort().join('<=>');

  const contextKey = suffix => `subject-exam:${suffix}:${state.course}:${state.mode}:${state.level}`;
  const courseKey = suffix => `subject-exam:${suffix}:${state.course}`;

  const storageGet = key => {
    try { return localStorage.getItem(key); }
    catch {
      try { return sessionStorage.getItem(key); }
      catch { return null; }
    }
  };
  const storageSet = (key, value) => {
    try { localStorage.setItem(key, value); }
    catch {
      try { sessionStorage.setItem(key, value); }
      catch {}
    }
  };

  const getSet = key => {
    try { return new Set(JSON.parse(storageGet(key) || '[]')); }
    catch { return new Set(); }
  };
  const setSet = (key, set, limit = 12000) => {
    const values = [...set];
    if (values.length > limit) values.splice(0, values.length - limit);
    storageSet(key, JSON.stringify(values));
  };
  const getUsedSemantic = () => getSet(contextKey('semantic-used'));
  const setUsedSemantic = set => setSet(contextKey('semantic-used'), set);
  const getRecentConcepts = () => {
    try { return JSON.parse(storageGet(courseKey('recent-concepts')) || '[]'); }
    catch { return []; }
  };
  const pushRecentConcepts = concepts => {
    const recent = getRecentConcepts();
    concepts.forEach(c => {
      const i = recent.indexOf(c);
      if (i >= 0) recent.splice(i, 1);
      recent.push(c);
    });
    while (recent.length > 72) recent.shift();
    storageSet(courseKey('recent-concepts'), JSON.stringify(recent));
  };
  const nextSerial = () => {
    const key = contextKey('serial');
    const value = Number(storageGet(key) || '0') + 1;
    storageSet(key, String(value));
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
    const sourceCount = sourceMeta?.files?.length || data.sources?.length || 0;
    $('#sourceSummary').textContent = `Lecture ${sourceCount} ไฟล์ · AI-Data Driven · กันข้อซ้ำเชิงความหมายแบบถาวร`;
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
      if (state.exhausted) {
        state.exhausted = false;
        await showNextQuestion(true);
        return;
      }
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
    state.exhausted = false;
    syncSelectors();
    await showNextQuestion(false);
  }

  function nativeQuestions(mode = state.mode) {
    return (window.examData?.questions || []).filter(q => q.level === state.level && q.mode === mode);
  }

  function relationPool() {
    const map = new Map();
    nativeQuestions('match').forEach(q => {
      (q.pairs || []).forEach((p, i) => {
        const conceptKey = canonicalPair(p.left, p.right);
        if (!map.has(conceptKey)) map.set(conceptKey, {
          conceptKey,
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

  function relationForNative(q) {
    if (q.semanticId || q.conceptIds?.length || q.mode === 'match') return null;
    const prompt = norm(q.prompt);
    let correct = '';
    if (q.mode === 'blank') correct = norm((q.answers || [])[0]);
    if (q.mode === 'choice' && Number.isInteger(q.answer)) correct = norm((q.options || [])[q.answer]);
    if (!correct) return null;
    return relationPool().find(r => {
      const left = norm(r.left), right = norm(r.right);
      return (prompt.includes(left) && correct === right) || (prompt.includes(right) && correct === left);
    }) || null;
  }

  function canonicalNativeFingerprint(q) {
    if (q.semanticFingerprint) return `fingerprint:${norm(q.semanticFingerprint)}`;
    const prompt = norm(q.prompt)
      .replace(/^(อ้างอิง lecture แล้วตอบ|พิจารณาข้อมูลจาก lecture แล้วตอบ|เชื่อมโยงข้อมูลจาก lecture แล้วตอบ|วิเคราะห์ตาม lecture แล้วตอบ)\s*/i, '')
      .replace(/[□_]+/g, 'blank');
    if (q.mode === 'blank') {
      const answers = [...new Set((q.answers || []).map(norm).filter(Boolean))].sort().join('|');
      return `blank:${prompt}=>${answers}`;
    }
    if (q.mode === 'choice') {
      const correct = Number.isInteger(q.answer) ? norm((q.options || [])[q.answer]) : '';
      return `choice:${prompt}=>${correct}`;
    }
    return `prompt:${prompt}`;
  }

  function nativeMeta(q) {
    if (q.semanticId) {
      return {
        semantic: `ai:${q.semanticId}`,
        concepts: (q.conceptIds?.length ? q.conceptIds : [q.semanticId]).map(x => `ai:${x}`)
      };
    }
    if (q.mode === 'match') {
      const concepts = (q.pairs || []).map(p => canonicalPair(p.left, p.right));
      return {semantic:`match-set:${[...concepts].sort().join('|')}`, concepts};
    }
    const relation = relationForNative(q);
    if (relation) return {semantic:`relation:${relation.conceptKey}`, concepts:[relation.conceptKey]};
    const fallback = q.semanticKey ? `semantic-key:${norm(q.semanticKey)}` : canonicalNativeFingerprint(q);
    return {semantic:fallback, concepts:(q.conceptIds || [fallback])};
  }

  const lead = serial => [
    'อ้างอิง Lecture แล้วตอบ',
    'พิจารณาข้อมูลจาก Lecture แล้วตอบ',
    'เชื่อมโยงข้อมูลจาก Lecture แล้วตอบ',
    'วิเคราะห์ตาม Lecture แล้วตอบ'
  ][serial % 4];

  function makeNativeVariant(q, serial) {
    const meta = nativeMeta(q);
    if (q.mode === 'choice') {
      const indexed = (q.options || []).map((text, i) => ({text, original:i}));
      const rotated = indexed.slice(serial % Math.max(1, indexed.length)).concat(indexed.slice(0, serial % Math.max(1, indexed.length)));
      if (Math.floor(serial / Math.max(1, indexed.length)) % 2) rotated.reverse();
      const answer = rotated.findIndex(x => x.original === q.answer);
      return {...q, id:`runtime:${q.id}:n${serial}`, prompt:`${lead(serial)}: ${q.prompt}`, options:rotated.map(x=>x.text), answer, _semanticSignature:meta.semantic, _conceptKeys:meta.concepts};
    }
    if (q.mode === 'blank') {
      return {...q, id:`runtime:${q.id}:n${serial}`, prompt:`${lead(serial)}: ${q.prompt}`, _semanticSignature:meta.semantic, _conceptKeys:meta.concepts};
    }
    const pairs = [...(q.pairs || [])];
    const offset = serial % Math.max(1, pairs.length);
    const rotated = pairs.slice(offset).concat(pairs.slice(0, offset));
    return {...q, id:`runtime:${q.id}:n${serial}`, prompt:`${lead(serial)}: ${q.prompt}`, pairs:Math.floor(serial / Math.max(1,pairs.length)) % 2 ? rotated.reverse() : rotated, _semanticSignature:meta.semantic, _conceptKeys:meta.concepts};
  }

  function makeGeneratedBlank(r, reverse, serial) {
    const questionSide = reverse ? r.right : r.left;
    const answerSide = reverse ? r.left : r.right;
    const prompts = {
      1:`${questionSide} ตรงกับ ______ ตาม Lecture`,
      2:`เมื่อเชื่อมโยงข้อมูลใน Lecture: ${questionSide} → ______`,
      3:`ระบุคำตอบที่ทำให้ความสัมพันธ์นี้ถูกต้องตาม Lecture: ${questionSide} → ______`
    };
    return {
      id:`runtime:ai-blank:${serial}`,
      level:state.level, mode:'blank', prompt:`${lead(serial)}: ${prompts[state.level]}`,
      answers:[String(answerSide)], source:r.source,
      explanation:`Lecture ระบุความสัมพันธ์ ${r.left} ↔ ${r.right}${r.explanation ? ` — ${r.explanation}` : ''}`,
      _semanticSignature:`relation:${r.conceptKey}`,
      _conceptKeys:[r.conceptKey]
    };
  }

  function makeGeneratedChoice(r, reverse, serial) {
    const relations = relationPool();
    if (relations.length < 4) return null;
    const questionSide = reverse ? r.right : r.left;
    const correct = reverse ? r.left : r.right;
    const candidates = relations.filter(x => x.conceptKey !== r.conceptKey).map(x => reverse ? x.left : x.right);
    const distinct = [...new Set(candidates.filter(x => norm(x) !== norm(correct)))];
    if (distinct.length < 3) return null;
    const offset = serial % distinct.length;
    const distractors = [];
    for (let i = 0; i < distinct.length && distractors.length < 3; i++) {
      const x = distinct[(offset + i) % distinct.length];
      if (!distractors.some(d => norm(d) === norm(x))) distractors.push(x);
    }
    let options = [correct, ...distractors];
    const shift = serial % 4;
    options = options.slice(shift).concat(options.slice(0, shift));
    if (Math.floor(serial / 4) % 2) options.reverse();
    const answer = options.findIndex(x => norm(x) === norm(correct));
    const prompts = {
      1:`ข้อใดตรงกับ “${questionSide}” ตาม Lecture?`,
      2:`เมื่อเชื่อมโยงข้อมูลใน Lecture ข้อใดสัมพันธ์กับ “${questionSide}” ได้ถูกต้อง?`,
      3:`จากความสัมพันธ์ที่ Lecture ระบุ ข้อใดเป็นคำตอบที่ถูกต้องสำหรับ “${questionSide}”?`
    };
    return {
      id:`runtime:ai-choice:${serial}`,
      level:state.level, mode:'choice', prompt:`${lead(serial)}: ${prompts[state.level]}`,
      options, answer, source:r.source,
      explanation:`Lecture ระบุความสัมพันธ์ ${r.left} ↔ ${r.right}${r.explanation ? ` — ${r.explanation}` : ''}`,
      _semanticSignature:`relation:${r.conceptKey}`,
      _conceptKeys:[r.conceptKey]
    };
  }

  function generatedMatchCandidates(serial) {
    const relations = relationPool();
    if (relations.length < 2) return [];
    const desired = Math.min(relations.length, state.level === 1 ? 3 : state.level === 2 ? 4 : 5);
    const sizes = [...new Set([Math.max(2, desired - 1), desired])];
    const steps = [1,2,3,5,7].filter(s => s < relations.length);
    const out = [];
    const seen = new Set();
    for (const size of sizes) {
      for (const step of steps.length ? steps : [1]) {
        for (let offset = 0; offset < relations.length; offset++) {
          const picked = [];
          const local = new Set();
          for (let i = 0; i < relations.length * 2 && picked.length < size; i++) {
            const r = relations[(offset + i * step) % relations.length];
            if (!local.has(r.conceptKey)) { local.add(r.conceptKey); picked.push(r); }
          }
          if (picked.length < 2) continue;
          const concepts = picked.map(r=>r.conceptKey);
          const semantic = `match-set:${[...concepts].sort().join('|')}`;
          if (seen.has(semantic)) continue;
          seen.add(semantic);
          const source = [...new Set(picked.map(r=>r.source).filter(Boolean))].join(' · ');
          const prompts = {
            1:'จับคู่คำหรือรหัสกับความหมายให้ถูกต้องตาม Lecture',
            2:'จับคู่แนวคิดที่สัมพันธ์กันให้ถูกต้องตาม Lecture',
            3:'จับคู่ความสัมพันธ์หลายเงื่อนไขให้ถูกต้องตาม Lecture'
          };
          out.push({
            id:`runtime:ai-match:${serial}:${out.length}`, level:state.level, mode:'match',
            prompt:`${lead(serial + out.length)}: ${prompts[state.level]}`,
            pairs:picked.map(r=>({left:r.left,right:r.right})), source,
            explanation:`คู่ที่ถูกต้องมาจาก Lecture: ${picked.map(r=>`${r.left} ↔ ${r.right}`).join('; ')}`,
            _semanticSignature:semantic, _conceptKeys:concepts
          });
        }
      }
    }
    return out;
  }

  function buildCandidatePool(serial) {
    const candidates = nativeQuestions().map((q,i) => makeNativeVariant(q, serial + i));
    const relations = relationPool();
    if (state.mode === 'blank') {
      relations.forEach((r,i) => {
        candidates.push(makeGeneratedBlank(r, false, serial + i));
        if (String(r.left).length <= 60 && String(r.right).length <= 60) candidates.push(makeGeneratedBlank(r, true, serial + i + relations.length));
      });
    } else if (state.mode === 'choice') {
      relations.forEach((r,i) => {
        const a = makeGeneratedChoice(r, false, serial + i);
        const b = makeGeneratedChoice(r, true, serial + i + relations.length);
        if (a) candidates.push(a);
        if (b) candidates.push(b);
      });
    } else {
      candidates.push(...generatedMatchCandidates(serial));
    }
    const deduped = new Map();
    candidates.filter(Boolean).forEach(q => {
      if (!deduped.has(q._semanticSignature)) deduped.set(q._semanticSignature, q);
    });
    return shuffle([...deduped.values()]);
  }

  function chooseUniqueCandidate() {
    const used = getUsedSemantic();
    const recent = new Set(getRecentConcepts());
    const serial = nextSerial();
    const pool = buildCandidatePool(serial).filter(q => !used.has(q._semanticSignature));
    if (!pool.length) return null;
    const freshConcept = pool.find(q => !(q._conceptKeys || []).some(c => recent.has(c)));
    return freshConcept || pool[0];
  }

  function rememberDisplayedQuestion(q) {
    if (!q) return;
    const used = getUsedSemantic();
    used.add(q._semanticSignature || q.id);
    setUsedSemantic(used);
    pushRecentConcepts(q._conceptKeys || []);
  }

  async function showNextQuestion(forceRefresh = false) {
    state.loadingNext = true;
    if (forceRefresh) {
      try { await fetchCourseData(); } catch {}
    }
    let q = chooseUniqueCandidate();
    if (!q && !forceRefresh) {
      try { await fetchCourseData(); } catch {}
      q = chooseUniqueCandidate();
    }
    state.loadingNext = false;
    state.current = q;
    if (!q) return renderSemanticExhausted();
    state.exhausted = false;
    rememberDisplayedQuestion(q);
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
    await showNextQuestion(false);
  }

  function renderSemanticExhausted() {
    state.exhausted = true;
    syncSelectors();
    $('#modeLabel').textContent = `${modeName(state.mode)} · ระดับ${levelName(state.level)}`;
    $('#progress').textContent = `ทำแล้ว ${state.completed} ข้อ · ถูก ${state.score}`;
    $('#questionArea').innerHTML = '<div class="empty-state"><h2>ยังไม่มี Blueprint ใหม่ที่ไม่ซ้ำ</h2><p>ระบบจะไม่วนคำถามเดิม แม้รีเฟรชหรือเปิดใหม่ หากยังไม่มีสาระใหม่จาก Lecture ระบบจะหยุดแทนการสร้างข้อซ้ำ</p></div>';
    $('#feedback').innerHTML = '';
    const action = $('#actionButton');
    action.textContent = 'ตรวจข้อมูลใหม่';
    action.disabled = false;
    action.classList.remove('next-state');
  }

  function renderSourcePanel(meta) {
    const panel = $('#sourcePanel');
    if (!panel || !meta?.files?.length) return;
    const date = formatThaiDate(meta.lastUpdated);
    const files = meta.files.map(f => `<li><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.title)}</a><span class="source-file-date">แก้ไขล่าสุด ${escapeHtml(formatThaiDate(f.modified))}</span></li>`).join('');
    panel.hidden = false;
    panel.innerHTML = `<div class="source-card glass"><div class="source-head"><div><div class="eyebrow">Lecture Sources</div><h2>แหล่งข้อมูลรายวิชา</h2></div><div class="source-date">อัปเดตล่าสุด ${escapeHtml(date)}</div></div><div class="source-meta"><span class="tag">Lecture-only</span><span class="tag">AI-Data Driven</span><span class="tag">${meta.files.length} ไฟล์</span></div><ol class="source-list">${files}</ol><a class="source-folder" href="${escapeHtml(meta.lectureFolderUrl)}" target="_blank" rel="noopener noreferrer">เปิดโฟลเดอร์ Lecture ใน Google Drive ↗</a></div>`;
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