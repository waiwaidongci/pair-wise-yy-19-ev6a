"use strict";

/*
 * 存储层：只负责样册数据的持久化与增删改。
 * 不包含标尺/曝光准入判定，也不接触任何 DOM。
 */
window.Store = (() => {
  const STORAGE_KEY = "wxyy-2-thin-section-index";
  const VERSION = 2;

  function freshState() {
    return { version: VERSION, samples: [], compare: [] };
  }

  function toNumberOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  // 旧版本数据缺少标尺/曝光等字段：补齐字段并一律按待复核处理，等待补录复核。
  function migrate(raw) {
    if (!raw || !Array.isArray(raw.samples)) return freshState();
    const samples = raw.samples.map((sample) => {
      const hasKnownStatus = sample.status === "qualified" || sample.status === "pending";
      return {
        ...sample,
        scaleLength: toNumberOrNull(sample.scaleLength),
        fieldWidth: toNumberOrNull(sample.fieldWidth),
        exposure: toNumberOrNull(sample.exposure),
        operator: typeof sample.operator === "string" ? sample.operator : "",
        status: hasKnownStatus ? sample.status : "pending",
        review: sample.review && typeof sample.review === "object" ? sample.review : null
      };
    });
    return {
      version: VERSION,
      samples,
      compare: Array.isArray(raw.compare)
        ? raw.compare.filter((id) => typeof id === "string")
        : []
    };
  }

  function load() {
    try {
      return migrate(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (error) {
      return freshState();
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function addSample(state, sample) {
    state.samples.unshift(sample);
  }

  function replaceSample(state, id, patch) {
    const index = state.samples.findIndex((sample) => sample.id === id);
    if (index === -1) return false;
    state.samples[index] = { ...state.samples[index], ...patch, id };
    return true;
  }

  function removeSample(state, id) {
    state.samples = state.samples.filter((sample) => sample.id !== id);
    state.compare = state.compare.filter((item) => item !== id);
  }

  function setCompare(state, ids) {
    state.compare = ids;
  }

  return {
    STORAGE_KEY,
    VERSION,
    freshState,
    load,
    save,
    addSample,
    replaceSample,
    removeSample,
    setCompare
  };
})();
