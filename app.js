/* ══════════════════════════════════════════════════════
   SISTEMA DE VOTACIÓN — MULTIFAMILIARES LA POSADA
   app.js  |  Datos en Firebase, PINs fijos en data.js
   ══════════════════════════════════════════════════════ */

const ADMIN_CODE = "9706";

/* ── Estado global ── */
let state = {
  view:            "home",
  adminTab:        "dashboard",
  codesFilter:     "",
  votingStep:      "enter",   // enter | confirm | vote | success
  currentApt:      null,
  pendingQuestions:[],
  currentQIdx:     0,
  editingQuestion: null,
  // caché
  _questions: [],
  _votes:     [],
  _used:      {},
};

/* ══════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════ */
function escapeAttr(s){
  return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;")
                  .replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escapeHtml(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function formatDate(iso){
  if(!iso) return "—";
  try{
    const d=new Date(iso);
    return d.toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"})+" "+
           d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  }catch{ return iso; }
}
function showLoading(msg="Cargando..."){
  document.getElementById("app").innerHTML=`
    <div class="center-screen">
      <div style="text-align:center">
        <div class="spinner"></div>
        <p style="margin-top:16px;color:var(--gray-500);font-size:1rem">${msg}</p>
      </div>
    </div>`;
}
function downloadCSV(csv, filename){
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════
   CARGA DE DATOS
   ══════════════════════════════════════════════════════ */
async function loadData(){
  const [questions, votes, used] = await Promise.all([
    window._fb.getQuestions(),
    window._fb.getVotes(),
    window._fb.getUsed(),
  ]);
  state._questions = questions;
  state._votes     = votes;
  state._used      = used;
}

/* ══════════════════════════════════════════════════════
   RENDER PRINCIPAL
   ══════════════════════════════════════════════════════ */
async function render(){
  const app=document.getElementById("app");
  if(state.view==="home"){ app.innerHTML=renderHome(); return; }
  if(state.view==="vote"){ app.innerHTML=renderVoteScreen(); bindVote(); return; }
  if(state.view==="admin"){
    showLoading("Cargando panel...");
    await loadData();
    app.innerHTML=renderAdmin();
    bindAdmin();
  }
}

/* ══════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════ */
function renderHome(){
  return `
  <div class="center-screen">
    <div class="login-card">
      <div class="logo">
        <span class="emoji">🏢</span>
        <h2>Multifamiliares La Posada</h2>
        <p>Sistema de Votación Digital</p>
      </div>
      <button class="btn btn-primary btn-lg w-full mb-4" onclick="goVote()">🗳️ Ingresar a Votar</button>
      <button class="btn btn-outline btn-lg w-full" onclick="goAdminLogin()">🔐 Panel de Administrador</button>
    </div>
  </div>`;
}
function goVote(){
  state.view="vote"; state.votingStep="enter";
  state.currentApt=null; state.pendingQuestions=[]; state.currentQIdx=0;
  render();
}
function goAdminLogin(){
  const pin=prompt("Ingrese el código de administrador:");
  if(pin===null) return;
  if(pin===ADMIN_CODE){ state.view="admin"; state.adminTab="dashboard"; render(); }
  else alert("❌ Código incorrecto.");
}

/* ══════════════════════════════════════════════════════
   ADMIN
   ══════════════════════════════════════════════════════ */
function renderAdmin(){
  return `
  <div>
    ${renderHeader()}
    <div class="container">
      <div class="tabs">
        ${["dashboard","codes","questions","results"].map(t=>`
          <div class="tab ${state.adminTab===t?"active":""}" onclick="switchTab('${t}')">
            ${{dashboard:"📊 Dashboard",codes:"🔑 Códigos",questions:"❓ Preguntas",results:"📈 Resultados"}[t]}
          </div>`).join("")}
      </div>
      ${state.adminTab==="dashboard" ? renderDashboard()
      : state.adminTab==="codes"     ? renderCodesTab()
      : state.adminTab==="questions" ? renderQuestionsTab()
      : renderResultsTab()}
    </div>
  </div>`;
}
function renderHeader(){
  return `
  <div class="header">
    <div>
      <h1>🏢 Multifamiliares La Posada</h1>
      <div class="subtitle">Panel de Administrador</div>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost btn-sm" onclick="reloadTab()">🔄 Actualizar</button>
      <button class="btn btn-ghost btn-sm" onclick="state.view='home';render()">⬅ Salir</button>
    </div>
  </div>`;
}
async function switchTab(t){
  state.adminTab=t; state.codesFilter=""; state.editingQuestion=null;
  showLoading("Cargando...");
  await loadData();
  document.getElementById("app").innerHTML=renderAdmin();
  bindAdmin();
}
async function reloadTab(){
  showLoading("Actualizando...");
  await loadData();
  document.getElementById("app").innerHTML=renderAdmin();
  bindAdmin();
}

/* ── Dashboard ── */
function renderDashboard(){
  const used      = state._used;
  const questions = state._questions;
  const votes     = state._votes;
  const total     = APARTMENTS_DATA.length;
  const voted     = Object.keys(used).length;
  const pending   = total-voted;
  const pct       = total?((voted/total)*100).toFixed(1):0;
  const totalCoeff= APARTMENTS_DATA.reduce((s,a)=>s+a.coefficient,0);
  const votedCoeff= APARTMENTS_DATA.filter(a=>used[a.code]).reduce((s,a)=>s+a.coefficient,0);
  const pctCoeff  = totalCoeff?((votedCoeff/totalCoeff)*100).toFixed(2):0;

  return `
  <div class="grid-stats">
    <div class="stat-card">
      <div class="flex justify-between items-center">
        <div><div class="value">${total}</div><div class="label">Total Apartamentos</div></div>
        <div class="icon">🏠</div>
      </div>
    </div>
    <div class="stat-card green">
      <div class="flex justify-between items-center">
        <div><div class="value">${voted}</div><div class="label">Han Votado</div></div>
        <div class="icon">✅</div>
      </div>
    </div>
    <div class="stat-card orange">
      <div class="flex justify-between items-center">
        <div><div class="value">${pending}</div><div class="label">Pendientes</div></div>
        <div class="icon">⏳</div>
      </div>
    </div>
    <div class="stat-card red">
      <div class="flex justify-between items-center">
        <div><div class="value">${pct}%</div><div class="label">Participación</div></div>
        <div class="icon">📊</div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card mb-4">
      <div class="card-header"><h2>📊 Progreso de Participación</h2></div>
      <div class="card-body">
        <div class="mb-4">
          <div class="flex justify-between mb-4">
            <span class="font-bold">Por apartamentos</span>
            <span class="font-bold text-sm">${voted} / ${total}</span>
          </div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="progress-label">${pct}% de participación</div>
        </div>
        <hr class="divider"/>
        <div>
          <div class="flex justify-between mb-4">
            <span class="font-bold">Por coeficiente</span>
            <span class="font-bold text-sm">${votedCoeff.toFixed(2)} / ${totalCoeff.toFixed(2)}</span>
          </div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pctCoeff}%"></div></div>
          <div class="progress-label">${pctCoeff}% del coeficiente total</div>
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h2>❓ Estado de Preguntas</h2></div>
      <div class="card-body">
        ${questions.length===0
          ?`<div class="text-center text-gray" style="padding:20px">No hay preguntas.<br/><br/>
            <button class="btn btn-primary btn-sm" onclick="switchTab('questions')">+ Crear pregunta</button></div>`
          :questions.map(q=>{
            const qv=votes.filter(v=>v.qId===q.id);
            const uniq=[...new Set(qv.map(v=>v.aptCode))].length;
            return `
            <div style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
              <div class="flex justify-between items-center">
                <span class="font-bold text-sm" style="max-width:65%">${escapeHtml(q.text)}</span>
                ${q.closed?`<span class="badge badge-danger">🔒 Cerrada</span>`
                          :`<span class="badge badge-success">🟢 Abierta</span>`}
              </div>
              <div class="text-xs text-gray" style="margin-top:4px">${uniq} votos registrados</div>
            </div>`;
          }).join("")}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h2>🕐 Últimas Participaciones</h2></div>
    <div class="card-body" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Apartamento</th><th>Propietario</th><th>Votó el</th></tr></thead>
          <tbody>
            ${APARTMENTS_DATA.filter(a=>used[a.code])
              .sort((a,b)=>new Date(used[b.code].usedAt)-new Date(used[a.code].usedAt))
              .slice(0,15)
              .map(a=>`<tr>
                <td><span class="code-cell">${a.code}</span></td>
                <td class="text-sm">${a.owner}</td>
                <td class="text-sm text-gray">${formatDate(used[a.code].usedAt)}</td>
              </tr>`).join("")
              ||`<tr><td colspan="3" class="text-center text-gray" style="padding:20px">Ningún apartamento ha votado aún.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ── Códigos ── */
function renderCodesTab(){
  const used     = state._used;
  const filtered = getFilteredApartments();
  return `
  <div class="card mb-4">
    <div class="card-header">
      <h2>🔑 Códigos PIN por Apartamento</h2>
      <div class="flex gap-2" style="flex-wrap:wrap">
        <button class="btn btn-success btn-sm" onclick="exportCodes()">📥 Exportar CSV</button>
        <button class="btn btn-danger btn-sm"  onclick="confirmResetVote()">↩ Resetear un voto</button>
      </div>
    </div>
    <div class="card-body">
      <div class="alert alert-info" style="margin-bottom:16px">
        ℹ️ Los códigos PIN son fijos y están asignados a cada apartamento. Entrégueselos directamente a cada propietario.
      </div>
      <div class="search-wrap mb-4">
        <span class="search-icon">🔍</span>
        <input class="form-control" style="padding-left:36px" type="text" id="codeSearch"
          placeholder="Buscar por apartamento, propietario o PIN..."
          value="${escapeAttr(state.codesFilter)}"
          oninput="onSearchInput(this.value)"/>
      </div>
      <div id="codesTableWrap">${renderCodesTable(filtered,used)}</div>
      <div id="codesCount" class="text-sm text-gray" style="margin-top:12px">
        Mostrando ${filtered.length} de ${APARTMENTS_DATA.length} apartamentos
      </div>
    </div>
  </div>`;
}

function renderCodesTable(filtered, used){
  return `
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Apartamento</th><th>Propietario</th><th>Coeficiente</th>
          <th>PIN</th><th>Estado</th><th>Votó el</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(a=>{
          const u=used[a.code];
          return `<tr>
            <td><span class="code-cell">${a.code}</span></td>
            <td class="text-sm">${a.owner}</td>
            <td><span class="tag">${a.coefficient}%</span></td>
            <td><span class="code-cell" style="font-size:1.1rem;color:var(--primary)">${a.pin}</span></td>
            <td>${u?`<span class="badge badge-success">✅ Votó</span>`
                   :`<span class="badge badge-warning">⏳ Pendiente</span>`}</td>
            <td class="text-xs text-gray">${u?formatDate(u.usedAt):"—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;
}

function onSearchInput(value){
  state.codesFilter=value;
  const filtered=getFilteredApartments();
  const used=state._used;
  const tw=document.getElementById("codesTableWrap");
  const co=document.getElementById("codesCount");
  if(tw) tw.innerHTML=renderCodesTable(filtered,used);
  if(co) co.textContent=`Mostrando ${filtered.length} de ${APARTMENTS_DATA.length} apartamentos`;
}

function getFilteredApartments(){
  const f=state.codesFilter.toLowerCase().trim();
  if(!f) return APARTMENTS_DATA;
  return APARTMENTS_DATA.filter(a=>
    a.code.toLowerCase().includes(f)||
    a.owner.toLowerCase().includes(f)||
    a.pin.includes(f)
  );
}

async function confirmResetVote(){
  const aptCode=prompt("Ingrese el código del apartamento a resetear (ej: 01-101):");
  if(!aptCode) return;
  const apt=APARTMENTS_DATA.find(a=>a.code===aptCode.trim().toUpperCase()||a.code===aptCode.trim());
  if(!apt){ alert("Apartamento no encontrado."); return; }
  if(!confirm(`¿Resetear el voto de ${apt.code} — ${apt.owner}?\nEsto eliminará sus votos y podrá volver a votar.`)) return;
  showLoading("Reseteando...");
  try{
    // Borrar de 'used'
    const {deleteDoc,doc,getFirestore,getDocs,collection}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    // Usamos la API expuesta
    await fetch(""); // dummy — usamos _fb directamente
  }catch(e){}
  // Usamos XMLHttpRequest como workaround — mejor pasar por _fb
  await resetVoteForApt(aptCode.trim());
  await reloadTab();
}

// Función interna para resetear (expuesta desde index.html vía _fb)
async function resetVoteForApt(aptCode){
  // Borrar registro de 'used'
  const votes=await window._fb.getVotes();
  const votesDeApt=votes.filter(v=>v.aptCode===aptCode);
  // Los borramos todos
  for(const v of votesDeApt){
    await window._fb.deleteVote(v.id);
  }
  await window._fb.deleteUsed(aptCode);
}

/* ── Preguntas ── */
function renderQuestionsTab(){
  const questions=state._questions;
  return `
  <div class="grid-2">
    <div class="card">
      <div class="card-header"><h2>${state.editingQuestion?"✏️ Editar Pregunta":"➕ Nueva Pregunta"}</h2></div>
      <div class="card-body"><div id="questionForm">${renderQuestionForm()}</div></div>
    </div>
    <div class="card">
      <div class="card-header"><h2>❓ Preguntas (${questions.length})</h2></div>
      <div class="card-body" style="padding:0">
        ${questions.length===0
          ?`<div class="text-center text-gray" style="padding:40px">No hay preguntas aún.</div>`
          :questions.map((q,i)=>renderQuestionItem(q,i)).join("")}
      </div>
    </div>
  </div>`;
}

function renderQuestionForm(){
  const eq=state.editingQuestion;
  return buildFormHTML(eq?eq.options:["Sí","No"], eq, eq?eq.text:"");
}

function buildFormHTML(options, eq, textVal=""){
  return `
  <div class="form-group">
    <label>Texto de la pregunta</label>
    <textarea class="form-control" id="qText" rows="3"
      placeholder="Ej: ¿Está de acuerdo con el presupuesto?">${escapeHtml(textVal)}</textarea>
  </div>
  <div class="form-group">
    <label>Opciones de respuesta</label>
    <div id="optionsWrap">
      ${options.map((o,i)=>`
        <div class="flex gap-2" style="margin-bottom:8px">
          <input class="form-control" id="opt_${i}" value="${escapeAttr(o)}" placeholder="Opción ${i+1}"/>
          <button class="btn btn-danger btn-sm" onclick="removeOption(${i})" ${options.length<=2?"disabled":""}>✕</button>
        </div>`).join("")}
    </div>
    <button class="btn btn-outline btn-sm" onclick="addOption()" style="margin-top:8px">+ Agregar opción</button>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-primary w-full" onclick="${eq?"saveEditQuestion()":"saveNewQuestion()"}">
      ${eq?"💾 Guardar Cambios":"✅ Crear Pregunta"}
    </button>
    ${eq?`<button class="btn btn-outline" onclick="cancelEdit()">Cancelar</button>`:""}
  </div>`;
}

function renderQuestionItem(q,i){
  const votes=state._votes.filter(v=>v.qId===q.id);
  const uniq=[...new Set(votes.map(v=>v.aptCode))].length;
  return `
  <div style="padding:16px;border-bottom:1px solid var(--gray-200)">
    <div class="flex gap-2 items-center" style="flex-wrap:wrap;margin-bottom:8px">
      <span class="tag">#${i+1}</span>
      ${q.closed?`<span class="badge badge-danger">🔒 Cerrada</span>`
                :`<span class="badge badge-success">🟢 Abierta</span>`}
      <span class="text-xs text-gray">${uniq} votos</span>
    </div>
    <p class="font-bold text-sm" style="margin-bottom:8px">${escapeHtml(q.text)}</p>
    <div style="margin-bottom:10px">
      ${q.options.map(o=>`<span class="tag" style="margin-right:4px">${escapeHtml(o)}</span>`).join("")}
    </div>
    <div class="flex gap-2" style="flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="editQuestion('${q.id}')">✏️ Editar</button>
      ${q.closed
        ?`<button class="btn btn-success btn-sm" onclick="doToggleQuestion('${q.id}',false)">🔓 Abrir</button>`
        :`<button class="btn btn-warning btn-sm" onclick="doToggleQuestion('${q.id}',true)">🔒 Cerrar</button>`}
      <button class="btn btn-danger btn-sm" onclick="doDeleteQuestion('${q.id}')">🗑️ Eliminar</button>
    </div>
  </div>`;
}

function getOptionValues(){
  const opts=[]; let i=0;
  while(document.getElementById(`opt_${i}`)){
    const v=document.getElementById(`opt_${i}`).value.trim();
    if(v) opts.push(v);
    i++;
  }
  return opts;
}

window.addOption=function(){
  const opts=getOptionValues(); opts.push("");
  if(state.editingQuestion) state.editingQuestion.options=opts;
  const t=document.getElementById("qText")?.value||"";
  document.getElementById("questionForm").innerHTML=buildFormHTML(opts,state.editingQuestion,t);
  document.getElementById(`opt_${opts.length-1}`)?.focus();
};
window.removeOption=function(idx){
  const opts=getOptionValues(); opts.splice(idx,1);
  if(state.editingQuestion) state.editingQuestion.options=opts;
  const t=document.getElementById("qText")?.value||"";
  document.getElementById("questionForm").innerHTML=buildFormHTML(opts,state.editingQuestion,t);
};

async function saveNewQuestion(){
  const text=document.getElementById("qText")?.value.trim();
  const opts=getOptionValues();
  if(!text){alert("Ingrese el texto de la pregunta.");return;}
  if(opts.length<2){alert("Mínimo 2 opciones.");return;}
  showLoading("Guardando...");
  await window._fb.addQuestion(text,opts);
  await reloadTab();
}
async function saveEditQuestion(){
  const text=document.getElementById("qText")?.value.trim();
  const opts=getOptionValues();
  if(!text){alert("Ingrese el texto.");return;}
  if(opts.length<2){alert("Mínimo 2 opciones.");return;}
  showLoading("Guardando...");
  await window._fb.updateQuestion(state.editingQuestion.id,text,opts);
  state.editingQuestion=null;
  await reloadTab();
}
function editQuestion(id){
  const q=state._questions.find(q=>q.id===id);
  state.editingQuestion=q?{...q,options:[...q.options]}:null;
  document.getElementById("questionForm").innerHTML=renderQuestionForm();
}
function cancelEdit(){
  state.editingQuestion=null;
  document.getElementById("questionForm").innerHTML=renderQuestionForm();
}
async function doToggleQuestion(id,closed){
  showLoading("Guardando...");
  await window._fb.toggleQuestion(id,closed);
  await reloadTab();
}
async function doDeleteQuestion(id){
  if(!confirm("¿Eliminar esta pregunta y todos sus votos?")) return;
  showLoading("Eliminando...");
  await window._fb.deleteQuestion(id);
  await reloadTab();
}

/* ── Resultados ── */
function renderResultsTab(){
  const questions =state._questions;
  const votes     =state._votes;
  const totalCoeff=APARTMENTS_DATA.reduce((s,a)=>s+a.coefficient,0);

  return `
  <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
    <button class="btn btn-success btn-sm" onclick="exportVotes()">📥 Exportar Votos CSV</button>
    <button class="btn btn-primary btn-sm" onclick="exportResults()">📊 Exportar Resultados CSV</button>
  </div>
  ${questions.length===0
    ?`<div class="card"><div class="card-body text-center text-gray" style="padding:40px">No hay preguntas configuradas.</div></div>`
    :questions.map(q=>{
      const qv=votes.filter(v=>v.qId===q.id);
      const uniqApts=[...new Set(qv.map(v=>v.aptCode))];
      const totalVoted=uniqApts.length;
      const totalCoeffV=uniqApts.reduce((s,c)=>{
        const apt=APARTMENTS_DATA.find(a=>a.code===c);
        return s+(apt?apt.coefficient:0);
      },0);
      return `
      <div class="card mb-4">
        <div class="card-header">
          <div>
            <h2>${escapeHtml(q.text)}</h2>
            <div class="text-xs text-gray" style="margin-top:4px">
              ${totalVoted} votos — coeficiente acumulado: ${totalCoeffV.toFixed(2)}
            </div>
          </div>
          ${q.closed?`<span class="badge badge-danger">🔒 Cerrada</span>`
                    :`<span class="badge badge-success">🟢 Abierta</span>`}
        </div>
        <div class="card-body">
          ${q.options.map((opt,oi)=>{
            const ov=qv.filter(v=>v.option===opt);
            const oc=ov.reduce((s,v)=>s+v.coeff,0);
            const pctApt  =totalVoted  ?((ov.length/totalVoted)*100).toFixed(1):0;
            const pctCoeff=totalCoeff  ?((oc/totalCoeff)*100).toFixed(2):0;
            return `
            <div class="result-item">
              <div class="option-label">
                <span class="font-bold">${escapeHtml(opt)}</span>
                <span class="text-sm text-gray">${ov.length} votos (${pctApt}%) · coeff ${oc.toFixed(2)} (${pctCoeff}%)</span>
              </div>
              <div class="result-bar-wrap">
                <div class="result-bar bar-${oi}" style="width:${pctApt}%">
                  ${pctApt>6?pctApt+"%":""}
                </div>
              </div>
            </div>`;
          }).join("")}
          <hr class="divider"/>
          <div class="text-sm text-gray">
            Participación en esta pregunta: ${totalVoted}/${APARTMENTS_DATA.length} aptos
            — ${totalCoeff?((totalCoeffV/totalCoeff)*100).toFixed(2):0}% del coeficiente total
          </div>

          <!-- Detalle de votos -->
          <details style="margin-top:16px">
            <summary class="btn btn-outline btn-sm" style="cursor:pointer;display:inline-flex">
              🔍 Ver detalle de votos
            </summary>
            <div class="table-wrap" style="margin-top:12px">
              <table>
                <thead><tr><th>Apartamento</th><th>Propietario</th><th>Respuesta</th><th>Coeficiente</th><th>Fecha y hora</th></tr></thead>
                <tbody>
                  ${qv.length===0
                    ?`<tr><td colspan="5" class="text-center text-gray" style="padding:16px">Sin votos aún.</td></tr>`
                    :qv.sort((a,b)=>new Date(b.votedAt)-new Date(a.votedAt)).map(v=>{
                      const apt=APARTMENTS_DATA.find(a=>a.code===v.aptCode);
                      return `<tr>
                        <td><span class="code-cell">${v.aptCode}</span></td>
                        <td class="text-sm">${apt?apt.owner:"—"}</td>
                        <td><span class="badge badge-primary">${escapeHtml(v.option)}</span></td>
                        <td><span class="tag">${v.coeff}</span></td>
                        <td class="text-xs text-gray">${formatDate(v.votedAt)}</td>
                      </tr>`;
                    }).join("")}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>`;
    }).join("")}`;
}

/* ── Exports ── */
function exportCodes(){
  let csv="Apartamento,Propietario,Coeficiente,PIN,Estado,Votó el\n";
  const used=state._used;
  APARTMENTS_DATA.forEach(a=>{
    const u=used[a.code];
    csv+=`"${a.code}","${a.owner}","${a.coefficient}","${a.pin}","${u?"Votó":"Pendiente"}","${u?u.usedAt:""}"\n`;
  });
  downloadCSV(csv,"codigos_votacion.csv");
}
function exportVotes(){
  const votes=state._votes;
  let csv="Apartamento,Propietario,Coeficiente,Pregunta,Respuesta,Fecha y Hora\n";
  votes.forEach(v=>{
    const apt=APARTMENTS_DATA.find(a=>a.code===v.aptCode);
    const q  =state._questions.find(q=>q.id===v.qId);
    csv+=`"${v.aptCode}","${apt?.owner||""}","${v.coeff}","${q?.text||v.qId}","${v.option}","${v.votedAt}"\n`;
  });
  downloadCSV(csv,"votos_exportados.csv");
}
function exportResults(){
  const totalCoeff=APARTMENTS_DATA.reduce((s,a)=>s+a.coefficient,0);
  let csv="Pregunta,Opción,Votos,% Votos,Coeficiente,% Coeficiente\n";
  state._questions.forEach(q=>{
    const qv=state._votes.filter(v=>v.qId===q.id);
    const total=[...new Set(qv.map(v=>v.aptCode))].length;
    q.options.forEach(opt=>{
      const ov=qv.filter(v=>v.option===opt);
      const oc=ov.reduce((s,v)=>s+v.coeff,0);
      csv+=`"${q.text}","${opt}","${ov.length}","${total?((ov.length/total)*100).toFixed(1):0}%","${oc.toFixed(2)}","${totalCoeff?((oc/totalCoeff)*100).toFixed(2):0}%"\n`;
    });
  });
  downloadCSV(csv,"resultados_votacion.csv");
}

/* ══════════════════════════════════════════════════════
   PANTALLA DE VOTACIÓN
   ══════════════════════════════════════════════════════ */
function renderVoteScreen(){
  return `
  <div class="center-screen">
    <div class="login-card" style="max-width:480px">
      <div class="logo">
        <span class="emoji">🗳️</span>
        <h2>Multifamiliares La Posada</h2>
        <p>Sistema de Votación Digital</p>
      </div>
      ${state.votingStep==="enter"   ? renderVoteEnter()
      : state.votingStep==="confirm" ? renderVoteConfirm()
      : state.votingStep==="vote"    ? renderVoteQuestion()
      : renderVoteSuccess()}
      <button class="btn" style="background:var(--gray-100);color:var(--gray-500);margin-top:16px;width:100%"
        onclick="state.view='home';render()">← Volver al inicio</button>
    </div>
  </div>`;
}

function renderVoteEnter(){
  return `
  <p class="text-center text-gray" style="margin-bottom:16px">Ingrese su código PIN de 5 dígitos</p>
  <div class="code-input-wrap">
    <input class="code-input" type="tel" maxlength="5" id="pinInput"
      placeholder="_ _ _ _ _"
      oninput="this.value=this.value.replace(/\D/g,'')"
      onkeydown="if(event.key==='Enter')validatePin()"/>
  </div>
  <button class="btn btn-primary btn-lg w-full" onclick="validatePin()">🔍 Verificar Código</button>
  <div id="pinError"></div>`;
}

function renderVoteConfirm(){
  const a=state.currentApt;
  return `
  <p class="text-center text-gray" style="margin-bottom:16px">Confirme que estos son sus datos:</p>
  <div class="apt-confirm-card">
    <div class="apt-code">🏠 Apartamento ${a.code}</div>
    <div class="apt-owner" style="margin-top:8px">${a.owner}</div>
    <div class="apt-coeff" style="margin-top:4px">Coeficiente: ${a.coefficient}%</div>
  </div>
  <div class="alert alert-info" style="margin-bottom:16px">
    ℹ️ Verifique que este es su apartamento antes de continuar.
  </div>
  <div class="flex gap-2">
    <button class="btn btn-success btn-lg w-full" onclick="confirmApartment()">✅ Sí, es correcto</button>
    <button class="btn btn-danger btn-lg" onclick="state.votingStep='enter';render()">✕</button>
  </div>`;
}

function renderVoteQuestion(){
  const q=state.pendingQuestions[state.currentQIdx];
  if(!q){ completeVoting(); return ""; }
  const total=state.pendingQuestions.length;
  const idx  =state.currentQIdx;
  return `
  <div class="flex justify-between items-center" style="margin-bottom:12px">
    <span class="tag">Pregunta ${idx+1} de ${total}</span>
    <span class="tag">🏠 ${state.currentApt.code}</span>
  </div>
  <div class="progress-wrap" style="margin-bottom:16px">
    <div class="progress-bar" style="width:${(idx/total)*100}%"></div>
  </div>
  <h3 style="font-size:1.05rem;font-weight:700;color:var(--gray-900);margin-bottom:16px;text-align:center">
    ${escapeHtml(q.text)}
  </h3>
  <div class="vote-options">
    ${q.options.map((o,i)=>`
      <div class="vote-option" id="vopt_${i}" onclick="selectOption(${i},'${escapeAttr(o)}')">${escapeHtml(o)}</div>
    `).join("")}
  </div>
  <button class="btn btn-primary btn-lg w-full" id="voteSubmitBtn"
    onclick="submitVote()" disabled style="margin-top:12px">Confirmar Voto →</button>
  <div id="voteMsg"></div>`;
}

function renderVoteSuccess(){
  return `
  <div class="success-screen">
    <span class="checkmark">🎉</span>
    <h2>¡Voto Registrado!</h2>
    <p>Su participación ha sido registrada exitosamente.</p>
    <p class="text-sm text-gray" style="margin-top:8px">Gracias, <strong>${state.currentApt?.owner||""}</strong></p>
    <div style="margin-top:24px">
      <button class="btn btn-primary btn-lg" onclick="state.view='home';render()">🏠 Ir al Inicio</button>
    </div>
  </div>`;
}

/* ── Acciones de votación ── */
let selectedOption=null;

async function validatePin(){
  const pin=document.getElementById("pinInput")?.value?.trim();
  const errEl=document.getElementById("pinError");
  if(!pin||pin.length!==5){
    errEl.innerHTML=`<div class="alert alert-danger">⚠️ Ingrese un código de 5 dígitos.</div>`; return;
  }
  const apt=PIN_MAP[pin];
  if(!apt){
    errEl.innerHTML=`<div class="alert alert-danger">❌ Código no encontrado. Verifique e intente de nuevo.</div>`; return;
  }
  // Mostrar spinner pequeño
  errEl.innerHTML=`<div class="alert alert-info">⏳ Verificando...</div>`;
  try{
    const [questions, answeredIds] = await Promise.all([
      window._fb.getQuestions(),
      window._fb.getVotedQuestions(apt.code),
    ]);
    const openPending=questions.filter(q=>!q.closed && !answeredIds.includes(q.id));
    if(openPending.length===0){
      const hasAnswered=answeredIds.length>0;
      errEl.innerHTML=`<div class="alert alert-warning">
        ${hasAnswered
          ?"⚠️ Ya ha respondido todas las preguntas disponibles. ¡Gracias por participar!"
          :"⚠️ No hay preguntas abiertas en este momento. Intente más tarde."}
      </div>`;
      return;
    }
    state.currentApt       =apt;
    state.pendingQuestions =openPending;
    state.currentQIdx      =0;
    state.votingStep       ="confirm";
    render();
  }catch(e){
    errEl.innerHTML=`<div class="alert alert-danger">❌ Error de conexión. Intente de nuevo.</div>`;
    console.error(e);
  }
}

function confirmApartment(){ state.votingStep="vote"; selectedOption=null; render(); }

function selectOption(idx,value){
  selectedOption=value;
  document.querySelectorAll(".vote-option").forEach(el=>el.classList.remove("selected"));
  document.getElementById(`vopt_${idx}`)?.classList.add("selected");
  const btn=document.getElementById("voteSubmitBtn");
  if(btn) btn.disabled=false;
}

async function submitVote(){
  if(!selectedOption) return;
  const q  =state.pendingQuestions[state.currentQIdx];
  const apt=state.currentApt;
  const btn=document.getElementById("voteSubmitBtn");
  const msg=document.getElementById("voteMsg");
  if(btn){ btn.disabled=true; btn.textContent="Guardando..."; }
  try{
    await window._fb.saveVote(apt.code, q.id, selectedOption, apt.coefficient);
    await window._fb.markUsed(apt.code);
    selectedOption=null;
    state.currentQIdx++;
    if(state.currentQIdx>=state.pendingQuestions.length) completeVoting();
    else render();
  }catch(e){
    if(msg) msg.innerHTML=`<div class="alert alert-danger">❌ Error al guardar. Intente de nuevo.</div>`;
    if(btn){ btn.disabled=false; btn.textContent="Confirmar Voto →"; }
    console.error(e);
  }
}

function completeVoting(){ state.votingStep="success"; render(); }

/* ══════════════════════════════════════════════════════
   BIND
   ══════════════════════════════════════════════════════ */
function bindAdmin(){
  if(state.adminTab==="codes" && state.codesFilter){
    setTimeout(()=>{
      const el=document.getElementById("codeSearch");
      if(el){ el.focus(); el.setSelectionRange(el.value.length,el.value.length); }
    },30);
  }
}
function bindVote(){
  if(state.votingStep==="enter")
    setTimeout(()=>document.getElementById("pinInput")?.focus(),50);
  selectedOption=null;
}

/* ══════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════ */
render();
  if (pin === null) return;
  if (pin === ADMIN_CODE) { state.view = "admin"; state.adminTab = "dashboard"; render(); }
  else alert("❌ Código incorrecto.");
}

/* ============================================================
   ADMIN PANEL
   ============================================================ */
function renderAdmin() {
  return `
  <div>
    ${renderHeader()}
    <div class="container">
      <div class="tabs">
        ${["dashboard","codes","questions","results"].map(t => `
          <div class="tab ${state.adminTab===t?"active":""}" onclick="switchTab('${t}')">
            ${{dashboard:"📊 Dashboard", codes:"🔑 Códigos", questions:"❓ Preguntas", results:"📈 Resultados"}[t]}
          </div>`).join("")}
      </div>
      ${ state.adminTab==="dashboard" ? renderDashboard()
       : state.adminTab==="codes"     ? renderCodesTab()
       : state.adminTab==="questions" ? renderQuestionsTab()
       : renderResultsTab() }
    </div>
  </div>`;
}

function renderHeader() {
  return `
  <div class="header">
    <div>
      <h1>🏢 Multifamiliares La Posada</h1>
      <div class="subtitle">Panel de Administrador</div>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost btn-sm" onclick="state.view='home';render()">⬅ Salir</button>
    </div>
  </div>`;
}

function switchTab(t) { state.adminTab = t; render(); }

/* ---- Dashboard ---- */
function renderDashboard() {
  const codes = LS.get("codes") || {};
  const total = APARTMENTS_DATA.length;
  const voted = Object.values(codes).filter(c => c.used).length;
  const pending = total - voted;
  const pct = total ? ((voted/total)*100).toFixed(1) : 0;

  // Coeff participation
  const totalCoeff = APARTMENTS_DATA.reduce((s,a) => s + a.coefficient, 0);
  const votedCoeff = APARTMENTS_DATA
    .filter(a => codes[a.code]?.used)
    .reduce((s,a) => s + a.coefficient, 0);
  const pctCoeff = totalCoeff ? ((votedCoeff/totalCoeff)*100).toFixed(2) : 0;

  const questions = LS.get("questions") || [];

  return `
  <div class="grid-stats">
    <div class="stat-card">
      <div class="flex justify-between items-center">
        <div>
          <div class="value">${total}</div>
          <div class="label">Total Apartamentos</div>
        </div>
        <div class="icon">🏠</div>
      </div>
    </div>
    <div class="stat-card green">
      <div class="flex justify-between items-center">
        <div>
          <div class="value">${voted}</div>
          <div class="label">Han Votado</div>
        </div>
        <div class="icon">✅</div>
      </div>
    </div>
    <div class="stat-card orange">
      <div class="flex justify-between items-center">
        <div>
          <div class="value">${pending}</div>
          <div class="label">Pendientes</div>
        </div>
        <div class="icon">⏳</div>
      </div>
    </div>
    <div class="stat-card red">
      <div class="flex justify-between items-center">
        <div>
          <div class="value">${pct}%</div>
          <div class="label">Participación</div>
        </div>
        <div class="icon">📊</div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card mb-4">
      <div class="card-header"><h2>📊 Progreso de Participación</h2></div>
      <div class="card-body">
        <div class="mb-4">
          <div class="flex justify-between mb-4">
            <span class="font-bold">Por apartamentos</span>
            <span class="font-bold text-sm">${voted} / ${total}</span>
          </div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="progress-label">${pct}% de participación</div>
        </div>
        <hr class="divider"/>
        <div>
          <div class="flex justify-between mb-4">
            <span class="font-bold">Por coeficiente</span>
            <span class="font-bold text-sm">${votedCoeff.toFixed(2)} / ${totalCoeff.toFixed(2)}</span>
          </div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pctCoeff}%"></div></div>
          <div class="progress-label">${pctCoeff}% del coeficiente total</div>
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h2>❓ Estado de Preguntas</h2></div>
      <div class="card-body">
        ${questions.length === 0
          ? `<div class="text-center text-gray" style="padding:20px">No hay preguntas creadas.<br/><br/><button class="btn btn-primary btn-sm" onclick="switchTab('questions')">+ Crear pregunta</button></div>`
          : questions.map(q => {
              const votes = (LS.get("votes")||[]).filter(v=>v.qId===q.id);
              const unique = [...new Set(votes.map(v=>v.aptCode))].length;
              return `
              <div style="padding:10px 0; border-bottom:1px solid var(--gray-100)">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-sm" style="max-width:65%">${q.text}</span>
                  ${q.closed
                    ? `<span class="badge badge-danger">🔒 Cerrada</span>`
                    : `<span class="badge badge-success">🟢 Abierta</span>`}
                </div>
                <div class="text-xs text-gray mt-4">${unique} votos registrados</div>
              </div>`;}).join("")}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>🏠 Últimas Participaciones</h2>
    </div>
    <div class="card-body" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Apartamento</th><th>Propietario</th><th>Hora de voto</th></tr></thead>
          <tbody>
            ${APARTMENTS_DATA.filter(a=>codes[a.code]?.used)
              .sort((a,b)=> new Date(codes[b.code].usedAt)-new Date(codes[a.code].usedAt))
              .slice(0,10)
              .map(a=>`<tr>
                <td><span class="code-cell">${a.code}</span></td>
                <td>${a.owner}</td>
                <td class="text-sm text-gray">${formatDate(codes[a.code].usedAt)}</td>
              </tr>`).join("") || `<tr><td colspan="3" class="text-center text-gray" style="padding:20px">Ningún apartamento ha votado aún.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ---- Codes Tab ---- */
function renderCodesTab() {
  const codes = LS.get("codes") || {};
  const allGenerated = APARTMENTS_DATA.every(a => codes[a.code]);
  const filter = state.codesFilter.toLowerCase();

  const filtered = APARTMENTS_DATA.filter(a =>
    a.code.toLowerCase().includes(filter) ||
    a.owner.toLowerCase().includes(filter) ||
    (codes[a.code]?.pin||"").includes(filter)
  );

  return `
  <div class="card mb-4">
    <div class="card-header">
      <h2>🔑 Gestión de Códigos</h2>
      <div class="flex gap-2" style="flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="generateAllCodes()">
          ⚡ Generar Todos
        </button>
        <button class="btn btn-success btn-sm" onclick="exportCodes()">
          📥 Exportar CSV
        </button>
        <button class="btn btn-danger btn-sm" onclick="confirmResetCodes()">
          🗑️ Resetear Todo
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="search-wrap mb-4">
        <span class="search-icon">🔍</span>
        <input class="form-control" style="padding-left:36px" type="text" id="codeSearch"
          placeholder="Buscar por apartamento, propietario o código..."
          value="${state.codesFilter}"
          oninput="state.codesFilter=this.value;render()"/>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartamento</th>
              <th>Propietario</th>
              <th>Coeficiente</th>
              <th>Código PIN</th>
              <th>Estado</th>
              <th>Usado el</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(a => {
              const c = codes[a.code];
              return `<tr>
                <td><span class="code-cell">${a.code}</span></td>
                <td class="text-sm">${a.owner}</td>
                <td><span class="tag">${a.coefficient}%</span></td>
                <td>
                  ${c ? `<span class="code-cell" style="font-size:1.1rem;color:var(--primary)">${c.pin}</span>`
                      : `<span class="text-gray text-sm">—</span>`}
                </td>
                <td>
                  ${!c ? `<span class="badge badge-gray">Sin código</span>`
                    : c.used ? `<span class="badge badge-success">✅ Usado</span>`
                    : `<span class="badge badge-warning">⏳ Pendiente</span>`}
                </td>
                <td class="text-xs text-gray">${c?.usedAt ? formatDate(c.usedAt) : "—"}</td>
                <td>
                  <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="generateSingleCode('${a.code}')">
                      ${c ? "🔄" : "➕"}
                    </button>
                    ${c?.used ? `<button class="btn btn-warning btn-sm" onclick="resetSingleVote('${a.code}')">↩</button>` : ""}
                  </div>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="text-sm text-gray mt-4">
        Mostrando ${filtered.length} de ${APARTMENTS_DATA.length} apartamentos
      </div>
    </div>
  </div>`;
}

/* ---- Questions Tab ---- */
function renderQuestionsTab() {
  const questions = LS.get("questions") || [];
  return `
  <div class="grid-2">
    <div class="card">
      <div class="card-header"><h2>${state.editingQuestion ? "✏️ Editar Pregunta" : "➕ Nueva Pregunta"}</h2></div>
      <div class="card-body">
        <div id="questionForm">
          ${renderQuestionForm()}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h2>❓ Preguntas (${questions.length})</h2>
      </div>
      <div class="card-body" style="padding:0">
        ${questions.length === 0
          ? `<div class="text-center text-gray" style="padding:40px">No hay preguntas creadas aún.</div>`
          : questions.map((q,i) => renderQuestionItem(q,i)).join("")}
      </div>
    </div>
  </div>`;
}

function renderQuestionForm() {
  const eq = state.editingQuestion;
  const optCount = eq ? eq.options.length : 2;
  const options = eq ? eq.options : ["Sí","No"];
  return `
  <div class="form-group">
    <label>Texto de la pregunta</label>
    <textarea class="form-control" id="qText" rows="3" placeholder="Ej: ¿Está de acuerdo con el presupuesto?">${eq ? eq.text : ""}</textarea>
  </div>
  <div class="form-group">
    <label>Opciones de respuesta</label>
    <div id="optionsWrap">
      ${options.map((o,i) => `
        <div class="flex gap-2 mb-4" style="margin-bottom:8px">
          <input class="form-control" id="opt_${i}" value="${o}" placeholder="Opción ${i+1}"/>
          <button class="btn btn-danger btn-sm" onclick="removeOption(${i})" ${options.length<=2?"disabled":""}>✕</button>
        </div>`).join("")}
    </div>
    <button class="btn btn-outline btn-sm mt-4" onclick="addOption()" style="margin-top:8px">+ Agregar opción</button>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-primary w-full" onclick="${eq ? "updateQuestion()" : "addQuestion()}"}">
      ${eq ? "💾 Guardar Cambios" : "✅ Crear Pregunta"}
    </button>
    ${eq ? `<button class="btn btn-outline" onclick="cancelEdit()">Cancelar</button>` : ""}
  </div>`;
}

function renderQuestionItem(q, i) {
  const votes = (LS.get("votes")||[]).filter(v=>v.qId===q.id);
  const unique = [...new Set(votes.map(v=>v.aptCode))].length;
  return `
  <div class="card-body" style="border-bottom:1px solid var(--gray-200)">
    <div class="question-header mb-4">
      <span class="tag">#${i+1}</span>
      ${q.closed ? `<span class="badge badge-danger">🔒 Cerrada</span>` : `<span class="badge badge-success">🟢 Abierta</span>`}
      <span class="text-xs text-gray">${unique} votos</span>
    </div>
    <p class="font-bold text-sm mb-4" style="margin-bottom:8px">${q.text}</p>
    <div style="margin-bottom:10px">
      ${q.options.map(o=>`<span class="tag" style="margin-right:4px;margin-bottom:4px">${o}</span>`).join("")}
    </div>
    <div class="flex gap-2" style="flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="editQuestion('${q.id}')">✏️ Editar</button>
      ${q.closed
        ? `<button class="btn btn-success btn-sm" onclick="toggleQuestion('${q.id}')">🔓 Abrir</button>`
        : `<button class="btn btn-warning btn-sm" onclick="toggleQuestion('${q.id}')">🔒 Cerrar</button>`}
      <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${q.id}')">🗑️ Eliminar</button>
    </div>
  </div>`;
}

/* ---- Results Tab ---- */
function renderResultsTab() {
  const questions = LS.get("questions") || [];
  const votes = LS.get("votes") || [];
  const codes = LS.get("codes") || {};
  const totalCoeff = APARTMENTS_DATA.reduce((s,a)=>s+a.coefficient,0);

  return `
  <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
    <button class="btn btn-success btn-sm" onclick="exportVotes()">📥 Exportar Votos CSV</button>
    <button class="btn btn-primary btn-sm" onclick="exportResults()">📊 Exportar Resultados</button>
  </div>
  ${questions.length === 0
    ? `<div class="card"><div class="card-body text-center text-gray" style="padding:40px">No hay preguntas configuradas.</div></div>`
    : questions.map(q => {
        const qVotes = votes.filter(v=>v.qId===q.id);
        const uniqueApts = [...new Set(qVotes.map(v=>v.aptCode))];
        const totalVoted = uniqueApts.length;
        const totalCoeffVoted = uniqueApts.reduce((s,c)=>{
          const apt = APARTMENTS_DATA.find(a=>a.code===c);
          return s + (apt ? apt.coefficient : 0);
        }, 0);

        return `
        <div class="card mb-4">
          <div class="card-header">
            <div>
              <h2>${q.text}</h2>
              <div class="text-xs text-gray" style="margin-top:4px">${totalVoted} votos — ${totalCoeffVoted.toFixed(2)} coeficiente</div>
            </div>
            ${q.closed ? `<span class="badge badge-danger">🔒 Cerrada</span>` : `<span class="badge badge-success">🟢 Abierta</span>`}
          </div>
          <div class="card-body">
            ${q.options.map((opt, oi) => {
              const optVotes = qVotes.filter(v=>v.option===opt);
              const optCoeff = optVotes.reduce((s,v)=>s+v.coeff, 0);
              const pctApt = totalVoted ? ((optVotes.length/totalVoted)*100).toFixed(1) : 0;
              const pctCoeff = totalCoeff ? ((optCoeff/totalCoeff)*100).toFixed(2) : 0;
              return `
              <div class="result-item">
                <div class="option-label">
                  <span>${opt}</span>
                  <span>${optVotes.length} votos (${pctApt}%) — coeff: ${optCoeff.toFixed(2)} (${pctCoeff}%)</span>
                </div>
                <div class="result-bar-wrap">
                  <div class="result-bar bar-${oi}" style="width:${pctApt}%">${pctApt > 5 ? pctApt+"%" : ""}</div>
                </div>
              </div>`;}).join("")}
            <hr class="divider"/>
            <div class="text-sm text-gray">
              Participación: ${totalVoted}/${APARTMENTS_DATA.length} apartamentos —
              ${totalCoeff ? ((totalCoeffVoted/totalCoeff)*100).toFixed(2) : 0}% del coeficiente total
            </div>
          </div>
        </div>`;}).join("")}`;
}

/* ============================================================
   ADMIN ACTIONS
   ============================================================ */
function generateAllCodes() {
  const codes = LS.get("codes") || {};
  APARTMENTS_DATA.forEach(a => {
    if (!codes[a.code]) {
      codes[a.code] = { pin: genPin(), used: false, usedAt: null };
    }
  });
  LS.set("codes", codes);
  render();
}

function generateSingleCode(aptCode) {
  const codes = LS.get("codes") || {};
  if (codes[aptCode]?.used) {
    if (!confirm("Este apartamento ya votó. ¿Desea regenerar el código de todas formas? (Se perderá el registro de uso)")) return;
  }
  codes[aptCode] = { pin: genPin(), used: false, usedAt: null };
  LS.set("codes", codes);
  render();
}

function confirmResetCodes() {
  if (!confirm("⚠️ ¿Está seguro? Esto eliminará TODOS los códigos y votos.")) return;
  LS.set("codes", {});
  LS.set("votes", []);
  render();
}

function resetSingleVote(aptCode) {
  if (!confirm(`¿Resetear el voto del apartamento ${aptCode}?`)) return;
  const codes = LS.get("codes") || {};
  if (codes[aptCode]) { codes[aptCode].used = false; codes[aptCode].usedAt = null; }
  LS.set("codes", codes);
  // Remove votes for this apt
  const votes = (LS.get("votes")||[]).filter(v=>v.aptCode!==aptCode);
  LS.set("votes", votes);
  render();
}

function genPin() {
  const codes = LS.get("codes") || {};
  const usedPins = new Set(Object.values(codes).map(c=>c.pin));
  let pin;
  do { pin = String(Math.floor(10000 + Math.random() * 90000)); } while (usedPins.has(pin));
  return pin;
}

/* ---- Questions ---- */
function getOptionValues() {
  const opts = [];
  let i = 0;
  while (document.getElementById(`opt_${i}`)) {
    const v = document.getElementById(`opt_${i}`).value.trim();
    if (v) opts.push(v);
    i++;
  }
  return opts;
}

function addQuestion() {
  const text = document.getElementById("qText").value.trim();
  const opts = getOptionValues();
  if (!text) { alert("Ingrese el texto de la pregunta."); return; }
  if (opts.length < 2) { alert("Debe haber al menos 2 opciones."); return; }
  const questions = LS.get("questions") || [];
  questions.push({ id: Date.now().toString(), text, options: opts, closed: false, createdAt: new Date().toISOString() });
  LS.set("questions", questions);
  render();
}

function updateQuestion() {
  const text = document.getElementById("qText").value.trim();
  const opts = getOptionValues();
  if (!text) { alert("Ingrese el texto de la pregunta."); return; }
  if (opts.length < 2) { alert("Debe haber al menos 2 opciones."); return; }
  const questions = LS.get("questions") || [];
  const idx = questions.findIndex(q=>q.id===state.editingQuestion.id);
  if (idx > -1) { questions[idx].text = text; questions[idx].options = opts; }
  LS.set("questions", questions);
  state.editingQuestion = null;
  render();
}

function editQuestion(id) {
  const q = (LS.get("questions")||[]).find(q=>q.id===id);
  state.editingQuestion = q ? {...q, options:[...q.options]} : null;
  render();
}

function cancelEdit() { state.editingQuestion = null; render(); }

function deleteQuestion(id) {
  if (!confirm("¿Eliminar esta pregunta y todos sus votos?")) return;
  LS.set("questions", (LS.get("questions")||[]).filter(q=>q.id!==id));
  LS.set("votes", (LS.get("votes")||[]).filter(v=>v.qId!==id));
  render();
}

function toggleQuestion(id) {
  const questions = LS.get("questions") || [];
  const q = questions.find(q=>q.id===id);
  if (q) q.closed = !q.closed;
  LS.set("questions", questions);
  render();
}

/* Dynamic options in form */
function addOption() {
  const eq = state.editingQuestion;
  if (eq) { eq.options.push(""); }
  document.getElementById("questionForm").innerHTML = renderQuestionForm();
  // Re-collect existing values
}

function removeOption(idx) {
  const eq = state.editingQuestion;
  const opts = getOptionValues();
  opts.splice(idx, 1);
  if (eq) { eq.options = opts; } else { state._tempOptions = opts; }
  document.getElementById("questionForm").innerHTML = renderQuestionForm();
}

/* ---- Exports ---- */
function exportCodes() {
  const codes = LS.get("codes") || {};
  let csv = "Apartamento,Propietario,Coeficiente,Código PIN,Estado,Fecha de Uso\n";
  APARTMENTS_DATA.forEach(a => {
    const c = codes[a.code];
    csv += `"${a.code}","${a.owner}","${a.coefficient}","${c?.pin||""}","${!c?"Sin código":c.used?"Usado":"Pendiente"}","${c?.usedAt||""}"\n`;
  });
  downloadCSV(csv, "codigos_votacion.csv");
}

function exportVotes() {
  const votes = LS.get("votes") || [];
  let csv = "Apartamento,Propietario,Coeficiente,Pregunta,Respuesta,Fecha\n";
  votes.forEach(v => {
    const apt = APARTMENTS_DATA.find(a=>a.code===v.aptCode);
    const q = (LS.get("questions")||[]).find(q=>q.id===v.qId);
    csv += `"${v.aptCode}","${apt?.owner||""}","${v.coeff}","${q?.text||v.qId}","${v.option}","${v.votedAt}"\n`;
  });
  downloadCSV(csv, "votos_exportados.csv");
}

function exportResults() {
  const questions = LS.get("questions") || [];
  const votes = LS.get("votes") || [];
  const totalCoeff = APARTMENTS_DATA.reduce((s,a)=>s+a.coefficient,0);
  let csv = "Pregunta,Opción,Votos,% Votos,Coeficiente Acumulado,% Coeficiente Total\n";
  questions.forEach(q => {
    const qVotes = votes.filter(v=>v.qId===q.id);
    const total = [...new Set(qVotes.map(v=>v.aptCode))].length;
    q.options.forEach(opt => {
      const ov = qVotes.filter(v=>v.option===opt);
      const oc = ov.reduce((s,v)=>s+v.coeff,0);
      csv += `"${q.text}","${opt}","${ov.length}","${total?((ov.length/total)*100).toFixed(1):0}%","${oc.toFixed(2)}","${totalCoeff?((oc/totalCoeff)*100).toFixed(2):0}%"\n`;
    });
  });
  downloadCSV(csv, "resultados_votacion.csv");
}

function downloadCSV(csv, filename) {
  const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   VOTING SCREEN
   ============================================================ */
function renderVoteScreen() {
  return `
  <div class="center-screen" style="background:linear-gradient(135deg,#e8f0fe 0%,#f0f4ff 100%)">
    <div class="login-card" style="max-width:480px">
      <div class="logo">
        <span class="emoji">🗳️</span>
        <h2>Multifamiliares La Posada</h2>
        <p>Sistema de Votación Digital</p>
      </div>
      ${state.votingStep === "enter"   ? renderVoteEnter()
      : state.votingStep === "confirm" ? renderVoteConfirm()
      : state.votingStep === "vote"    ? renderVoteQuestion()
      : renderVoteSuccess()}
      <button class="btn btn-ghost" style="background:var(--gray-100);color:var(--gray-500);margin-top:16px;width:100%" onclick="state.view='home';render()">
        ← Volver al inicio
      </button>
    </div>
  </div>`;
}

function renderVoteEnter() {
  return `
  <div>
    <p class="text-center text-gray mb-4" style="margin-bottom:16px">Ingrese su código de 5 dígitos</p>
    <div class="code-input-wrap">
      <input class="code-input" type="tel" maxlength="5" id="pinInput"
        placeholder="_ _ _ _ _"
        oninput="this.value=this.value.replace(/\D/g,'')"
        onkeydown="if(event.key==='Enter')validatePin()"/>
    </div>
    <button class="btn btn-primary btn-lg w-full" onclick="validatePin()">
      🔍 Verificar Código
    </button>
    <div id="pinError"></div>
  </div>`;
}

function renderVoteConfirm() {
  const a = state.currentApt;
  return `
  <div>
    <p class="text-center text-gray mb-4">Confirme que estos son sus datos:</p>
    <div class="apt-confirm-card">
      <div class="apt-code">🏠 Apartamento ${a.code}</div>
      <div class="apt-owner" style="margin-top:8px">${a.owner}</div>
      <div class="apt-coeff" style="margin-top:4px">Coeficiente: ${a.coefficient}%</div>
    </div>
    <div class="alert alert-info" style="margin-bottom:16px">
      ℹ️ Por favor verifique que este es su apartamento antes de continuar.
    </div>
    <div class="flex gap-2">
      <button class="btn btn-success btn-lg w-full" onclick="confirmApartment()">
        ✅ Sí, es correcto
      </button>
      <button class="btn btn-danger btn-lg" onclick="state.votingStep='enter';render()">
        ✕
      </button>
    </div>
  </div>`;
}

function renderVoteQuestion() {
  const q = state.pendingQuestions[state.currentQIdx];
  if (!q) { completeVoting(); return ""; }
  const totalQ = state.pendingQuestions.length;
  const idx = state.currentQIdx;

  return `
  <div>
    <div class="flex justify-between items-center mb-4" style="margin-bottom:12px">
      <span class="tag">Pregunta ${idx+1} de ${totalQ}</span>
      <span class="tag">🏠 ${state.currentApt.code}</span>
    </div>
    <div class="progress-wrap mb-4" style="margin-bottom:16px">
      <div class="progress-bar" style="width:${((idx)/totalQ)*100}%"></div>
    </div>
    <h3 style="font-size:1.1rem;font-weight:700;color:var(--gray-900);margin-bottom:16px;text-align:center">${q.text}</h3>
    <div class="vote-options" id="voteOptions">
      ${q.options.map((o,i)=>`
        <div class="vote-option" id="vopt_${i}" onclick="selectOption(${i},'${escapeHtml(o)}')">${o}</div>
      `).join("")}
    </div>
    <button class="btn btn-primary btn-lg w-full" id="voteSubmitBtn" onclick="submitVote()" disabled style="margin-top:8px">
      Confirmar Voto →
    </button>
    <div id="voteMsg"></div>
  </div>`;
}

function renderVoteSuccess() {
  return `
  <div class="success-screen">
    <span class="checkmark">🎉</span>
    <h2>¡Voto Registrado!</h2>
    <p>Su participación ha sido registrada exitosamente.</p>
    <p class="text-sm text-gray" style="margin-top:8px">Gracias, <strong>${state.currentApt?.owner||""}</strong></p>
    <div style="margin-top:24px">
      <button class="btn btn-primary btn-lg" onclick="state.view='home';render()">
        🏠 Ir al Inicio
      </button>
    </div>
  </div>`;
}

/* ---- Voting Actions ---- */
let selectedOption = null;

function validatePin() {
  const pin = document.getElementById("pinInput")?.value?.trim();
  const errEl = document.getElementById("pinError");
  if (!pin || pin.length !== 5) {
    if (errEl) errEl.innerHTML = `<div class="alert alert-danger">⚠️ Ingrese un código de 5 dígitos.</div>`;
    return;
  }
  const codes = LS.get("codes") || {};
  // Find apt by pin
  const entry = Object.entries(codes).find(([k,v]) => v.pin === pin);
  if (!entry) {
    if (errEl) errEl.innerHTML = `<div class="alert alert-danger">❌ Código no encontrado. Verifique e intente de nuevo.</div>`;
    return;
  }
  const [aptCode, codeData] = entry;

  // Check if there are open questions this apt hasn't answered
  const questions = (LS.get("questions")||[]).filter(q=>!q.closed);
  const votes = LS.get("votes") || [];
  const answeredQIds = votes.filter(v=>v.aptCode===aptCode).map(v=>v.qId);
  const pending = questions.filter(q=>!answeredQIds.includes(q.id));

  if (pending.length === 0) {
    if (codeData.used) {
      if (errEl) errEl.innerHTML = `<div class="alert alert-warning">⚠️ Ya ha votado en todas las preguntas disponibles. Gracias por su participación.</div>`;
    } else {
      if (errEl) errEl.innerHTML = `<div class="alert alert-warning">⚠️ No hay preguntas abiertas disponibles para votar en este momento.</div>`;
    }
    return;
  }

  const apt = APARTMENTS_DATA.find(a=>a.code===aptCode);
  state.currentApt = apt;
  state.currentVoteCode = pin;
  state.pendingQuestions = pending;
  state.currentQIdx = 0;
  state.votingStep = "confirm";
  render();
}

function confirmApartment() {
  state.votingStep = "vote";
  selectedOption = null;
  render();
}

function selectOption(idx, value) {
  selectedOption = value;
  document.querySelectorAll(".vote-option").forEach(el => el.classList.remove("selected"));
  document.getElementById(`vopt_${idx}`)?.classList.add("selected");
  const btn = document.getElementById("voteSubmitBtn");
  if (btn) btn.disabled = false;
}

function submitVote() {
  if (!selectedOption) return;
  const q = state.pendingQuestions[state.currentQIdx];
  const apt = state.currentApt;
  const votes = LS.get("votes") || [];
  // Double-check not already voted this question
  if (votes.find(v=>v.aptCode===apt.code && v.qId===q.id)) {
    document.getElementById("voteMsg").innerHTML = `<div class="alert alert-warning">Ya respondió esta pregunta.</div>`;
    return;
  }
  votes.push({ aptCode: apt.code, qId: q.id, option: selectedOption, coeff: apt.coefficient, votedAt: new Date().toISOString() });
  LS.set("votes", votes);

  // Mark code as used
  const codes = LS.get("codes") || {};
  if (codes[apt.code]) { codes[apt.code].used = true; codes[apt.code].usedAt = new Date().toISOString(); }
  LS.set("codes", codes);

  selectedOption = null;
  state.currentQIdx++;

  if (state.currentQIdx >= state.pendingQuestions.length) {
    completeVoting();
  } else {
    render();
  }
}

function completeVoting() {
  state.votingStep = "success";
  render();
}

/* ============================================================
   BIND & HELPERS
   ============================================================ */
function bindAdmin() {
  // Focus search if on codes tab
  if (state.adminTab === "codes") {
    setTimeout(() => { document.getElementById("codeSearch")?.focus?.(); }, 50);
  }
}

function bindVote() {
  if (state.votingStep === "enter") {
    setTimeout(() => { document.getElementById("pinInput")?.focus?.(); }, 50);
  }
  selectedOption = null;
}

function escapeHtml(s) { return String(s).replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"}) + " " +
           d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  } catch { return iso; }
}

/* ---- addOption / removeOption for dynamic form (no editingQuestion) ---- */
// Override addOption to handle both cases
const _origAdd = addOption;
window.addOption = function() {
  const opts = getOptionValues();
  opts.push("");
  if (state.editingQuestion) state.editingQuestion.options = opts;
  document.getElementById("questionForm").innerHTML = buildFormHTML(opts, state.editingQuestion);
  document.getElementById(`opt_${opts.length-1}`)?.focus();
};

window.removeOption = function(idx) {
  const opts = getOptionValues();
  opts.splice(idx, 1);
  if (state.editingQuestion) state.editingQuestion.options = opts;
  document.getElementById("questionForm").innerHTML = buildFormHTML(opts, state.editingQuestion);
};

function buildFormHTML(options, eq) {
  const text = document.getElementById("qText")?.value || (eq?.text||"");
  return `
  <div class="form-group">
    <label>Texto de la pregunta</label>
    <textarea class="form-control" id="qText" rows="3" placeholder="Ej: ¿Está de acuerdo con el presupuesto?">${text}</textarea>
  </div>
  <div class="form-group">
    <label>Opciones de respuesta</label>
    <div id="optionsWrap">
      ${options.map((o,i) => `
        <div class="flex gap-2 mb-4" style="margin-bottom:8px">
          <input class="form-control" id="opt_${i}" value="${escapeHtml(o)}" placeholder="Opción ${i+1}"/>
          <button class="btn btn-danger btn-sm" onclick="removeOption(${i})" ${options.length<=2?"disabled":""}>✕</button>
        </div>`).join("")}
    </div>
    <button class="btn btn-outline btn-sm mt-4" onclick="addOption()" style="margin-top:8px">+ Agregar opción</button>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-primary w-full" onclick="${eq ? "updateQuestion()" : "addQuestion()"}">
      ${eq ? "💾 Guardar Cambios" : "✅ Crear Pregunta"}
    </button>
    ${eq ? `<button class="btn btn-outline" onclick="cancelEdit()">Cancelar</button>` : ""}
  </div>`;
}

/* ============================================================
   BOOT
   ============================================================ */
initStorage();
render();
