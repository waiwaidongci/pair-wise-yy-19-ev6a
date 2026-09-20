"use strict";

/*
 * 判定层：标尺/曝光准入、复核准入与对比资格的全部规则集中在此。
 * 纯逻辑模块，不读写 localStorage，也不接触任何 DOM。
 */
window.Policy = (() => {
  const EXPOSURE_MIN = 40;
  const EXPOSURE_MAX = 80;
  const STATUS_PENDING = "pending";
  const STATUS_QUALIFIED = "qualified";

  // 重传照片、修改倍数或偏光，会让旧复核及对比选择失效。
  const REVIEW_INVALIDATING_FIELDS = ["photo", "magnification", "polarization"];

  function hasScale(sample) {
    return Number.isFinite(sample.scaleLength) && sample.scaleLength > 0;
  }

  function exposureOutOfRange(exposure) {
    return !Number.isFinite(exposure) || exposure < EXPOSURE_MIN || exposure > EXPOSURE_MAX;
  }

  // 标尺缺失、曝光低于四十或高于八十 -> 只进待复核，不能参与对比或导出。
  function admissionFailures({ scaleLength, exposure }) {
    const failures = [];
    if (!(Number.isFinite(scaleLength) && scaleLength > 0)) {
      failures.push("标尺缺失");
    }
    if (exposureOutOfRange(exposure)) {
      failures.push(`曝光超出 ${EXPOSURE_MIN}-${EXPOSURE_MAX}`);
    }
    return failures;
  }

  function isQualified(sample) {
    return sample.status === STATUS_QUALIFIED && admissionFailures(sample).length === 0;
  }

  // 复核准入：必须填写修正后的标尺/曝光/视野，且修正后数据本身满足入库条件。
  function reviewIssues(sample, { reviewer, scaleLength, fieldWidth, exposure }) {
    const issues = [];
    const trimmedReviewer = (reviewer || "").trim();
    const trimmedOperator = (sample.operator || "").trim();
    if (!trimmedReviewer) {
      issues.push("复核人不能为空");
    } else if (trimmedReviewer === trimmedOperator) {
      issues.push("复核人不能与录入人相同");
    }
    if (!(Number.isFinite(scaleLength) && scaleLength > 0)) {
      issues.push("标尺修正值必须大于 0");
    }
    if (!(Number.isFinite(fieldWidth) && fieldWidth > 0)) {
      issues.push("视野宽度修正值必须大于 0");
    }
    if (exposureOutOfRange(exposure)) {
      issues.push(`曝光修正值须在 ${EXPOSURE_MIN}-${EXPOSURE_MAX} 内`);
    }
    return issues;
  }

  function applyReview(sample, { reviewer, scaleLength, fieldWidth, exposure }) {
    return {
      ...sample,
      scaleLength,
      fieldWidth,
      exposure,
      status: STATUS_QUALIFIED,
      review: {
        reviewer: reviewer.trim(),
        scaleLength,
        fieldWidth,
        exposure,
        reviewedAt: new Date().toISOString()
      }
    };
  }

  // 重传照片、修改倍数或偏光 -> 旧复核失效：回到待复核并丢弃复核记录。
  function invalidatesReview(current, patch) {
    return REVIEW_INVALIDATING_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== current[field]
    );
  }

  // 对比资格始终按当前数据重算，保证筛选、对比与刷新后一致。
  function reconcileCompare(samples, ids) {
    const qualified = new Set(samples.filter(isQualified).map((sample) => sample.id));
    return ids.filter((id, index) => qualified.has(id) && ids.indexOf(id) === index);
  }

  function matchesFilters(sample, { mineral, polarization, status }) {
    const mineralMatch = !mineral || (sample.minerals || "").includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    const statusMatch = !status || sample.status === status;
    return mineralMatch && polarMatch && statusMatch;
  }

  return {
    EXPOSURE_MIN,
    EXPOSURE_MAX,
    STATUS_PENDING,
    STATUS_QUALIFIED,
    REVIEW_INVALIDATING_FIELDS,
    hasScale,
    exposureOutOfRange,
    admissionFailures,
    isQualified,
    reviewIssues,
    applyReview,
    invalidatesReview,
    reconcileCompare,
    matchesFilters
  };
})();
