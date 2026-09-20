"use strict";

/* 界面层冒烟测试：用极简 DOM 桩跑通录入/复核/失效/筛选/导出路径。 */

const store = {};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }
};

function makeElement(id, tag = "div") {
  return {
    id,
    tagName: tag.toUpperCase(),
    innerHTML: "",
    textContent: "",
    value: "",
    files: [],
    hidden: false,
    disabled: false,
    checked: false,
    dataset: {},
    listeners: {},
    querySelector(sel) {
      const name = sel.match(/\[name=(.+)\]/);
      if (name) return this.fields[name[1]] || (this.fields[name[1]] = makeElement(name[1], "input"));
      if (elements[sel.slice(1)]) return elements[sel.slice(1)];
      return makeElement(sel);
    },
    fields: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    dispatch(type, event = {}) {
      event.preventDefault = event.preventDefault || (() => {});
      (this.listeners[type] || []).forEach((fn) => fn(event));
    },
    reset() {
      Object.values(this.fields).forEach((field) => { field.value = ""; });
    },
    showModal() { this.open = true; },
    close() { this.open = false; this.dispatch("close"); }
  };
}

const elements = {};
const ids = ["sampleForm", "photoInput", "metricFields", "formTitle", "formHint", "submitBtn",
  "cancelEditBtn", "sampleGrid", "comparePane", "mineralFilter", "polarFilter", "statusFilter",
  "exportBtn", "reviewDialog", "reviewForm", "reviewTitle", "reviewReasons", "reviewOperator",
  "reviewExposure", "reviewScale", "reviewFieldWidth", "reviewReviewer", "reviewError",
  "reviewCancelBtn"];
ids.forEach((id) => { elements[id] = makeElement(id, id.includes("Btn") ? "button" : "div"); });
elements.sampleForm.fields = {};
elements.reviewForm.fields = {};
["scaleLength", "fieldWidth", "exposure", "reviewer"].forEach((name) => {
  elements.reviewForm.fields[name] = makeElement(name, "input");
});

globalThis.document = {
  querySelector(sel) {
    if (sel.startsWith("#")) return elements[sel.slice(1)];
    return makeElement(sel);
  },
  createElement(tag) {
    const el = makeElement("link-" + tag, tag);
    el.click = () => { (this._clicks ||= []).push(el); };
    return el;
  }
};
// Node 20 自带 webcrypto.randomUUID，界面层可直接使用。
let downloads = [];
globalThis.Blob = class Blob { constructor(parts) { this.text = parts.join(""); } };
globalThis.URL = { createObjectURL: (blob) => { downloads.push(blob.text); return "blob:x"; }, revokeObjectURL: () => {} };
globalThis.FormData = class FormData {
  constructor(form) {
    this.values = {};
    Object.entries(form.fields || {}).forEach(([name, el]) => { this.values[name] = el.value; });
  }
  get(name) { return this.values[name] ?? ""; }
};

require("./storage.js");
require("./policy.js");
require("./app.js");

function submitSample(values) {
  const form = elements.sampleForm;
  Object.entries(values).forEach(([name, value]) => {
    form.fields[name] = form.fields[name] || makeElement(name);
    form.fields[name].value = value;
  });
  elements.photoInput.files = [];
  form.dispatch("submit");
}

let passed = 0;
function check(name, cond) {
  if (!cond) throw new Error(`失败: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 1) 标尺缺失 -> 待复核，无对比勾选框，不能导出
submitSample({
  code: "BX-01", location: "东侧", magnification: "40x", polarization: "单偏光",
  minerals: "石英", texture: "粒状", comment: "",
  scaleLength: "", fieldWidth: "450", exposure: "60", operator: "张三"
});
check("待复核卡片渲染", elements.sampleGrid.innerHTML.includes("待复核") && elements.sampleGrid.innerHTML.includes("标尺缺失"));
check("待复核无对比勾选框(有复核按钮)", elements.sampleGrid.innerHTML.includes("提交复核") && !elements.sampleGrid.innerHTML.includes("data-compare"));
elements.exportBtn.dispatch("click");
check("待复核不进导出", JSON.parse(downloads[0]).length === 0);

// 2) 合格样本 -> 可对比
submitSample({
  code: "BX-02", location: "西侧", magnification: "100x", polarization: "正交偏光",
  minerals: "黑云母", texture: "鳞片", comment: "",
  scaleLength: "100", fieldWidth: "450", exposure: "45", operator: "李四"
});
check("合格卡片带对比勾选框", elements.sampleGrid.innerHTML.includes("data-compare"));
elements.exportBtn.dispatch("click");
check("导出仅含合格样本", JSON.parse(downloads[1]).length === 1 && JSON.parse(downloads[1])[0].样本编号 === "BX-02");

// 3) 筛选：按状态只看待复核
elements.statusFilter.value = "pending";
elements.statusFilter.dispatch("input");
check("状态筛选后只剩待复核", elements.sampleGrid.innerHTML.includes("BX-01") && !elements.sampleGrid.innerHTML.includes("BX-02"));
elements.statusFilter.value = "";
elements.statusFilter.dispatch("input");

// 4) 复核：同复核人被拒；不同复核人通过
const grid = elements.sampleGrid;
const reviewClickTarget = { dataset: { review: JSON.parse(localStorage.getItem(Store.STORAGE_KEY)).samples.find((s) => s.code === "BX-01").id } };
grid.dispatch("click", { target: reviewClickTarget });
check("复核弹窗打开并带原因", elements.reviewDialog.open && elements.reviewReasons.textContent.includes("标尺缺失"));

function submitReview(values, reviewer) {
  const form = elements.reviewForm;
  form.fields.scaleLength.value = values.scale;
  form.fields.fieldWidth.value = values.fieldWidth;
  form.fields.exposure.value = values.exposure;
  form.fields.reviewer.value = reviewer;
  form.dispatch("submit");
}
submitReview({ scale: "", fieldWidth: "450", exposure: "60" }, "张三");
check("同录入人复核被拒且弹窗不关闭", !elements.reviewError.textContent === false && elements.reviewDialog.open);
submitReview({ scale: "120", fieldWidth: "450", exposure: "60" }, "王五");
check("不同复核人+合规修正 -> 通过关闭弹窗", !elements.reviewDialog.open && elements.reviewError.textContent === "");
const saved = JSON.parse(localStorage.getItem(Store.STORAGE_KEY));
const reviewedSample = saved.samples.find((s) => s.code === "BX-01");
check("复核后状态合格且留痕", reviewedSample.status === "qualified" && reviewedSample.review.reviewer === "王五" && reviewedSample.scaleLength === 120);

// 5) 改倍数 -> 旧复核失效、退出对比
Store; // 层已加载
const persisted = JSON.parse(localStorage.getItem(Store.STORAGE_KEY));
const bx01 = persisted.samples.find((s) => s.code === "BX-01");
persisted.compare = [bx01.id];
localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(persisted));
// 模拟编辑：点击编辑按钮后改倍数提交（页面内 state 仍持有原数据）
grid.dispatch("click", { target: { dataset: { edit: bx01.id } } });
check("进入编辑模式且标尺字段锁定", elements.formTitle.textContent.includes("BX-01") && elements.metricFields.disabled === true);
["code", "location", "magnification", "polarization", "minerals", "texture", "comment"].forEach((name) => {
  elements.sampleForm.fields[name] = elements.sampleForm.fields[name] || makeElement(name);
});
elements.sampleForm.fields.magnification.value = "200x";
elements.photoInput.files = [];
elements.sampleForm.dispatch("submit");
const afterEdit = JSON.parse(localStorage.getItem(Store.STORAGE_KEY));
const edited = afterEdit.samples.find((s) => s.code === "BX-01");
check("改倍数后回待复核、复核清空、退出对比", edited.status === "pending" && edited.review === null && afterEdit.compare.length === 0);
check("编辑后表单复位", elements.metricFields.disabled === false && elements.cancelEditBtn.hidden === true);

console.log(`\n界面冒烟全部通过：${passed} 项检查`);
