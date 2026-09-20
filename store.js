// 存储层：只负责 localStorage 的读写，不做任何准入判定。
const Store = (() => {
  const storageKey = "wxyy-2-thin-section-index";

  function blank() {
    return { samples: [], compare: [], filters: { mineral: "", polarization: "", status: "" } };
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : blank();
    } catch (error) {
      return blank();
    }
  }

  function save(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  return { storageKey, load, save };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Store;
}
