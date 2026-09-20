// 判定层：准入规则、复核校验与失效规则的纯函数实现，不触碰存储与界面。
const Rules = (() => {
  const EXPOSURE_MIN = 40;
  const EXPOSURE_MAX = 80;
  const MAX_COMPARE = 2;

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function isPositiveNumber(value) {
    return isFiniteNumber(value) && value > 0;
  }

  function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  // 复核修正值优先于录入值，作为准入判定的有效测量值。
  function effectiveValues(sample) {
    const review = sample.review || null;
    return {
      scaleLength: review ? review.scaleLength : sample.scaleLength,
      fieldWidth: sample.fieldWidth,
      exposure: review ? review.exposure : sample.exposure
    };
  }

  // 准入判定：标尺缺失、曝光缺失或曝光低于 40 / 高于 80 的照片只进待复核。
  function judge(sample) {
    const values = effectiveValues(sample);
    const issues = [];
    if (!isPositiveNumber(values.scaleLength)) issues.push("标尺缺失");
    if (!isFiniteNumber(values.exposure)) issues.push("曝光缺失");
    else if (values.exposure < EXPOSURE_MIN || values.exposure > EXPOSURE_MAX) issues.push("曝光越界");
    return { status: issues.length ? "pending" : "approved", issues };
  }

  function canCompare(sample) {
    return judge(sample).status === "approved";
  }

  // 导出与对比共用同一条准入门。
  const canExport = canCompare;

  // 重传照片、修改倍数或偏光会让旧复核失效；测量值被改写时旧复核同样不再有效。
  function reviewInvalidated(before, after) {
    return ["photo", "magnification", "polarization", "scaleLength", "fieldWidth", "exposure"]
      .some((key) => before[key] !== after[key]);
  }

  // 复核必须给出修正值，且复核人不能是录入人本人。
  function validateReview(sample, draft) {
    const errors = [];
    if (!isPositiveNumber(draft.scaleLength)) errors.push("请填写有效的修正标尺长度");
    if (!isFiniteNumber(draft.exposure)) errors.push("请填写有效的修正曝光值");
    const reviewer = (draft.reviewer || "").trim();
    if (!reviewer) errors.push("请填写复核人");
    else if (reviewer === (sample.enteredBy || "").trim()) errors.push("复核人须与录入人不同");
    return { ok: errors.length === 0, errors, reviewer };
  }

  // 规整状态：为旧数据补齐缺省字段；对比列表只保留已准入样本，去重且最多两张。
  function normalizeState(state) {
    const samples = Array.isArray(state.samples) ? state.samples : [];
    state.samples = samples;
    samples.forEach((sample) => {
      sample.scaleLength = toNumberOrNull(sample.scaleLength);
      sample.fieldWidth = toNumberOrNull(sample.fieldWidth);
      sample.exposure = toNumberOrNull(sample.exposure);
      sample.enteredBy = typeof sample.enteredBy === "string" ? sample.enteredBy : "";
      sample.review = sample.review && typeof sample.review === "object" ? sample.review : null;
    });
    const approvedIds = new Set(samples.filter(canCompare).map((sample) => sample.id));
    const seen = new Set();
    const compare = [];
    (Array.isArray(state.compare) ? state.compare : []).forEach((id) => {
      if (approvedIds.has(id) && !seen.has(id) && compare.length < MAX_COMPARE) {
        seen.add(id);
        compare.push(id);
      }
    });
    state.compare = compare;
    state.filters = Object.assign({ mineral: "", polarization: "", status: "" }, state.filters);
    return state;
  }

  return {
    EXPOSURE_MIN,
    EXPOSURE_MAX,
    MAX_COMPARE,
    effectiveValues,
    judge,
    canCompare,
    canExport,
    reviewInvalidated,
    validateReview,
    normalizeState,
    toNumberOrNull
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Rules;
}
