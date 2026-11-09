import {PROFILE_FIELDS,validateExtractedProfile} from './profile-extraction.js';
// Guided editing shares the existing form as its only source of truth.
// Speech is opt-in and never submits the profile or starts the game.
export function initProfileGuide({ document: doc = document, window: win = window, extractProfile, getAIInfo = () => null } = {}) {
  const byId = (id) => doc.getElementById(id), form = byId("profile-form"), dialog = byId("profile-guide");
  const title = byId("guide-title"), body = byId("guide-body"), status = byId("guide-status");
  if (!["profile-form", "profile-guide", "guide-title", "guide-body", "guide-status", "guide-progress", "guide-back", "guide-next", "guide-open", "guide-scroll", "quick-summary", "budget-summary", "company-name", "company-confirmed", "company-search", "company-research-panel", "profile-section"].every((id) => byId(id))) { const opener = byId("guide-open"); if (opener) opener.hidden = true; return { close() {} }; }
  let bulkRevision = 0, bulkController = null, lastApplied = null;
  let step = "start", active = false, moved = [], recorder = null, voiceTarget = null, generation = 0, bindings = new Map();
  const el = (tag, text, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const level = () => doc.querySelector('[data-profile-level][aria-pressed="true"]')?.dataset.profileLevel ?? "quick";
  const field = (selector) => doc.querySelector(selector);
  const definitions = [
    ["age-band", "年代を教えてください。", "#quick-age-band", "quick"],
    ["age", "いま、何歳ですか？", '[name="age"]', "detail"],
    ["region-quick", "どんな地域で暮らしていますか？", "#quick-region", "quick"],
    ["municipality", "どの街で暮らしていますか？", "#municipality", "detail", true],
    ["region", "暮らしのエリアを選んでください。", "#region", "detail"],
    ["job", "いまの仕事に近いものは？", "#quick-job", "quick"],
    ["occupation", "どんな仕事・活動をしていますか？", "#occupation", "detail"],
    ["company", "勤務先はどちらですか？", "#company-name", "detail", true],
    ["industry", "働く業界はどちらですか？", "#industry", "detail"],
    ["job-detail", "仕事のことを、もう少し教えてください。", '[name="jobDetail"]', "detail", true],
    ["notes", "これまでの経験や、やってみたいことは？", '[name="careerNotes"]', "detail", true],
    ["priority", "いま、大切にしたいことは？", '[name="priority"]', "detail"],
    ["income", "年収も入れておきますか？", '[name="income"]', "advanced"],
    ["household", "いまの暮らしに近いものは？", "#household", "advanced"],
    ["partner", "パートナーとの暮らしについて。", '[name="partner"]', "advanced"],
    ["children", "いま、お子さんは何人いますか？", '[name="children"]', "advanced"],
    ["housing", "いまのお住まいは？", '[name="housing"]', "advanced"],
    ["savings", "金融資産も入れておきますか？", '[name="savings"]', "advanced"],
    ["goal", "どんな道を試してみたいですか？", '[name="careerGoal"]', "all"],
    ["tone", "どんな未来の物語で遊びますか？", '[name="tone"]', "all"],
  ];
  const groups = () => level() === "quick" ? [
    ["start", "いまの自分から、どんな未来へ？", ["age-band", "region-quick", "job", "goal", "tone"], []],
  ] : [
    ["start", "まずは、いまの自分から。", ["age", "municipality", "region", "occupation", "company"], []],
    ["future", "これから、何を大切にしたい？", ["priority", "goal", "tone"], ["industry", "job-detail", "notes"]],
    ...(level() === "advanced" ? [["life", "暮らしのことも、わかる範囲で。", ["household", "partner", "children", "housing"], ["income", "savings"]]] : []),
  ];
  const included = (d) => d[3] === "all" || d[3] === level() || d[3] === "detail" && level() !== "quick";
  const visible = (d) => { const source = field(d[2]); return source && !source.disabled && !source.closest("[hidden]"); };
  const steps = () => groups().filter((g) => definitions.some((d) => [...g[2], ...g[3]].includes(d[0]) && included(d) && visible(d))).map((g) => g[0]);
  function syncFields() {
    for (const [id, binding] of bindings) {
      const d = definitions.find((d) => d[0] === id), shown = visible(d);
      binding.wrapper.hidden = !shown; binding.input.disabled = !shown;
      if (binding.input.value !== binding.source.value) binding.input.value = binding.source.value;
    }
    const extra = body.querySelector("[data-guide-extra]");
    if (extra) {
      const count = [...bindings.values()].filter((b) => extra.contains(b.wrapper) && !b.input.disabled && b.input.value.trim() !== "").length;
      extra.querySelector("summary").textContent = `もう少し詳しく（任意${count ? `・入力済み ${count}項目` : ""}）`;
    }
    const overview = body.querySelector("[data-guide-overview]");
    if (overview) overview.textContent = byId("quick-summary").textContent;
  }
  function stopVoice() {
    generation++;
    const old = recorder; recorder = null; voiceTarget = null;
    try { old?.abort(); } catch {}
    for (const button of dialog.querySelectorAll("[data-voice-button]")) button.textContent = "音声で入力";
    if (old) for (const note of dialog.querySelectorAll("[data-voice-status]")) note.textContent = "聞き取りを止めました。";
  }
  function restore() {
    bulkRevision++; bulkController?.abort(); bulkController=null;
    stopVoice();
    const hadMoved = moved.length > 0;
    for (const [node, marker, state] of moved) {
      if (marker.isConnected) marker.replaceWith(node);
      if (state) { node.open = state.open; for (const [control, disabled] of state.disabled) control.disabled = disabled; }
    }
    moved = []; bindings.clear();
    if (hadMoved) form.dispatchEvent(new win.Event("change", { bubbles: true }));
  }
  function move(node) {
    const marker = doc.createComment("guided-field-home"); node.before(marker);
    const state = node.id === "company-research-panel" ? { open: node.open, disabled: [...node.querySelectorAll("input,select,textarea")].map((control) => [control, control.disabled]) } : null;
    moved.push([node, marker, state]); body.append(node);
  }
  function change(source, value) {
    source.value = value;
    source.dispatchEvent(new win.Event("input", { bubbles: true }));
    source.dispatchEvent(new win.Event("change", { bubbles: true }));
    syncFields();
  }
  function go(delta) {
    if (delta > 0) for (const { input } of bindings.values()) if (!input.disabled && !input.checkValidity()) { const extra = input.closest("details"); if (extra) extra.open = true; input.reportValidity(); return; }
    const list = steps(), index = list.indexOf(step);
    step = list[Math.max(0, Math.min(list.length - 1, index + delta))]; render();
  }
  function voice(input, wrapper) {
    const Rec = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    const box = el("div", "", "guide-voice"), label = el("label", "", "guide-online");
    const online = el("input"); online.type = "checkbox";
    label.append(online, doc.createTextNode("オンライン音声認識を許可する（音声がブラウザ提供者へ送信される場合があります）"));
    const button = el("button", "音声で入力", "button secondary small"); button.type = "button";
    button.dataset.voiceButton = "true";
    let applying = false;
    const note = el("p", input.tagName === "TEXTAREA" ? "押したときだけ聞き取り、今ある文章に追記します。" : "押したときだけ聞き取り、この欄を置き換えます。内容を確認して次へ進めます。", "field-note");
    note.dataset.voiceStatus = "true";
    const settings = el("details"); settings.append(el("summary", "音声入力の説明"), note);
    box.append(button, label, settings); wrapper.append(box);
    if (!Rec) {
      button.disabled = true; label.hidden = true; settings.open = true;
      note.textContent = "このブラウザは音声認識に対応していません。OSやキーボードの音声入力を使えます。"; return;
    }
    button.addEventListener("click", () => {
      if (recorder) { const same = button.textContent === "聞き取りを止める"; stopVoice(); if (same) return; }
      let rec;
      try { rec = new Rec(); } catch { note.textContent = "音声認識を起動できません。キーボードの音声入力も使えます。"; return; }
      const local = "processLocally" in rec;
      if (!local && !online.checked) { note.textContent = "端末内の認識に非対応です。オンライン認識を許可するか、OSの音声入力を使ってください。"; settings.open = true; return; }
      if (local) rec.processLocally = !online.checked;
      const bulk = input.id === "guide-bulk-text";
      rec.lang = "ja-JP"; rec.continuous = bulk; rec.interimResults = false; rec.maxAlternatives = 1;
      const ticket = ++generation; recorder = rec; voiceTarget = input;
      const before = input.value; let nextResult = 0; const spoken = [];
      const current = () => ticket === generation && recorder === rec && active && dialog.open && input.isConnected;
      rec.onresult = (event) => {
        if (!current()) return;
        let transcript;
        if(bulk){
          for(let i=Math.max(nextResult,event.resultIndex??0);i<(event.results?.length??0);i++){
            if(event.results[i].isFinal===false)continue;
            const part=event.results[i]?.[0]?.transcript;if(typeof part==='string')spoken.push(part);
            nextResult=i+1;
          }
          transcript=spoken.join('。');
        }else transcript = event.results?.[0]?.[0]?.transcript;
        if (typeof transcript !== "string") return;
        const value = input.tagName === "TEXTAREA" && before.trim() ? `${before}\n${transcript}` : transcript;
        input.value = value.slice(0, input.maxLength > 0 ? input.maxLength : 1000);
        applying = true;
        try { input.dispatchEvent(new win.Event("input", { bubbles: true })); } finally { applying = false; }
        note.textContent = "聞き取った内容を入力しました。確認・修正してから次へ進んでください。"; settings.open = true;
      };
      rec.onerror = (event) => {
        if (!current()) return;
        settings.open = true;
        note.textContent = event.error === "not-allowed" ? "マイクの利用が許可されていません。文字入力も使えます。"
          : "音声認識を使えませんでした。端末内の日本語認識がない場合は、OSの音声入力か、明示的に許可したオンライン認識を使えます。";
      };
      rec.onend = () => { if (current()) { recorder = null; button.textContent = "音声で入力"; } };
      try { rec.start(); button.textContent = "聞き取りを止める"; note.textContent = "聞き取り中… 自動で次の質問へは進みません。"; }
      catch { recorder = null; note.textContent = "音声認識を開始できませんでした。文字入力を使えます。"; }
    });
    online.addEventListener("change", stopVoice);
    input.addEventListener("input", () => { if (!applying && recorder) { stopVoice(); note.textContent = "手入力に切り替えました。"; } });
  }
  function renderBulk() {
    restore(); body.replaceChildren(); status.textContent='';
    title.textContent='まとめて話す・書く'; byId('guide-next').hidden=true; byId('guide-back').disabled=false;
    const text=el('textarea');text.id='guide-bulk-text';text.maxLength=6000;text.rows=4;text.setAttribute('aria-label','まとめて伝えるプロフィール');text.setAttribute('aria-describedby','guide-speaking-topics');text.placeholder='話した内容がここに入ります。直接書いたり、あとから直したりもできます。';
    const topics=el('section','','guide-speaking-topics');topics.id='guide-speaking-topics';topics.setAttribute('aria-label','話すことの目安');
    topics.append(el('p','この中のひとつからで大丈夫。順番も自由です。会社名・番地・金額は省けます。','field-note'));
    for(const [question,hint] of [
      ['いま、どんな仕事や活動をしていますか？','年代・おおまかな地域・仕事内容など、言える範囲で。'],
      ['どんな暮らしをしていますか？','家族や住まいのこと。話したくないことは省いて大丈夫です。'],
      ['これから、どんなことを試したいですか？','働き方や暮らしの希望、大切にしたいことなど。'],
    ]){const item=el('div','','guide-speaking-topic');item.append(el('b',question),el('small',hint));topics.append(item);}
    const more=el('details');more.append(el('summary','もっと詳しく話したいときの目安（任意）'),el('p','経験や得意なこと、業界、住まいの形、家族についての希望など。年収や金融資産も、入れたい場合だけ金額と単位を伝えられます。会社名・番地・正確な金額は必須ではありません。','field-note'));topics.append(more);
    body.append(topics);voice(text,body);body.append(text);
    let selectedAI=JSON.stringify(getAIInfo());const aiInfo=getAIInfo();body.append(el('p','整理に使うAI：'+(aiInfo?.provider??'未接続')+' / '+(aiInfo?.model??'AIの接続画面で設定してください')+(aiInfo?.baseURL?' / '+aiInfo.baseURL:''),'field-note'));
    const consent=el('input');consent.type='checkbox';consent.id='guide-extraction-consent';
    const label=el('label');label.append(consent,doc.createTextNode('この文章を接続中のAIへ送り、項目へ整理することを許可する（APIの場合は利用枠を消費します）'));body.append(label,el('p','送るのはこの文章だけです。閉じても開始済みのAI処理の利用枠は戻りません。','field-note'));
    const parse=el('button','内容を整理する','button');parse.type='button';body.append(parse);
    const preview=el('div');preview.id='guide-bulk-preview';body.append(preview);
    const back=el('button','項目ごとの入力へ戻る','text-button');back.type='button';back.addEventListener('click',()=>render());body.append(back);
    const invalidate=()=>{bulkRevision++;bulkController?.abort();preview.replaceChildren();status.textContent="内容が変わりました。確認してから整理し直してください。";};text.addEventListener('input',invalidate);consent.addEventListener('change',invalidate);
    parse.addEventListener('click',async()=>{
      stopVoice();preview.replaceChildren();
      if(selectedAI!==JSON.stringify(getAIInfo())){consent.checked=false;status.textContent='AIの接続先が変わりました。項目ごとの入力に戻り、まとめ入力を開き直して確認してください。';return;}
      if(!consent.checked){status.textContent='送信する内容と送信先を確認し、許可を入れてください。';return;}
      const original=text.value,ticket=++bulkRevision;bulkController=new win.AbortController();
      const before=Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([k,v])=>[k,field(v.selector)?.value]));
      parse.disabled=true;status.textContent='内容を整理しています…';
      try{
        const result=validateExtractedProfile((await extractProfile(original,true,bulkController.signal)).profile,original);
        if(ticket!==bulkRevision||!dialog.open||!text.isConnected)return;
        const selected=[];
        for(const [key,item] of Object.entries(result.fields)){
          const spec=PROFILE_FIELDS[key],row=el('label'),check=el('input');check.type='checkbox';check.checked=!before[key];
          const input=el(spec.values?'select':'input');
          if(spec.values)for(const [value,label] of Object.entries(spec.values)){const option=el('option',label);option.value=value;input.append(option);}
          input.value=String(item.value);input.setAttribute('aria-label',spec.label+'の抽出結果');
          row.append(check,el('small','現在：'+(spec.values?.[before[key]]??(before[key]||'空欄'))),el('span',spec.label+'：'+(spec.values?.[item.value]??item.value)),input,el('small','根拠：'+item.evidence));preview.append(row);
          selected.push({key,item,spec,input,check});
        }
        if(!selected.length){status.textContent='項目を確かめられませんでした。もう少し具体的に書くか、項目ごとの入力を使えます。';return;}
        const apply=el('button','確認した項目を反映する','button');apply.type='button';preview.append(apply);
        apply.addEventListener('click',()=>{
          if(ticket!==bulkRevision)return;
          const accepted={fields:{}};
          for(const r of selected)if(r.check.checked){let value=r.input.value;if(r.spec.min!==undefined){if(!value.trim()||!/^\d+(?:\.\d+)?$/.test(value)){status.textContent='数値は空欄や指数表記にせず、数字で入力してください。';return;}value=Number(value);if(['age','children'].includes(r.key)&&!Number.isInteger(value)){status.textContent='年齢と人数は整数で入力してください。';return;}}accepted.fields[r.key]={value,evidence:r.item.evidence};}
          for(const [key,item] of Object.entries(accepted.fields)){const spec=PROFILE_FIELDS[key];if(spec.min!==undefined&&(!Number.isFinite(item.value)||item.value<spec.min||item.value>spec.max)||spec.values&&!Object.hasOwn(spec.values,item.value)||typeof item.value==='string'&&item.value.length>(spec.maxLength??100)){status.textContent='修正した値を確認してください。';return;}}
          let skipped=0;
          const updates=Object.entries(accepted.fields).filter(([key])=>{const source=field(PROFILE_FIELDS[key].selector);if(!source||source.value!==before[key]){skipped++;return false;}return true;});
          lastApplied=updates.map(([key,item])=>({key,before:before[key],after:String(item.value)}));
          doc.querySelector('[data-profile-level="advanced"]').click();
          for(const [key,item]of updates)change(field(PROFILE_FIELDS[key].selector),String(item.value));
          bulkRevision++;step='start';render();status.textContent=skipped?'整理中に変更した項目は保持し、それ以外を反映しました。':'確認した項目を反映しました。会社情報は会社候補を確認してから取得できます。';
        });status.textContent='抽出結果を確認・修正し、反映したい項目だけ選んでください。まだ入力欄は変更していません。';
      }catch(error){if(ticket===bulkRevision)status.textContent=error.message;}finally{if(text.isConnected)parse.disabled=false;}
    });title.focus({preventScroll:true});byId('guide-scroll').scrollTop=0;
  }
  function render() {
    restore(); body.replaceChildren(); status.textContent = "";
    const list = steps(); if (!list.length) { dialog.close(); return; }
    if (!list.includes(step)) step = list[0];
    const index = list.indexOf(step), last = index === list.length - 1;
    byId("guide-progress").textContent = `${index + 1} / ${list.length}`;
    byId("guide-back").disabled = index === 0;
    byId("guide-next").hidden = false;
    byId("guide-next").textContent = last ? "この設定で物語を始める" : "次へ →";
    if(lastApplied){const undo=el('button','直前のまとめ入力を元に戻す','text-button');undo.type='button';undo.id='guide-bulk-undo';undo.addEventListener('click',()=>{for(const r of lastApplied){const source=field(PROFILE_FIELDS[r.key].selector);if(source.value===r.after)change(source,r.before);}lastApplied=null;render();status.textContent='反映を元に戻しました。会社情報は改めて確認してください。';});body.append(undo);}
    const bulk=el("button","まとめて話す・書く","button secondary small");bulk.type="button";bulk.id="guide-bulk-open";bulk.addEventListener("click",renderBulk);body.append(bulk);
    const modeLabel = el("label", "入力の詳しさ", "guide-mode");
    const mode = el("select"); mode.id = "guide-mode"; modeLabel.htmlFor = mode.id;
    for (const [value, label] of [["quick", "簡単"], ["standard", "詳しく"], ["advanced", "家族・家計まで"]]) {
      const option = el("option", label); option.value = value; mode.append(option);
    }
    mode.value = level(); modeLabel.append(mode); body.append(modeLabel);
    mode.addEventListener("change", () => { stopVoice(); doc.querySelector(`[data-profile-level="${mode.value}"]`).click(); step = "start"; render(); });
    const group = groups().find((g) => g[0] === step);
    title.textContent = group[1];
    body.append(el("p", "空欄でも進めます。あとから戻って変更できます。", "field-note"));
      const grid = el("div", "", "guide-fields"); body.append(grid);
      const extra = el("details"); extra.dataset.guideExtra = "true";
      extra.append(el("summary", "もう少し詳しく（任意）"));
      const extraGrid = el("div", "", "guide-fields"); extra.append(extraGrid);
      for (const definition of definitions.filter((d) => [...group[2], ...group[3]].includes(d[0]) && included(d))) {
        const source = field(definition[2]); if (!source) continue;
        const wrapper = el("div", "", "guide-field"); wrapper.dataset.guideField = definition[0];
        if (["company", "notes", "job-detail"].includes(definition[0])) wrapper.classList.add("guide-field-wide");
        const label = el("label", definition[1], "field-label");
        const input = source.cloneNode(true);
        for (const attr of ["id", "name", "form", "aria-describedby"]) input.removeAttribute(attr);
        input.id = `guide-input-${definition[0]}`; input.value = source.value; label.htmlFor = input.id;
        wrapper.append(label, input); (group[3].includes(definition[0]) ? extraGrid : grid).append(wrapper);
        bindings.set(definition[0], { source, input, wrapper });
        input.addEventListener("input", () => change(source, input.value));
        input.addEventListener("change", () => change(source, input.value));
        if (definition[4]) voice(input, wrapper);
        if (definition[0] === "company" && visible(definition)) {
          move(byId("company-search")); move(byId("company-research-panel"));
          wrapper.append(byId("company-search"), byId("company-research-panel"));
          for (const control of byId("company-research-panel").querySelectorAll("input,select,textarea")) control.disabled = false;
        }
      }
      if (extraGrid.childElementCount) body.append(extra);
      if (last) {
        const edit = el("button", "一覧で細かく調整する", "text-button"); edit.type = "button";
        edit.addEventListener("click", () => { restore(); dialog.close(); byId("profile-section").scrollIntoView({ block: "start" }); }); body.append(edit);
        const overview = el("p", "", "guide-overview"); overview.dataset.guideOverview = "true"; body.append(overview);
        const budget = el("details"); budget.append(el("summary", "未入力に使うゲーム用の仮値を確認"), el("p", byId("budget-summary").textContent, "field-note")); body.append(budget);
        body.append(el("p", "未入力の値はゲーム用の仮定です。個人の将来予測ではありません。", "field-note"));
      }
      syncFields();
    title.focus({ preventScroll: true }); byId("guide-scroll").scrollTop = 0; fitViewport();
  }
  function fitViewport() {
    const viewport = win.visualViewport;
    if (!dialog.open || !viewport) return;
    dialog.style.top = `${viewport.offsetTop + 8}px`;
    dialog.style.maxHeight = `${Math.max(180, Math.min(viewport.height - 16, 860))}px`;
  }
  win.visualViewport?.addEventListener("resize", fitViewport);
  win.visualViewport?.addEventListener("scroll", fitViewport);
  byId("guide-open").addEventListener("click", () => { active = true; step = "start"; dialog.showModal(); render(); });
  byId("guide-back").addEventListener("click", () => {if(body.querySelector("#guide-bulk-text"))render();else go(-1);});
  byId("guide-next").addEventListener("click", () => {
    if (step !== steps().at(-1)) { go(1); return; }
    if (!form.checkValidity()) {
      const invalid = definitions.find((d) => included(d) && visible(d) && field(d[2]) && !field(d[2]).disabled && !field(d[2]).checkValidity());
      if (invalid) { step = groups().find((g) => [...g[2], ...g[3]].includes(invalid[0]))[0]; render(); const input = bindings.get(invalid[0])?.input; if (input?.closest("details")) input.closest("details").open = true; status.textContent = "入力できる範囲を確認してください。"; return; }
      status.textContent = "一覧で細かく調整するボタンから、入力内容を確認してください。"; return;
    }
    restore(); active = false; dialog.close(); form.requestSubmit();
  });
  dialog.addEventListener("close", () => { try { restore(); if(body.querySelector("#guide-bulk-text"))body.replaceChildren(); } finally { active = false; if (!doc.querySelector("dialog[open]")) byId("guide-open").focus(); } });
  dialog.addEventListener("cancel", restore);
  dialog.addEventListener("focusin", (event) => { if (recorder && event.target !== voiceTarget && event.target.matches("input,textarea,select")) stopVoice(); });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) stopVoice(); });
  win.addEventListener("pagehide", restore);
  win.addEventListener("pageshow", (event) => { if (event.persisted && dialog.open) render(); });
  doc.addEventListener("company-lookup-complete", () => { if (active) syncFields(); });
  return { close: () => dialog.close() };
}
