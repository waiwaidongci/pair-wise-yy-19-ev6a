"use strict";

/*
 * 界面层：负责录入、编辑、复核、筛选、对比与导出的渲染和事件。
 * 存储走 Store，准入/对比资格判定走 Policy，本文件不内嵌业务规则。
 */
(() => {
  const state = Store.load();

  const form = document.querySelector("#sampleForm");
  const photoInput = document.querySelector("#photoInput");
  const metricFields = document.querySelector("#metricFields");
  const formTitle = document.querySelector("#formTitle");
  const formHint = document.querySelector("#formHint");
  const submitBtn = document.querySelector("#submitBtn");
  const cancelEditBtn = document.querySelector("#cancelEditBtn");
  const sampleGrid = document.querySelector("#sampleGrid");
  const comparePane = document.querySelector("#comparePane");
  const mineralFilter = document.querySelector("#mineralFilter");
  const polarFilter = document.querySelector("#polarFilter");
  const statusFilter = document.querySelector("#statusFilter");
  const exportBtn = document.querySelector("#exportBtn");

  const reviewDialog = document.querySelector("#reviewDialog");
  const reviewForm = document.querySelector("#reviewForm");
  const reviewTitle = document.querySelector("#reviewTitle");
  const reviewReasons = document.querySelector("#reviewReasons");
  const reviewOperator = document.querySelector("#reviewOperator");
  const reviewExposure = document.querySelector("#reviewExposure");
  const reviewScale = document.querySelector("#reviewScale");
  const reviewFieldWidth = document.querySelector("#reviewFieldWidth");
  const reviewReviewer = document.querySelector("#reviewReviewer");
  const reviewError = document.querySelector("#reviewError");

  let pendingPhoto = "";
  let editingId = null;
  let reviewingId = null;

  const STATUS_LABELS = {
    [Policy.STATUS_PENDING]: "待复核",
    [Policy.STATUS_QUALIFIED]: "合格"
  };

  function persist() {
    state.compare = Policy.reconcileCompare(state.samples, state.compare);
    Store.save(state);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.readAsDataURL(file);
    });
  }

  function numberOrNull(formData, name) {
    const raw = formData.get(name);
    if (raw === null || String(raw).trim() === "") return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }

  function formatMetric(value, unit) {
    return Number.isFinite(value) ? `${value}${unit}` : "未记录";
  }

  function readBaseForm(data) {
    return {
      code: data.get("code").trim(),
      location: data.get("location").trim(),
      magnification: data.get("magnification").trim(),
      polarization: data.get("polarization"),
      minerals: data.get("minerals").trim(),
      texture: data.get("texture").trim(),
      comment: data.get("comment").trim()
    };
  }

  function filteredSamples() {
    return state.samples.filter((sample) => Policy.matchesFilters(sample, {
      mineral: mineralFilter.value.trim(),
      polarization: polarFilter.value,
      status: statusFilter.value
    }));
  }

  function renderCards() {
    const rows = filteredSamples();
    if (!rows.length) {
      sampleGrid.innerHTML = "<p class=\"empty-tip\">没有符合筛选条件的样本。</p>";
      return;
    }

    sampleGrid.innerHTML = rows.map((sample) => {
      const qualified = Policy.isQualified(sample);
      const failures = Policy.admissionFailures(sample);
      const compareChecked = state.compare.includes(sample.id);
      const reasonHtml = qualified
        ? ""
        : `<p class="admission-reason">准入未过：${failures.map(escapeHtml).join("、")}</p>`;
      const reviewHtml = sample.review
        ? `<p class="review-line">复核：${escapeHtml(sample.review.reviewer)} · 标尺 ${escapeHtml(String(sample.review.scaleLength))}µm · 曝光 ${escapeHtml(String(sample.review.exposure))}</p>`
        : "";

      return `
      <article class="sample-card ${qualified ? "is-qualified" : "is-pending"}">
        ${sample.photo ? `<img src="${sample.photo}" alt="${escapeHtml(sample.code)}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
        <div class="sample-body">
          <div class="card-head">
            <h3>${escapeHtml(sample.code)}</h3>
            <span class="badge ${qualified ? "badge-ok" : "badge-pending"}">${STATUS_LABELS[qualified ? Policy.STATUS_QUALIFIED : Policy.STATUS_PENDING]}</span>
          </div>
          <p>${escapeHtml(sample.location) || "未记录地点"} · ${escapeHtml(sample.magnification) || "未记录倍数"} · ${escapeHtml(sample.polarization) || "未记录偏光"}</p>
          <p>标尺 ${escapeHtml(formatMetric(sample.scaleLength, "µm"))} · 视野宽 ${escapeHtml(formatMetric(sample.fieldWidth, "µm"))} · 曝光 ${Number.isFinite(sample.exposure) ? escapeHtml(String(sample.exposure)) : "未记录"}</p>
          <p>录入：${escapeHtml(sample.operator) || "未记录"}</p>
          <p>矿物：${escapeHtml(sample.minerals) || "未记录"}</p>
          <p>结构：${escapeHtml(sample.texture) || "未记录"}</p>
          <p>${escapeHtml(sample.comment) || "未填写批注"}</p>
          ${reasonHtml}
          ${reviewHtml}
          <div class="card-actions">
            ${qualified
              ? `<label><input type="checkbox" data-compare="${sample.id}" ${compareChecked ? "checked" : ""}>对比</label>`
              : `<button type="button" class="review-btn" data-review="${sample.id}">提交复核</button>`}
            <span class="action-spacer"></span>
            <button type="button" class="edit-btn" data-edit="${sample.id}">编辑</button>
            <button type="button" class="delete-btn" data-delete="${sample.id}">删除</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  function renderCompare() {
    const compareSamples = Policy.reconcileCompare(state.samples, state.compare)
      .map((id) => state.samples.find((sample) => sample.id === id))
      .filter(Boolean)
      .slice(0, 2);

    comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => `
      <article class="compare-item">
        ${sample.photo ? `<img src="${sample.photo}" alt="${escapeHtml(sample.code)}对比图">` : ""}
        <h3>${escapeHtml(sample.code)}</h3>
        <p>${escapeHtml(sample.polarization)} · ${escapeHtml(sample.minerals) || "未记录矿物"}</p>
        <p>${escapeHtml(sample.texture) || "未记录结构"}</p>
      </article>
    `).join("") : "<p>合格样本勾选对比后，最多两张在此并排展示；待复核样本不能对比。</p>";
  }

  function render() {
    renderCards();
    renderCompare();
  }

  function resetFormMode() {
    editingId = null;
    pendingPhoto = "";
    form.reset();
    photoInput.value = "";
    metricFields.disabled = false;
    formTitle.textContent = "样本录入";
    formHint.textContent = "标尺缺失或曝光不在 40-80 区间时，照片只进待复核，不能对比或导出。";
    submitBtn.textContent = "保存样本";
    cancelEditBtn.hidden = true;
  }

  function enterEditMode(sample) {
    editingId = sample.id;
    form.reset();
    form.querySelector("[name=code]").value = sample.code;
    form.querySelector("[name=location]").value = sample.location || "";
    form.querySelector("[name=magnification]").value = sample.magnification || "";
    form.querySelector("[name=polarization]").value = sample.polarization;
    form.querySelector("[name=minerals]").value = sample.minerals || "";
    form.querySelector("[name=texture]").value = sample.texture || "";
    form.querySelector("[name=comment]").value = sample.comment || "";
    // 标尺/视野/曝光/录入人在入库时登记；修改走复核通道，编辑时锁定。
    metricFields.disabled = true;
    pendingPhoto = "";
    photoInput.value = "";
    formTitle.textContent = `编辑样本 · ${sample.code}`;
    formHint.textContent = "重传照片、修改倍数或偏光会让旧复核及对比选择失效；标尺与曝光的修正请走复核。";
    submitBtn.textContent = "保存修改";
    cancelEditBtn.hidden = false;
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

    if (editingId) {
      const current = state.samples.find((sample) => sample.id === editingId);
      if (!current) {
        resetFormMode();
        return;
      }
      const patch = {
        ...readBaseForm(data),
        photo: pendingPhoto || current.photo
      };
      // 存储前由判定层决定复核是否失效；失效则清复核、回待复核，对比选择由 persist 统一剔除。
      if (Policy.invalidatesReview(current, patch)) {
        patch.status = Policy.STATUS_PENDING;
        patch.review = null;
      }
      Store.replaceSample(state, editingId, patch);
      editingId = null;
      resetFormMode();
      persist();
      render();
      return;
    }

    const metrics = {
      scaleLength: numberOrNull(data, "scaleLength"),
      fieldWidth: numberOrNull(data, "fieldWidth"),
      exposure: numberOrNull(data, "exposure"),
      operator: data.get("operator").trim()
    };
    const sample = {
      id: crypto.randomUUID(),
      photo: pendingPhoto,
      ...readBaseForm(data),
      ...metrics,
      review: null,
      createdAt: new Date().toISOString()
    };
    sample.status = Policy.admissionFailures(sample).length
      ? Policy.STATUS_PENDING
      : Policy.STATUS_QUALIFIED;
    Store.addSample(state, sample);
    resetFormMode();
    persist();
    render();
  });

  cancelEditBtn.addEventListener("click", () => {
    resetFormMode();
  });

  sampleGrid.addEventListener("click", (event) => {
    const { delete: deleteId, edit: editIdBtn, review: reviewId } = event.target.dataset;

    if (deleteId) {
      Store.removeSample(state, deleteId);
      if (editingId === deleteId) resetFormMode();
      persist();
      render();
      return;
    }

    if (editIdBtn) {
      const target = state.samples.find((sample) => sample.id === editIdBtn);
      if (target) enterEditMode(target);
      return;
    }

    if (reviewId) {
      openReview(reviewId);
    }
  });

  sampleGrid.addEventListener("change", (event) => {
    const id = event.target.dataset.compare;
    if (!id) return;
    const sample = state.samples.find((item) => item.id === id);
    if (!sample || !Policy.isQualified(sample)) return;
    if (event.target.checked) {
      state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, 2);
    } else {
      state.compare = state.compare.filter((item) => item !== id);
    }
    persist();
    render();
  });

  function openReview(id) {
    const sample = state.samples.find((item) => item.id === id);
    if (!sample) return;
    reviewingId = id;
    reviewTitle.textContent = `复核样本 · ${sample.code}`;
    reviewReasons.textContent = Policy.admissionFailures(sample).join("、") || "数据已满足入库条件";
    reviewOperator.textContent = sample.operator || "未记录";
    reviewError.textContent = "";
    reviewForm.reset();
    reviewScale.value = Number.isFinite(sample.scaleLength) ? sample.scaleLength : "";
    reviewFieldWidth.value = Number.isFinite(sample.fieldWidth) ? sample.fieldWidth : "";
    reviewExposure.value = Number.isFinite(sample.exposure) ? sample.exposure : "";
    reviewReviewer.value = "";
    reviewDialog.showModal();
  }

  reviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const sample = state.samples.find((item) => item.id === reviewingId);
    if (!sample) {
      reviewDialog.close();
      return;
    }
    const data = new FormData(reviewForm);
    const correction = {
      reviewer: data.get("reviewer"),
      scaleLength: numberOrNull(data, "scaleLength"),
      fieldWidth: numberOrNull(data, "fieldWidth"),
      exposure: numberOrNull(data, "exposure")
    };
    const issues = Policy.reviewIssues(sample, correction);
    if (issues.length) {
      reviewError.textContent = issues.join("；");
      return;
    }
    Store.replaceSample(state, sample.id, Policy.applyReview(sample, correction));
    reviewingId = null;
    reviewError.textContent = "";
    persist();
    render();
    reviewDialog.close();
  });

  reviewDialog.addEventListener("close", () => {
    reviewingId = null;
  });

  document.querySelector("#reviewCancelBtn").addEventListener("click", () => {
    reviewDialog.close();
  });

  [mineralFilter, polarFilter, statusFilter].forEach((field) => {
    field.addEventListener("input", render);
  });

  exportBtn.addEventListener("click", () => {
    // 只有合格样本可导出；待复核样本被排除。
    const checklist = state.samples.filter(Policy.isQualified).map((sample) => ({
      样本编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      偏光类型: sample.polarization,
      标尺长度_微米: sample.scaleLength,
      视野宽度_微米: sample.fieldWidth,
      曝光值: sample.exposure,
      录入人: sample.operator,
      复核人: sample.review ? sample.review.reviewer : "",
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      老师批注: sample.comment
    }));
    const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "thin-section-checklist.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  persist();
  render();
})();
