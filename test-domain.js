"use strict";

/* 存储层 + 判定层的规则闭环测试（node test-domain.js），不依赖浏览器。 */

const store = {};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; }
};

require("./storage.js");
require("./policy.js");

let passed = 0;
function check(name, condition) {
  if (!condition) throw new Error(`失败: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}
function makeSample(patch = {}) {
  return {
    id: patch.id || cryptoId(),
    photo: "data:image/png;base64,AAAA",
    code: "BX-01",
    location: "剖面东侧",
    magnification: "40x",
    polarization: "单偏光",
    minerals: "石英",
    texture: "粒状",
    comment: "",
    scaleLength: 100,
    fieldWidth: 450,
    exposure: 60,
    operator: "张三",
    status: "qualified",
    review: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    ...patch
  };
}
let counter = 0;
function cryptoId() { counter += 1; return `id-${counter}`; }

console.log("存储层迁移");
{
  store[Store.STORAGE_KEY] = JSON.stringify({
    samples: [{ id: "legacy", code: "OLD-1", polarization: "单偏光", minerals: "" }],
    compare: ["legacy", "ghost-id"]
  });
  const state = Store.load();
  check("旧版本样本补字段", state.samples[0].scaleLength === null && state.samples[0].exposure === null);
  check("旧版本样本一律待复核", state.samples[0].status === "pending");
  check("版本号升级", state.version === 2);

  store[Store.STORAGE_KEY] = "not-json";
  check("损坏数据回落到空库", Store.load().samples.length === 0);
}

console.log("准入判定");
{
  check("标尺与曝光合格 -> 无未过项", Policy.admissionFailures(makeSample()).length === 0);
  check("标尺缺失 -> 待复核原因", Policy.admissionFailures(makeSample({ scaleLength: null })).includes("标尺缺失"));
  check("曝光 39 -> 不准入", Policy.admissionFailures(makeSample({ exposure: 39 })).length === 1);
  check("曝光 40 -> 临界合格", Policy.admissionFailures(makeSample({ exposure: 40 })).length === 0);
  check("曝光 80 -> 临界合格", Policy.admissionFailures(makeSample({ exposure: 80 })).length === 0);
  check("曝光 81 -> 不准入", Policy.admissionFailures(makeSample({ exposure: 81 })).length === 1);
  check("曝光非数字 -> 不准入", Policy.admissionFailures(makeSample({ exposure: null })).length === 1);
  check("标称合格但数据被改坏 -> isQualified 为 false",
    Policy.isQualified(makeSample({ status: "qualified", exposure: 20 })) === false);
}

console.log("复核闭环");
{
  const pending = makeSample({ status: "pending", exposure: 95, review: null });
  check("复核人缺失 -> 不通过", Policy.reviewIssues(pending, { reviewer: "  ", scaleLength: 100, fieldWidth: 450, exposure: 60 }).length > 0);
  check("复核人=录入人 -> 不通过", Policy.reviewIssues(pending, { reviewer: "张三", scaleLength: 100, fieldWidth: 450, exposure: 60 }).length > 0);
  check("修正后曝光仍超标 -> 不通过", Policy.reviewIssues(pending, { reviewer: "李四", scaleLength: 100, fieldWidth: 450, exposure: 90 }).length > 0);
  check("修正标尺缺失 -> 不通过", Policy.reviewIssues(pending, { reviewer: "李四", scaleLength: null, fieldWidth: 450, exposure: 60 }).length > 0);
  check("视野宽度修正缺失 -> 不通过", Policy.reviewIssues(pending, { reviewer: "李四", scaleLength: 100, fieldWidth: null, exposure: 60 }).length > 0);
  check("不同复核人+合规修正 -> 无问题", Policy.reviewIssues(pending, { reviewer: "李四", scaleLength: 120, fieldWidth: 460, exposure: 55 }).length === 0);

  const reviewed = Policy.applyReview(pending, { reviewer: "李四", scaleLength: 120, fieldWidth: 460, exposure: 55 });
  check("复核后合格", Policy.isQualified(reviewed) === true);
  check("复核记录留存修正值与复核人", reviewed.review.reviewer === "李四" && reviewed.review.scaleLength === 120 && reviewed.review.exposure === 55);
  check("修正值覆盖原值", reviewed.exposure === 55 && reviewed.scaleLength === 120);
}

console.log("编辑失效规则");
{
  const reviewed = makeSample({ status: "qualified", exposure: 55, review: { reviewer: "李四" } });
  check("重传照片 -> 复核失效", Policy.invalidatesReview(reviewed, { photo: "data:new" }) === true);
  check("修改倍数 -> 复核失效", Policy.invalidatesReview(reviewed, { magnification: "100x" }) === true);
  check("修改偏光 -> 复核失效", Policy.invalidatesReview(reviewed, { polarization: "正交偏光" }) === true);
  check("只改批注 -> 复核保留", Policy.invalidatesReview(reviewed, { comment: "补充说明" }) === false);
  check("照片字段相同 -> 不失效", Policy.invalidatesReview(reviewed, { photo: reviewed.photo }) === false);
}

console.log("对比资格重算（筛选/对比/刷新后一致）");
{
  const ok1 = makeSample({ id: "ok1", status: "qualified" });
  const ok2 = makeSample({ id: "ok2", status: "qualified", exposure: 45 });
  const bad = makeSample({ id: "bad", status: "pending", exposure: 10 });
  const samples = [ok1, ok2, bad];
  check("待复核与不存在 id 被剔除", JSON.stringify(Policy.reconcileCompare(samples, ["ok1", "bad", "ghost"])) === JSON.stringify(["ok1"]));
  const spoiled = [makeSample({ id: "ok1", status: "qualified", exposure: 5 }), ok2];
  check("合格样本编辑后失效 -> 自动退出对比", JSON.stringify(Policy.reconcileCompare(spoiled, ["ok1", "ok2"])) === JSON.stringify(["ok2"]));
  check("去重", JSON.stringify(Policy.reconcileCompare(samples, ["ok1", "ok1"])) === JSON.stringify(["ok1"]));
}

console.log("筛选");
{
  const s = makeSample({ minerals: "石英、黑云母", polarization: "正交偏光", status: "pending" });
  check("矿物+偏光+状态联合匹配", Policy.matchesFilters(s, { mineral: "黑云母", polarization: "正交偏光", status: "pending" }) === true);
  check("状态不符", Policy.matchesFilters(s, { mineral: "", polarization: "", status: "qualified" }) === false);
  check("空筛选全通过", Policy.matchesFilters(s, { mineral: "", polarization: "", status: "" }) === true);
}

console.log("端到端：入库 -> 待复核 -> 复核 -> 编辑失效 -> 持久化重载");
{
  const state = Store.freshState();
  Store.addSample(state, makeSample({ id: "e2e", exposure: 90, status: "pending" }));
  check("曝光 90 入库即待复核", state.samples[0].status === "pending");
  state.compare = ["e2e"];
  state.compare = Policy.reconcileCompare(state.samples, state.compare);
  check("待复核不能进对比", state.compare.length === 0);

  const current = state.samples[0];
  const reviewed = Policy.applyReview(current, { reviewer: "王五", scaleLength: 100, fieldWidth: 450, exposure: 60 });
  Store.replaceSample(state, "e2e", reviewed);
  state.compare = Policy.reconcileCompare(state.samples, ["e2e"]);
  check("复核通过后可对比", state.compare.length === 1);

  const again = state.samples[0];
  if (Policy.invalidatesReview(again, { magnification: "100x" })) {
    Store.replaceSample(state, "e2e", { magnification: "100x", status: "pending", review: null });
  }
  state.compare = Policy.reconcileCompare(state.samples, state.compare);
  check("改倍数后旧复核失效、退出对比", state.samples[0].status === "pending" && state.samples[0].review === null && state.compare.length === 0);

  Store.save(state);
  const reloaded = Store.load();
  check("刷新后状态与对比保持一致", reloaded.samples[0].status === "pending" && Policy.reconcileCompare(reloaded.samples, reloaded.compare).length === 0);
}

console.log(`\n全部通过：${passed} 项检查`);
