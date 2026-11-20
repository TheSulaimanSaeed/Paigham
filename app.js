// Break out of any frame (clickjacking defence; real headers are not possible on GitHub Pages)
if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (e) {} document.documentElement.style.display = "none"; }
(function () {
  var app = document.getElementById("app");
  var cfg = window.PAIGHAM_CONFIG || {};
  var sb = null;
  try {
    if (cfg.supabaseUrl && cfg.supabaseKey && window.supabase) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "paigham-auth"
        }
      });
    }
  } catch (err) {
    console.error("Supabase init error:", err);
  }

  var user = null;
  var profile = null;
  var profilesList = [];
  var myPosts = [];
  var mode = "login"; // login | signup | verify | forgot | reset
  var pendingEmail = "";
  var recovering = false;
  var community = [];
  var sciSub = "all";
  var lastActionAt = 0;

  var ALLOWED_IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  var ALLOWED_ALL = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  var MAX_BYTES = 5 * 1024 * 1024;

  var S = {
    science: {
      t: "Science",
      d: "Review articles, lab notes, photos, and PDFs across Physics, Chemistry, and Biology.",
      c: "#0d3b66",
      subs: { all: "All Branches", physics: "Physics", chemistry: "Chemistry", biology: "Biology" }
    },
    art: {
      t: "Art",
      d: "Design, video, UX/UI and visual storytelling: projects, case studies, process notes and work in progress.",
      c: "#0f766e"
    },
    politics: {
      t: "Politics",
      d: "Share thoughts, essays, and analysis on global power, borders, resources, and world affairs.",
      c: "#4a3f28"
    },
    finance: {
      t: "Finance",
      d: "Markets, economics, investing, financial analysis, and economic policy discussions.",
      c: "#1e3a5f"
    }
  };

  var keys = Object.keys(S);
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var tabsEl = document.getElementById("tabs");
  if (tabsEl) {
    tabsEl.innerHTML = '<a href="#" data-k="home">Home Feed</a>' + keys.map(function (k) {
      return '<a href="#' + k + '" data-k="' + k + '">' + S[k].t + '</a>';
    }).join("");
  }

  if (window.DOMPurify) {
    DOMPurify.addHook("afterSanitizeAttributes", function (n) {
      if (n.tagName === "A") {
        n.setAttribute("rel", "noopener noreferrer nofollow ugc");
        n.setAttribute("target", "_blank");
      }
    });
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(d) {
    var dt = new Date(String(d).slice(0, 10) + "T00:00:00");
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function mins(t) { return Math.max(1, Math.round(String(t || "").split(/\s+/).length / 220)); }
  function md(t) {
    var raw = window.marked ? marked.parse(String(t || "")) : esc(t);
    return window.DOMPurify ? DOMPurify.sanitize(raw, { ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i }) : raw;
  }
  function ig(h) { return /^[A-Za-z0-9._]{1,30}$/.test(h || "") ? h : ""; }
  function safeUrl(u) {
    if (!u) return "";
    try {
      var parsed = new URL(u, location.origin);
      if (parsed.protocol === "https:" || parsed.origin === location.origin) return parsed.href;
    } catch (_e) {}
    return "";
  }
  function initials(name) {
    return String(name || "P").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] ? w[0].toUpperCase() : ""; }).join("") || "P";
  }
  function avatarHtml(url, name, cls) {
    var clean = safeUrl(url);
    if (clean) return '<img class="' + cls + '" src="' + esc(clean) + '" alt="' + esc(name) + '">';
    return '<span class="' + cls + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
  }
  function setBg(k) { var p = document.getElementById("photo"); p.dataset.k = k || "home"; p.style.setProperty("--photo", "url(img/" + (k || "home") + ".jpg)"); }
  function setNav(which, sec) {
    ["write", "about", "login"].forEach(function (k) {
      var el = document.getElementById("nav-" + k);
      if (!el) return;
      if (k === which) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    document.querySelectorAll("#tabs a").forEach(function (a) {
      if (a.dataset.k === sec) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function storagePathFromUrl(url) {
    if (!url) return "";
    var marker = "/storage/v1/object/public/attachments/";
    var idx = String(url).indexOf(marker);
    if (idx === -1) return "";
    try {
      return decodeURIComponent(String(url).slice(idx + marker.length).split("?")[0]);
    } catch (_e) {
      return String(url).slice(idx + marker.length).split("?")[0];
    }
  }

  function sharePost(p, statusEl) {
    var shareUrl = location.origin + "/#" + encodeURIComponent(p.id);
    var notify = function (txt) {
      if (!statusEl) return;
      statusEl.textContent = txt;
      setTimeout(function () { if (statusEl) statusEl.textContent = ""; }, 3000);
    };
    if (navigator.share) {
      navigator.share({
        title: p.title + " · Paigham",
        text: p.excerpt || p.title,
        url: shareUrl
      }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function () {
        notify("Link copied to clipboard!");
      }).catch(function () {
        window.prompt("Copy this link to share:", shareUrl);
      });
    } else {
      window.prompt("Copy this link to share:", shareUrl);
    }
  }

  function deletePostById(rawId, mediaUrl, onSuccess, onError) {
    if (!sb || !user) return;
    if (!window.confirm("Are you sure you want to permanently delete this post? This cannot be undone.")) return;
    var oldPath = storagePathFromUrl(mediaUrl);
    sb.from("posts").delete().eq("id",