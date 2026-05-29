/* ══════════════════════════════════════════════════════
   SISTEMA DE VOTACIÓN — MULTIFAMILIARES LA POSADA
   app.js  |  Firebase Firestore + PINs fijos
   ══════════════════════════════════════════════════════ */

const ADMIN_CODE = "9706";

/* ── Estado global ── */
let state = {
  view:             "home",
  adminTab:         "dashboard",
  codesFilter:      "",
  votingStep:       "enter",
  currentApt:       null,
  pendingQuestions: [],
  currentQIdx:      0,
  editingQuestion:  null,
  _questions:       [],
  _votes:           [],
  _used:            {},
};

/* ══════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════ */
function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO",{day:"2-digit",month:"2-digit",year:"numeric"})
      + " " + d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  } catch { return iso; }
}
function showLoading(msg = "Cargando...") {
  document.getElementById("app").innerHTML = `
    <div class="center-screen">
      <div style="text-align:center">
        <div class="spinner"></div>
        <p style="margin-top:16px;color:var(--gray-500);font-size:1rem">${msg}</p>
      </div>
    </div>`;
}
function downloadCSV(csv, filename) {
  const blob = new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════
   CARGA DE DATOS
   ══════════════════════════════════════════════════════ */
async function loadData() {
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
async function render() {
  const app = document.getElementById("app");
  if (state.view === "home") {
    app.innerHTML = renderHome();
    return;
  }
  if (state.view === "vote") {
    app.innerHTML = renderVoteScreen();
    bindVote();
    return;
  }
  if (state.view === "admin") {
    showLoading("Cargando panel...");
    await loadData();
    app.innerHTML = renderAdmin();
    bindAdmin();
  }
}

/* ══════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════ */
function renderHome() {
  return `
  <div class="center-screen">
    <div class="login-card">
      <div class="logo">
        <span class="emoji">🏢</span>
        <h2>Multifamiliares La Posada</h2>
        <p>Sistema de Votación Digital</p>
      </div>
      <button class="btn btn-primary btn-lg w-full mb-4" onclick="goVote()">
        🗳️ Ingresar a Votar
      </button>
      <button class="btn btn-outline btn-lg w-full" onclick="goAdminLogin()">
        🔐 Panel de Administrador
      </button>
    </div>
  </div>`;
}

function goVote() {
  state.view = "vote"; state.votingStep = "enter";
  state.currentApt = null; state.pendingQuestions = []; state.currentQIdx = 0;
  render();
}

function goAdminLogin() {
  const pin = prompt("Ingrese el código de administrador:");
  if (pin === null) return;
  if (pin === ADMIN_CODE) {
    state.view = "admin"; state.adminTab = "dashboard"; render();
  } else {
    alert("❌ Código incorrecto.");
  }
}

/* ══════════════════════════════════════════════════════
   ADMIN — CONTENEDOR
   ══════════════════════════════════════════════════════ */
function renderAdmin() {
  return `
  <div>
    ${renderHeader()}
    <div class="container">
      <div class="tabs">
        ${["dashboard","codes","questions","results"].map(t => `
          <div class="tab ${state.adminTab===t?"active":""}" onclick="switchTab('${t}')">
            ${{
              dashboard: "📊 Dashboard",
              codes:     "🔑 Códigos",
              questions: "❓ Preguntas",
              results:   "📈 Resultados"
            }[t]}
          </div>`).join("")}
      </div>
      ${ state.adminTab === "dashboard" ? renderDashboard()
       : state.adminTab === "codes"     ? renderCodesTab()
       : state.adminTab === "questions" ? renderQuestionsTab()
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
      <button class="btn btn-ghost btn-sm" onclick="reloadTab()">🔄 Actualizar</button>
      <button class="btn btn-ghost btn-sm" onclick="state.view='home';render()">⬅ Salir</button>
    </div>
  </div>`;
}

async function switchTab(t) {
  state.adminTab = t; state.codesFilter = ""; state.editingQuestion = null;
  showLoading("Cargando...");
  await loadData();
  document.getElementById("app").innerHTML = renderAdmin();
  bindAdmin();
}

async function reloadTab() {
  showLoading("Actualizando...");
  await loadData();
  document.getElementById("app").innerHTML = renderAdmin();
  bindAdmin();
}

function bindAdmin() {
  if (state.adminTab === "codes" && state.codesFilter) {
    setTimeout(() => {
      const el = document.getElementById("codeSearch");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 30);
  }
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════ */
function renderDashboard() {
  const used       = state._used;
  const questions  = state._questions;
  const votes      = state._votes;
  const total      = APARTMENTS_DATA.length;
  const voted      = Object.keys(used).length;
  const pending    = total - voted;
  const pct        = total ? ((voted / total) * 100).toFixed(1) : 0;
  const totalCoeff = APARTMENTS_DATA.reduce((s,a) => s + a.coefficient, 0);
  const votedCoeff = APARTMENTS_DATA
    .filter(a => used[a.code])
    .reduce((s,a) => s + a.coefficient, 0);
  const pctCoeff   = totalCoeff ? ((votedCoeff / totalCoeff) * 100).toFixed(2) : 0;

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
        <div style="margin-bottom:20px">
          <div class="flex justify-between mb-4">
            <span class="font-bold">Por apartamentos</span>
            <span class="font-bold text-sm">${voted} / ${total}</span>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="progress-label">${pct}% de participación</div>
        </div>
        <hr class="divider"/>
        <div>
          <div class="flex justify-between mb-4">
            <span class="font-bold">Por coeficiente</span>
            <span class="font-bold text-sm">${votedCoeff.toFixed(2)} / ${totalCoeff.toFixed(2)}</span>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:${pctCoeff}%"></div>
          </div>
          <div class="progress-label">${pctCoeff}% del coeficiente total</div>
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h2>❓ Estado de Preguntas</h2></div>
      <div class="card-body">
        ${questions.length === 0
          ? `<div class="text-center text-gray" style="padding:20px">
               No hay preguntas creadas.<br/><br/>
               <button class="btn btn-primary btn-sm" onclick="switchTab('questions')">
                 + Crear pregunta
               </button>
             </div>`
          : questions.map(q => {
              const qv   = votes.filter(v => v.qId === q.id);
              const uniq = [...new Set(qv.map(v => v.aptCode))].length;
              return `
              <div style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-sm" style="max-width:65%">${esc(q.text)}</span>
                  ${q.closed
                    ? `<span class="badge badge-danger">🔒 Cerrada</span>`
                    : `<span class="badge badge-success">🟢 Abierta</span>`}
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
          <thead>
            <tr><th>Apartamento</th><th>Propietario</th><th>Votó el</th></tr>
          </thead>
          <tbody>
            ${(() => {
                const rows = APARTMENTS_DATA
                  .filter(a => used[a.code])
                  .sort((a,b) => new Date(used[b.code].usedAt) - new Date(used[a.code].usedAt))
                  .slice(0, 15)
                  .map(a => `
                    <tr>
                      <td><span class="code-cell">${a.code}</span></td>
                      <td class="text-sm">${esc(a.owner)}</td>
                      <td class="text-sm text-gray">${formatDate(used[a.code].usedAt)}</td>
                    </tr>`).join("");
                return rows || `
                  <tr>
                    <td colspan="3" class="text-center text-gray" style="padding:20px">
                      Ningún apartamento ha votado aún.
                    </td>
                  </tr>`;
              })()}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════
   CÓDIGOS
   ══════════════════════════════════════════════════════ */
function renderCodesTab() {
  const filtered = getFilteredApartments();
  return `
  <div class="card mb-4">
    <div class="card-header">
      <h2>🔑 Códigos PIN por Apartamento</h2>
      <div class="flex gap-2" style="flex-wrap:wrap">
        <button class="btn btn-success btn-sm" onclick="exportCodes()">📥 Exportar CSV</button>
        <button class="btn btn-danger btn-sm"  onclick="promptResetApartment()">↩ Resetear voto</button>
      </div>
    </div>
    <div class="card-body">
      <div class="alert alert-info" style="margin-bottom:16px">
        ℹ️ Los PINs son fijos y únicos por apartamento. Entréguelos directamente a cada propietario.
      </div>

      <div class="search-wrap mb-4">
        <span class="search-icon">🔍</span>
        <input
          class="form-control"
          style="padding-left:36px"
          type="text"
          id="codeSearch"
          placeholder="Buscar por apartamento, propietario o PIN..."
          value="${esc(state.codesFilter)}"
          oninput="onSearchInput(this.value)"
        />
      </div>

      <div id="codesTableWrap">
        ${renderCodesTable(filtered)}
      </div>
      <div id="codesCount" class="text-sm text-gray" style="margin-top:12px">
        Mostrando ${filtered.length} de ${APARTMENTS_DATA.length} apartamentos
      </div>
    </div>
  </div>`;
}

function renderCodesTable(filtered) {
  const used = state._used;
  return `
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Apartamento</th>
          <th>Propietario</th>
          <th>Coeficiente</th>
          <th>PIN</th>
          <th>Estado</th>
          <th>Votó el</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(a => {
          const u = used[a.code];
          return `
          <tr>
            <td><span class="code-cell">${a.code}</span></td>
            <td class="text-sm">${esc(a.owner)}</td>
            <td><span class="tag">${a.coefficient}%</span></td>
            <td>
              <span class="code-cell" style="font-size:1.1rem;color:var(--primary)">
                ${a.pin}
              </span>
            </td>
            <td>
              ${u
                ? `<span class="badge badge-success">✅ Votó</span>`
                : `<span class="badge badge-warning">⏳ Pendiente</span>`}
            </td>
            <td class="text-xs text-gray">${u ? formatDate(u.usedAt) : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;
}

function onSearchInput(value) {
  state.codesFilter = value;
  const filtered    = getFilteredApartments();
  setHTML("codesTableWrap", renderCodesTable(filtered));
  setHTML("codesCount",
    `Mostrando ${filtered.length} de ${APARTMENTS_DATA.length} apartamentos`);
}

function getFilteredApartments() {
  const f = state.codesFilter.toLowerCase().trim();
  if (!f) return APARTMENTS_DATA;
  return APARTMENTS_DATA.filter(a =>
    a.code.toLowerCase().includes(f) ||
    a.owner.toLowerCase().includes(f) ||
    a.pin.includes(f)
  );
}

async function promptResetApartment() {
  const input = prompt("Ingrese el código del apartamento a resetear (ej: 01-101):");
  if (!input) return;
  const aptCode = input.trim();
  const apt     = APARTMENTS_DATA.find(a =>
    a.code.toLowerCase() === aptCode.toLowerCase()
  );
  if (!apt) { alert("❌ Apartamento no encontrado."); return; }
  if (!state._used[apt.code]) { alert("ℹ️ Este apartamento aún no ha votado."); return; }
  if (!confirm(
    `¿Resetear el voto de:\n🏠 ${apt.code} — ${apt.owner}?\n\nEsto eliminará sus votos y podrá volver a participar.`
  )) return;
  showLoading("Reseteando...");
  try {
    await window._fb.resetApartment(apt.code);
    await reloadTab();
  } catch(e) {
    alert("❌ Error al resetear: " + e.message);
    await reloadTab();
  }
}

/* ══════════════════════════════════════════════════════
   PREGUNTAS
   ══════════════════════════════════════════════════════ */
function renderQuestionsTab() {
  const questions = state._questions;
  return `
  <div class="grid-2">
    <div class="card">
      <div class="card-header">
        <h2>${state.editingQuestion ? "✏️ Editar Pregunta" : "➕ Nueva Pregunta"}</h2>
      </div>
      <div class="card-body">
        <div id="questionForm">${renderQuestionForm()}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>❓ Preguntas (${questions.length})</h2></div>
      <div class="card-body" style="padding:0">
        ${questions.length === 0
          ? `<div class="text-center text-gray" style="padding:40px">
               No hay preguntas creadas aún.
             </div>`
          : questions.map((q, i) => renderQuestionItem(q, i)).join("")}
      </div>
    </div>
  </div>`;
}

function renderQuestionForm() {
  const eq = state.editingQuestion;
  return buildFormHTML(eq ? eq.options : ["Sí","No"], eq, eq ? eq.text : "");
}

function buildFormHTML(options, eq, textVal = "") {
  return `
  <div class="form-group">
    <label>Texto de la pregunta</label>
    <textarea class="form-control" id="qText" rows="3"
      placeholder="Ej: ¿Está de acuerdo con el presupuesto presentado?"
    >${esc(textVal)}</textarea>
  </div>
  <div class="form-group">
    <label>Opciones de respuesta</label>
    <div id="optionsWrap">
      ${options.map((o, i) => `
        <div class="flex gap-2" style="margin-bottom:8px">
          <input class="form-control" id="opt_${i}"
            value="${esc(o)}" placeholder="Opción ${i+1}"/>
          <button class="btn btn-danger btn-sm"
            onclick="removeOption(${i})"
            ${options.length <= 2 ? "disabled" : ""}>✕</button>
        </div>`).join("")}
    </div>
    <button class="btn btn-outline btn-sm" onclick="addOption()"
      style="margin-top:8px">+ Agregar opción</button>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-primary w-full"
      onclick="${eq ? "saveEditQuestion()" : "saveNewQuestion()"}">
      ${eq ? "💾 Guardar Cambios" : "✅ Crear Pregunta"}
    </button>
    ${eq
      ? `<button class="btn btn-outline" onclick="cancelEdit()">Cancelar</button>`
      : ""}
  </div>`;
}

function renderQuestionItem(q, i) {
  const votes = state._votes.filter(v => v.qId === q.id);
  const uniq  = [...new Set(votes.map(v => v.aptCode))].length;
  return `
  <div style="padding:16px;border-bottom:1px solid var(--gray-200)">
    <div class="flex gap-2 items-center" style="flex-wrap:wrap;margin-bottom:8px">
      <span class="tag">#${i+1}</span>
      ${q.closed
        ? `<span class="badge badge-danger">🔒 Cerrada</span>`
        : `<span class="badge badge-success">🟢 Abierta</span>`}
      <span class="text-xs text-gray">${uniq} voto(s)</span>
    </div>
    <p class="font-bold text-sm" style="margin-bottom:10px">${esc(q.text)}</p>
    <div style="margin-bottom:12px">
      ${q.options.map(o =>
        `<span class="tag" style="margin-right:4px;margin-bottom:4px">${esc(o)}</span>`
      ).join("")}
    </div>
    <div class="flex gap-2" style="flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="editQuestion('${q.id}')">
        ✏️ Editar
      </button>
      ${q.closed
        ? `<button class="btn btn-success btn-sm" onclick="doToggleQuestion('${q.id}',false)">
             🔓 Abrir
           </button>`
        : `<button class="btn btn-warning btn-sm" onclick="doToggleQuestion('${q.id}',true)">
             🔒 Cerrar
           </button>`}
      <button class="btn btn-danger btn-sm" onclick="doDeleteQuestion('${q.id}')">
        🗑️ Eliminar
      </button>
    </div>
  </div>`;
}

/* ── Opciones dinámicas del formulario ── */
function getOptionValues() {
  const opts = []; let i = 0;
  while (document.getElementById(`opt_${i}`)) {
    const v = document.getElementById(`opt_${i}`).value.trim();
    if (v) opts.push(v);
    i++;
  }
  return opts;
}

window.addOption = function() {
  const opts    = getOptionValues(); opts.push("");
  const textVal = document.getElementById("qText")?.value || "";
  if (state.editingQuestion) state.editingQuestion.options = opts;
  setHTML("questionForm", buildFormHTML(opts, state.editingQuestion, textVal));
  document.getElementById(`opt_${opts.length - 1}`)?.focus();
};

window.removeOption = function(idx) {
  const opts    = getOptionValues(); opts.splice(idx, 1);
  const textVal = document.getElementById("qText")?.value || "";
  if (state.editingQuestion) state.editingQuestion.options = opts;
  setHTML("questionForm", buildFormHTML(opts, state.editingQuestion, textVal));
};

/* ── CRUD preguntas ── */
async function saveNewQuestion() {
  const text = document.getElementById("qText")?.value.trim();
  const opts = getOptionValues();
  if (!text)          { alert("Ingrese el texto de la pregunta."); return; }
  if (opts.length < 2){ alert("Debe haber al menos 2 opciones.");  return; }
  showLoading("Guardando pregunta...");
  await window._fb.addQuestion(text, opts);
  await reloadTab();
}

async function saveEditQuestion() {
  const text = document.getElementById("qText")?.value.trim();
  const opts = getOptionValues();
  if (!text)          { alert("Ingrese el texto de la pregunta."); return; }
  if (opts.length < 2){ alert("Debe haber al menos 2 opciones.");  return; }
  showLoading("Guardando cambios...");
  await window._fb.updateQuestion(state.editingQuestion.id, text, opts);
  state.editingQuestion = null;
  await reloadTab();
}

function editQuestion(id) {
  const q = state._questions.find(q => q.id === id);
  state.editingQuestion = q ? { ...q, options: [...q.options] } : null;
  setHTML("questionForm", renderQuestionForm());
}

function cancelEdit() {
  state.editingQuestion = null;
  setHTML("questionForm", renderQuestionForm());
}

async function doToggleQuestion(id, closed) {
  showLoading(closed ? "Cerrando pregunta..." : "Abriendo pregunta...");
  await window._fb.toggleQuestion(id, closed);
  await reloadTab();
}

async function doDeleteQuestion(id) {
  if (!confirm("¿Eliminar esta pregunta y todos sus votos asociados?")) return;
  showLoading("Eliminando...");
  await window._fb.deleteQuestion(id);
  await reloadTab();
}

/* ══════════════════════════════════════════════════════
   RESULTADOS
   ══════════════════════════════════════════════════════ */
function renderResultsTab() {
  const questions  = state._questions;
  const votes      = state._votes;
  const totalCoeff = APARTMENTS_DATA.reduce((s,a) => s + a.coefficient, 0);

  return `
  <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
    <button class="btn btn-success btn-sm" onclick="exportVotes()">
      📥 Exportar Votos CSV
    </button>
    <button class="btn btn-primary btn-sm" onclick="exportResults()">
      📊 Exportar Resultados CSV
    </button>
  </div>

  ${questions.length === 0
    ? `<div class="card">
         <div class="card-body text-center text-gray" style="padding:40px">
           No hay preguntas configuradas aún.
         </div>
       </div>`
    : questions.map(q => {
        const qv         = votes.filter(v => v.qId === q.id);
        const uniqApts   = [...new Set(qv.map(v => v.aptCode))];
        const totalVoted = uniqApts.length;
        const totalCoeffV = uniqApts.reduce((s, code) => {
          const apt = APARTMENTS_DATA.find(a => a.code === code);
          return s + (apt ? apt.coefficient : 0);
        }, 0);

        return `
        <div class="card mb-4">
          <div class="card-header">
            <div>
              <h2>${esc(q.text)}</h2>
              <div class="text-xs text-gray" style="margin-top:4px">
                ${totalVoted} apartamento(s) han respondido esta pregunta
              </div>
            </div>
            ${q.closed
              ? `<span class="badge badge-danger">🔒 Cerrada</span>`
              : `<span class="badge badge-success">🟢 Abierta</span>`}
          </div>
          <div class="card-body">

            ${q.options.map((opt, oi) => {
              const ov       = qv.filter(v => v.option === opt);
              const oc       = ov.reduce((s,v) => s + v.coeff, 0);
              const pctApt   = totalVoted ? ((ov.length / totalVoted)  * 100).toFixed(1) : 0;
              const pctCoeff = totalCoeff ? ((oc       / totalCoeff)   * 100).toFixed(2) : 0;
              return `
              <div class="result-item">
                <div class="option-label">
                  <span class="font-bold">${esc(opt)}</span>
                  <span class="text-sm text-gray">
                    ${ov.length} voto(s) (${pctApt}%) · coeff ${oc.toFixed(2)} (${pctCoeff}%)
                  </span>
                </div>
                <div class="result-bar-wrap">
                  <div class="result-bar bar-${oi}" style="width:${pctApt}%">
                    ${pctApt > 6 ? pctApt + "%" : ""}
                  </div>
                </div>
              </div>`;
            }).join("")}

            <hr class="divider"/>
            <div class="text-sm text-gray">
              Participación: ${totalVoted} / ${APARTMENTS_DATA.length} apartamentos —
              ${totalCoeff ? ((totalCoeffV / totalCoeff) * 100).toFixed(2) : 0}%
              del coeficiente total
            </div>

            <!-- Detalle individual de votos -->
            <details style="margin-top:16px">
              <summary style="cursor:pointer;font-weight:700;color:var(--primary);
                              list-style:none;padding:8px 0">
                🔍 Ver detalle voto a voto ▾
              </summary>
              <div class="table-wrap" style="margin-top:12px">
                <table>
                  <thead>
                    <tr>
                      <th>Apartamento</th>
                      <th>Propietario</th>
                      <th>Respuesta</th>
                      <th>Coeficiente</th>
                      <th>Fecha y hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${qv.length === 0
                      ? `<tr>
                           <td colspan="5" class="text-center text-gray" style="padding:16px">
                             Sin votos registrados aún.
                           </td>
                         </tr>`
                      : qv
                          .sort((a,b) => new Date(b.votedAt) - new Date(a.votedAt))
                          .map(v => {
                            const apt = APARTMENTS_DATA.find(a => a.code === v.aptCode);
                            return `
                            <tr>
                              <td><span class="code-cell">${v.aptCode}</span></td>
                              <td class="text-sm">${apt ? esc(apt.owner) : "—"}</td>
                              <td>
                                <span class="badge badge-primary">${esc(v.option)}</span>
                              </td>
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

/* ── Exportaciones ── */
function exportCodes() {
  const used = state._used;
  let csv = "Apartamento,Propietario,Coeficiente,PIN,Estado,Fecha de Voto\n";
  APARTMENTS_DATA.forEach(a => {
    const u = used[a.code];
    csv += `"${a.code}","${a.owner}","${a.coefficient}","${a.pin}",` +
           `"${u ? "Votó" : "Pendiente"}","${u ? u.usedAt : ""}"\n`;
  });
  downloadCSV(csv, "codigos_votacion.csv");
}

function exportVotes() {
  let csv = "Apartamento,Propietario,Coeficiente,Pregunta,Respuesta,Fecha y Hora\n";
  state._votes.forEach(v => {
    const apt = APARTMENTS_DATA.find(a => a.code === v.aptCode);
    const q   = state._questions.find(q => q.id === v.qId);
    csv += `"${v.aptCode}","${apt?.owner || ""}","${v.coeff}",` +
           `"${q?.text || v.qId}","${v.option}","${v.votedAt}"\n`;
  });
  downloadCSV(csv, "votos_exportados.csv");
}

function exportResults() {
  const totalCoeff = APARTMENTS_DATA.reduce((s,a) => s + a.coefficient, 0);
  let csv = "Pregunta,Opción,Votos,% Votos,Coeficiente,% Coeficiente\n";
  state._questions.forEach(q => {
    const qv    = state._votes.filter(v => v.qId === q.id);
    const total = [...new Set(qv.map(v => v.aptCode))].length;
    q.options.forEach(opt => {
      const ov = qv.filter(v => v.option === opt);
      const oc = ov.reduce((s,v) => s + v.coeff, 0);
      csv += `"${q.text}","${opt}","${ov.length}",` +
             `"${total ? ((ov.length/total)*100).toFixed(1) : 0}%",` +
             `"${oc.toFixed(2)}",` +
             `"${totalCoeff ? ((oc/totalCoeff)*100).toFixed(2) : 0}%"\n`;
    });
  });
  downloadCSV(csv, "resultados_votacion.csv");
}

/* ══════════════════════════════════════════════════════
   PANTALLA DE VOTACIÓN
   ══════════════════════════════════════════════════════ */
function renderVoteScreen() {
  return `
  <div class="center-screen">
    <div class="login-card" style="max-width:480px">
      <div class="logo">
        <span class="emoji">🗳️</span>
        <h2>Multifamiliares La Posada</h2>
        <p>Sistema de Votación Digital</p>
      </div>
      ${ state.votingStep === "enter"   ? renderVoteEnter()
       : state.votingStep === "confirm" ? renderVoteConfirm()
       : state.votingStep === "vote"    ? renderVoteQuestion()
       : renderVoteSuccess() }
      <button class="btn"
        style="background:var(--gray-100);color:var(--gray-500);margin-top:16px;width:100%"
        onclick="state.view='home';render()">
        ← Volver al inicio
      </button>
    </div>
  </div>`;
}

function renderVoteEnter() {
  return `
  <p class="text-center text-gray" style="margin-bottom:16px">
    Ingrese su código PIN de 5 dígitos
  </p>
  <div class="code-input-wrap">
    <input class="code-input" type="tel" maxlength="5" id="pinInput"
      placeholder="_ _ _ _ _"
      oninput="this.value=this.value.replace(/\D/g,'')"
      onkeydown="if(event.key==='Enter')validatePin()"/>
  </div>
  <button class="btn btn-primary btn-lg w-full" onclick="validatePin()">
    🔍 Verificar Código
  </button>
  <div id="pinError"></div>`;
}

function renderVoteConfirm() {
  const a = state.currentApt;
  return `
  <p class="text-center text-gray" style="margin-bottom:16px">
    Confirme que estos son sus datos:
  </p>
  <div class="apt-confirm-card">
    <div class="apt-code">🏠 Apartamento ${a.code}</div>
    <div class="apt-owner" style="margin-top:8px">${esc(a.owner)}</div>
    <div class="apt-coeff" style="margin-top:4px">Coeficiente: ${a.coefficient}%</div>
  </div>
  <div class="alert alert-info" style="margin-bottom:16px">
    ℹ️ Verifique que este es su apartamento antes de continuar.
  </div>
  <div class="flex gap-2">
    <button class="btn btn-success btn-lg w-full" onclick="confirmApartment()">
      ✅ Sí, es correcto
    </button>
    <button class="btn btn-danger btn-lg"
      onclick="state.votingStep='enter';render()">✕</button>
  </div>`;
}

function renderVoteQuestion() {
  const q     = state.pendingQuestions[state.currentQIdx];
  if (!q) { completeVoting(); return ""; }
  const total = state.pendingQuestions.length;
  const idx   = state.currentQIdx;
  return `
  <div class="flex justify-between items-center" style="margin-bottom:12px">
    <span class="tag">Pregunta ${idx+1} de ${total}</span>
    <span class="tag">🏠 ${state.currentApt.code}</span>
  </div>
  <div class="progress-wrap" style="margin-bottom:16px">
    <div class="progress-bar" style="width:${(idx/total)*100}%"></div>
  </div>
  <h3 style="font-size:1.05rem;font-weight:700;color:var(--gray-900);
             margin-bottom:16px;text-align:center">
    ${esc(q.text)}
  </h3>
  <div class="vote-options">
    ${q.options.map((o,i) => `
      <div class="vote-option" id="vopt_${i}"
        onclick="selectOption(${i},'${esc(o)}')">${esc(o)}</div>
    `).join("")}
  </div>
  <button class="btn btn-primary btn-lg w-full" id="voteSubmitBtn"
    onclick="submitVote()" disabled style="margin-top:12px">
    Confirmar Voto →
  </button>
  <div id="voteMsg"></div>`;
}

function renderVoteSuccess() {
  return `
  <div class="success-screen">
    <span class="checkmark">🎉</span>
    <h2>¡Voto Registrado!</h2>
    <p>Su participación ha sido registrada exitosamente.</p>
    <p class="text-sm text-gray" style="margin-top:8px">
      Gracias, <strong>${esc(state.currentApt?.owner || "")}</strong>
    </p>
    <div style="margin-top:24px">
      <button class="btn btn-primary btn-lg" onclick="state.view='home';render()">
        🏠 Ir al Inicio
      </button>
    </div>
  </div>`;
}

/* ── Acciones de votación ── */
let selectedOption = null;

async function validatePin() {
  const pin   = document.getElementById("pinInput")?.value?.trim();
  const errEl = document.getElementById("pinError");

  if (!pin || pin.length !== 5) {
    setHTML("pinError", `<div class="alert alert-danger">⚠️ Ingrese un código de 5 dígitos.</div>`);
    return;
  }

  const apt = PIN_MAP[pin];
  if (!apt) {
    setHTML("pinError", `<div class="alert alert-danger">❌ Código no encontrado. Verifique e intente de nuevo.</div>`);
    return;
  }

  setHTML("pinError", `<div class="alert alert-info">⏳ Verificando...</div>`);

  try {
    const [questions, answeredIds] = await Promise.all([
      window._fb.getQuestions(),
      window._fb.getVotedQuestions(apt.code),
    ]);

    const openPending = questions.filter(q => !q.closed && !answeredIds.includes(q.id));

    if (openPending.length === 0) {
      setHTML("pinError", `
        <div class="alert alert-warning">
          ${answeredIds.length > 0
            ? "✅ Ya ha respondido todas las preguntas disponibles. ¡Gracias por participar!"
            : "⚠️ No hay preguntas abiertas en este momento. Intente más tarde."}
        </div>`);
      return;
    }

    state.currentApt       = apt;
    state.pendingQuestions = openPending;
    state.currentQIdx      = 0;
    state.votingStep       = "confirm";
    render();

  } catch(e) {
    setHTML("pinError", `<div class="alert alert-danger">❌ Error de conexión. Intente de nuevo.</div>`);
    console.error(e);
  }
}

function confirmApartment() {
  state.votingStep = "vote";
  selectedOption   = null;
  render();
}

function selectOption(idx, value) {
  selectedOption = value;
  document.querySelectorAll(".vote-option").forEach(el => el.classList.remove("selected"));
  document.getElementById(`vopt_${idx}`)?.classList.add("selected");
  const btn = document.getElementById("voteSubmitBtn");
  if (btn) btn.disabled = false;
}

async function submitVote() {
  if (!selectedOption) return;
  const q   = state.pendingQuestions[state.currentQIdx];
  const apt = state.currentApt;
  const btn = document.getElementById("voteSubmitBtn");
  const msg = document.getElementById("voteMsg");

  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await window._fb.saveVote(apt.code, q.id, selectedOption, apt.coefficient);
    await window._fb.markUsed(apt.code);

    selectedOption = null;
    state.currentQIdx++;

    if (state.currentQIdx >= state.pendingQuestions.length) {
      completeVoting();
    } else {
      render();
    }
  } catch(e) {
    setHTML("voteMsg",
      `<div class="alert alert-danger">❌ Error al guardar el voto. Intente de nuevo.</div>`);
    if (btn) { btn.disabled = false; btn.textContent = "Confirmar Voto →"; }
    console.error(e);
  }
}

function completeVoting() { state.votingStep = "success"; render(); }

function bindVote() {
  if (state.votingStep === "enter")
    setTimeout(() => document.getElementById("pinInput")?.focus(), 50);
  selectedOption = null;
}

/* ══════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════ */
render();
