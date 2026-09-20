// 运行：node tests/closed-loop.test.js
const assert = require("node:assert/strict");
const Rules = require("../rules.js");

// store.js 只在方法内触碰 localStorage，先垫内存实现再引入。
const memory = new Map();
global.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
const Store = require("../store.js");

const base = {
  id: "s1",
  photo: "data:image/png;base64,x",
  code: "BX-17-03",
  location: "剖面东侧",
  magnification: "40x",
  polarization: "单偏光",
  minerals: "石英",
  texture: "粒状",
  comment: "",
  scaleLength: 200,
  fieldWidth: 1200,
  exposure: 62,
  enteredBy: "张工",
  review: null
};

// 1. 准入判定：缺标尺、曝光 <40 或 >80 只进待复核
assert.equal(Rules.judge(base).status, "approved");
assert.equal(Rules.judge({ ...base, scaleLength: null }).status, "pending");
assert.deepEqual(Rules.judge({ ...base, scaleLength: null }).issues, ["标尺缺失"]);
assert.equal(Rules.judge({ ...base, exposure: 39 }).status, "pending");
assert.equal(Rules.judge({ ...base, exposure: 81 }).status, "pending");
assert.equal(Rules.judge({ ...base, exposure: null }).status, "pending");
assert.equal(Rules.judge({ ...base, exposure: 40 }).status, "approved", "边界 40 应准入");
assert.equal(Rules.judge({ ...base, exposure: 80 }).status, "approved", "边界 80 应准入");
assert.equal(Rules.canCompare({ ...base, exposure: 90 }), false);
assert.equal(Rules.canExport({ ...base, scaleLength: null }), false);

// 2. 复核：须填修正值，复核人须与录入人不同
assert.equal(Rules.validateReview(base, { scaleLength: 200, exposure: 60, reviewer: "张工" }).ok, false);
assert.equal(Rules.validateReview(base, { scaleLength: 200, exposure: 60, reviewer: "" }).ok, false);
assert.equal(Rules.validateReview(base, { scaleLength: null, exposure: 60, reviewer: "李工" }).ok, false);
assert.equal(Rules.validateReview(base, { scaleLength: 200, exposure: null, reviewer: "李工" }).ok, false);
assert.equal(Rules.validateReview(base, { scaleLength: 200, exposure: 60, reviewer: "李工" }).ok, true);

// 3. 复核修正值参与判定：修正后达标即准入，仍不达标继续待复核
const fixed = { ...base, scaleLength: null, review: { scaleLength: 180, exposure: 58, reviewer: "李工", reviewedAt: "t" } };
assert.equal(Rules.judge(fixed).status, "approved");
assert.equal(Rules.effectiveValues(fixed).scaleLength, 180);
const stillBad = { ...base, exposure: 90, review: { scaleLength: 200, exposure: 95, reviewer: "李工", reviewedAt: "t" } };
assert.equal(Rules.judge(stillBad).status, "pending");

// 4. 失效：重传照片、改倍数、改偏光让旧复核失效；改批注不影响
assert.equal(Rules.reviewInvalidated(base, { ...base, photo: "data:image/png;base64,y" }), true);
assert.equal(Rules.reviewInvalidated(base, { ...base, magnification: "100x" }), true);
assert.equal(Rules.reviewInvalidated(base, { ...base, polarization: "正交偏光" }), true);
assert.equal(Rules.reviewInvalidated(base, { ...base, exposure: 70 }), true);
assert.equal(Rules.reviewInvalidated(base, { ...base, comment: "补充批注" }), false);

// 5. 状态规整：待复核与失效 id 不得留在对比列表，去重且最多两张
const s2 = { ...base, id: "s2" };
const s3 = { ...base, id: "s3" };
const s4 = { ...base, id: "s4", scaleLength: null };
const state = { samples: [base, s2, s3, s4], compare: ["s1", "s4", "s2", "s1", "s3", "ghost"] };
Rules.normalizeState(state);
assert.deepEqual(state.compare, ["s1", "s2"]);

// 6. 旧数据迁移：补齐字段、转入待复核、移出对比
const legacy = { samples: [{ id: "old", code: "L-1", photo: "", polarization: "单偏光" }], compare: ["old"] };
Rules.normalizeState(legacy);
assert.equal(legacy.samples[0].review, null);
assert.equal(legacy.samples[0].enteredBy, "");
assert.equal(Rules.judge(legacy.samples[0]).status, "pending");
assert.deepEqual(legacy.compare, []);
assert.deepEqual(legacy.filters, { mineral: "", polarization: "", status: "" });

// 7. 存储往返：保存后读回一致（刷新后一致）
Store.save({ samples: [base], compare: ["s1"], filters: { mineral: "石英", polarization: "", status: "approved" } });
const loaded = Rules.normalizeState(Store.load());
assert.equal(loaded.samples[0].id, "s1");
assert.deepEqual(loaded.compare, ["s1"]);
assert.equal(loaded.filters.mineral, "石英");

console.log("closed-loop tests: all 7 groups passed");
