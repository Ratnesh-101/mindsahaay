// Bilingual offline page. No inline script (the CSP forbids it), so everything lives here.
// English is the default; Hindi is chosen when navigator.language starts with "hi", or when the
// student uses the switch link (remembered for this tab only).
(function () {
  var KEY = "mindsahaay_offline_lang";
  var TITLES = { en: "You are offline - MindSahaay", hi: "आप ऑफ़लाइन हैं - MindSahaay" };
  var LABELS = { en: "Crisis helplines", hi: "संकट हेल्पलाइन" };

  function detect() {
    try {
      var saved = window.sessionStorage.getItem(KEY);
      if (saved === "hi" || saved === "en") return saved;
    } catch (e) {
      /* storage can be blocked; fall through to the browser language */
    }
    var nav = (navigator.language || "").toLowerCase();
    return nav.indexOf("hi") === 0 ? "hi" : "en";
  }

  function apply(lang) {
    document.documentElement.setAttribute("lang", lang);
    document.title = TITLES[lang];
    var list = document.getElementById("helplines");
    if (list) list.setAttribute("aria-label", LABELS[lang]);
  }

  apply(detect());

  var retry = document.getElementById("retry");
  if (retry) {
    retry.addEventListener("click", function () {
      window.location.reload();
    });
  }

  var sw = document.getElementById("lang-switch");
  if (sw) {
    sw.addEventListener("click", function (event) {
      event.preventDefault();
      var next = document.documentElement.getAttribute("lang") === "hi" ? "en" : "hi";
      try {
        window.sessionStorage.setItem(KEY, next);
      } catch (e) {
        /* ignore */
      }
      apply(next);
    });
  }
})();