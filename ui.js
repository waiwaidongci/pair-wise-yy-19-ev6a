// 界面层：只负责 DOM 与事件。持久化交给 Store，准入与失效判定交给 Rules。
const state = Rules.normalizeState(Store.load());
Store.save(state);

const form = document.querySelector("#sampleForm");
const formTitle = document.querySelector("#formTitle");
const submitBtn = document.querySelector("#submitBtn");
const cancelEditBtn = document.querySelector("#cancelEditBtn");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");
const statusFilter = document.querySelector("#statusFilter");
const exportNote = document.querySelector("#exportNote");

let pendingPhoto = "";
let editingId = null;
const reviewDrafts = {}; // 校验未通过的复核草稿，重渲染时保留输入
const reviewErrors = {};

function persist() {
  Rules.normalizeState(state);
  Store.save(state);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function parseNumber(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function fmtMicron(value) {
  return value === null || value === undefined ? "未登记" : `${value} µm`;
}

function filteredSamples() {
  const { mineral, polarization, status } = state.filters;
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || (sample.minerals || "").includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    const statusMatch = !status || Rules.judge(sample).status === status;
    return mineralMatch && polarMatch && statusMatch;
  });
}

function reviewFormHtml(sample) {
  const values = Rules.effectiveValues(sample);
  const draft = reviewDrafts[sample.id] || {};
  const errors = reviewErrors[sample.id] || [];
  const scale = draft.scaleLength ?? values.scaleLength ?? "";
  const exposure = draft.exposure ?? values.exposure ?? "";
  const reviewer = draft.reviewer ?? "";
  return `
    <form class="review-form" data-review-form="${sample.id}">
      <p class="review-title">复核修正</p>
      <label>修正标尺长度（µm）<input name="scaleLength" type="number" min="0" step="any" value="${scale}"></label>
      <label>修正曝光值<input name="exposure" type="number" min="0" max="100" step="any" value="${exposure}"></label>
      <label>复核人<input name="reviewer" value="${esc(reviewer)}" placeholder="须与录入人不同"></label>
      ${errors.length ? `<p class="review-errors">${errors.map(esc).join("；")}</p>` : ""}
      <button type="submit">提交复核</button>
    </form>`;
}

function renderCard(sample) {
  const { status, issues } = Rules.judge(sample);
  const values = Rules.effectiveValues(sample);
  const approved = status === "approved";
  const reviewed = Boolean(sample.review);
  const corrected = reviewed ? "（复核修正）" : "";
  return `
    <article class="sample-card${approved ? "" : " is-pending"}">
      ${sample.photo ? `<img src="${sample.photo}" alt="${esc(sample.code)}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      <div class="sample-body">
        <div class="card-head">
          <h3>${esc(sample.code)}</h3>
          <span class="badge ${status}">${approved ? "已准入" : "待复核"}</span>
        </div>
        <p>${esc(sample.location) || "未记录地点"} · ${esc(sample.magnification) || "未记录倍数"} · ${esc(sample.polarization)}</p>
        <p>标尺：${fmtMicron(values.scaleLength)}${corrected} · 视野：${fmtMicron(values.fieldWidth)} · 曝光：${values.exposure ?? "未登记"}${corrected}</p>
        <p>录入人：${esc(sample.enteredBy) || "未登记"}${reviewed ? ` · 复核人：${esc(sample.review.reviewer)}` : ""}</p>
        <p>矿物：${esc(sample.minerals) || "未记录"}</p>
        <p>结构：${esc(sample.texture) || "未记录"}</p>
        <p>${esc(sample.comment) || "未填写批注"}</p>
        ${approved ? "" : `<p class="issues">待复核原因：${issues.join("、")}</p>`}
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""} ${approved ? "" : "disabled"}>对比</label>
          <button type="button" data-edit="${sample.id}">编辑</button>
          <button type="button" data-delete="${sample.id}">删除</button>
        </div>
        ${approved ? "" : reviewFormHtml(sample)}
      </div>
    </article>`;
}

function render() {
  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length
    ? rows.map(renderCard).join("")
    : "<p>还没有符合条件的样本。</p>";

  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .filter(Rules.canCompare)
    .slice(0, Rules.MAX_COMPARE);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => {
    const values = Rules.effectiveValues(sample);
    return `
      <article class="compare-item">
        ${sample.photo ? `<img src="${sample.photo}" alt="${esc(sample.code)}对比图">` : ""}
        <h3>${esc(sample.code)}</h3>
        <p>${esc(sample.polarization)} · ${esc(sample.minerals) || "未记录矿物"}</p>
        <p>标尺：${fmtMicron(values.scaleLength)} · 曝光：${values.exposure ?? "未登记"}</p>
        <p>${esc(sample.texture) || "未记录结构"}</p>
      </article>`;
  }).join("") : "<p>勾选两张已准入样本卡片后可并排对比。</p>";

  const pendingCount = state.samples.filter((sample) => Rules.judge(sample).status === "pending").length;
  exportNote.textContent = pendingCount ? `${pendingCount} 张待复核照片不参与对比与导出` : "";
}

function exitEditMode() {
  editingId = null;
  formTitle.textContent = "样本录入";
  submitBtn.textContent = "保存样本";
  cancelEditBtn.hidden = true;
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
}

function startEdit(sample) {
  editingId = sample.id;
  formTitle.textContent = `编辑样本 ${sample.code}`;
  submitBtn.textContent = "保存修改";
  cancelEditBtn.hidden = false;
  form.elements.code.value = sample.code;
  form.elements.location.value = sample.location;
  form.elements.magnification.value = sample.magnification;
  form.elements.polarization.value = sample.polarization;
  form.elements.scaleLength.value = sample.scaleLength ?? "";
  form.elements.fieldWidth.value = sample.fieldWidth ?? "";
  form.elements.exposure.value = sample.exposure ?? "";
  form.elements.enteredBy.value = sample.enteredBy;
  form.elements.minerals.value = sample.minerals;
  form.elements.texture.value = sample.texture;
  form.elements.comment.value = sample.comment;
  pendingPhoto = "";
  photoInput.value = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

photoInput.addEventListener("change", async () => {
  pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput.files[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  const draft = {
    photo: pendingPhoto,
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    scaleLength: parseNumber(data.get("scaleLength")),
    fieldWidth: parseNumber(data.get("fieldWidth")),
    exposure: parseNumber(data.get("exposure")),
    enteredBy: data.get("enteredBy").trim(),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim()
  };
  if (editingId) {
    const sample = state.samples.find((item) => item.id === editingId);
    if (sample) {
      const before = Object.assign({}, sample);
      Object.assign(sample, draft, {
        photo: draft.photo || sample.photo, // 未选新照片则保留原图
        updatedAt: new Date().toISOString()
      });
      if (Rules.reviewInvalidated(before, sample)) {
        sample.review = null; // 旧复核失效
        state.compare = state.compare.filter((id) => id !== sample.id); // 对比选择失效
      }
    }
  } else {
    state.samples.unshift(Object.assign({
      id: crypto.randomUUID(),
      review: null,
      createdAt: new Date().toISOString(),
      updatedAt: null
    }, draft));
  }
  exitEditMode();
  persist();
  render();
});

sampleGrid.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.delete;
  const editId = event.target.dataset.edit;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    delete reviewDrafts[deleteId];
    delete reviewErrors[deleteId];
    if (deleteId === editingId) exitEditMode();
    persist();
    render();
  } else if (editId) {
    const sample = state.samples.find((item) => item.id === editId);
    if (sample) startEdit(sample);
  }
});

sampleGrid.addEventListener("change", (event) => {
  const id = event.target.dataset.compare;
  if (!id) return;
  const sample = state.samples.find((item) => item.id === id);
  if (!sample || !Rules.canCompare(sample)) return; // 待复核不参与对比
  if (event.target.checked) {
    state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, Rules.MAX_COMPARE);
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  persist();
  render();
});

sampleGrid.addEventListener("submit", (event) => {
  const id = event.target.dataset.reviewForm;
  if (!id) return;
  event.preventDefault();
  const sample = state.samples.find((item) => item.id === id);
  if (!sample) return;
  const data = new FormData(event.target);
  const draft = {
    scaleLength: parseNumber(data.get("scaleLength")),
    exposure: parseNumber(data.get("exposure")),
    reviewer: (data.get("reviewer") || "").trim()
  };
  const result = Rules.validateReview(sample, draft);
  if (!result.ok) {
    reviewDrafts[id] = draft;
    reviewErrors[id] = result.errors;
    render();
    return;
  }
  sample.review = {
    scaleLength: draft.scaleLength,
    exposure: draft.exposure,
    reviewer: result.reviewer,
    reviewedAt: new Date().toISOString()
  };
  delete reviewDrafts[id];
  delete reviewErrors[id];
  persist();
  render();
});

function syncFilters() {
  state.filters = {
    mineral: mineralFilter.value.trim(),
    polarization: polarFilter.value,
    status: statusFilter.value
  };
  persist();
  render();
}

mineralFilter.value = state.filters.mineral;
polarFilter.value = state.filters.polarization;
statusFilter.value = state.filters.status;
[mineralFilter, polarFilter, statusFilter].forEach((field) => field.addEventListener("input", syncFilters));

cancelEditBtn.addEventListener("click", exitEditMode);

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = state.samples.filter(Rules.canExport).map((sample) => {
    const values = Rules.effectiveValues(sample);
    return {
      样本编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      偏光类型: sample.polarization,
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      老师批注: sample.comment,
      标尺长度µm: values.scaleLength,
      视野宽度µm: values.fieldWidth,
      曝光值: values.exposure,
      录入人: sample.enteredBy,
      复核人: sample.review ? sample.review.reviewer : "",
      复核时间: sample.review ? sample.review.reviewedAt : ""
    };
  });
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

render();
