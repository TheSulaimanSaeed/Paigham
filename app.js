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
    models: {
      t: "Model Organisms",
      d: "Zebrafish (Danio rerio), Drosophila, mice, C. elegans, and experimental disease models researchers are working on.",
      c: "#0f766e"
    },
    geopolitics: {
      t: "Geopolitics",
      d: "Share thoughts, essays, and analysis on global power, borders, resources, and world affairs.",
      c: "#4a3f28"
    },
    philosophy: {
      t: "Philosophy",
      d: "Open reflections, ethics of science, epistemology, and philosophical discussions.",
      c: "#2d3a4b"
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
  function setBg(k) { document.getElementById("photo").style.setProperty("--photo", "url(img/" + (k || "home") + ".jpg)"); }
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

  function validateFile(file, imgOnly) {
    if (!file) return null;
    var list = imgOnly ? ALLOWED_IMG : ALLOWED_ALL;
    if (list.indexOf(file.type) === -1) {
      return imgOnly ? "Upload a JPG, PNG, WEBP, or GIF image." : "Unsupported file. Upload JPG, PNG, WEBP, GIF, or PDF only.";
    }
    if (file.size > MAX_BYTES) return "File exceeds 5 MB limit.";
    return null;
  }

  function uploadFile(file, folder, imgOnly) {
    if (!file) return Promise.resolve({ url: null, type: null });
    var err = validateFile(file, imgOnly);
    if (err) return Promise.reject(new Error(err));
    var ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    var mediaType = file.type === "application/pdf" ? "pdf" : "image";
    var path = user.id + "/" + folder + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;

    return sb.storage.from("attachments").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    }).then(function (res) {
      if (res.error) throw new Error("Upload failed: " + res.error.message);
      var pub = sb.storage.from("attachments").getPublicUrl(path);
      return { url: pub.data.publicUrl, type: mediaType };
    });
  }

  function bindPreview(inputEl, previewEl, imgOnly) {
    if (!inputEl || !previewEl) return;
    inputEl.onchange = function () {
      var file = inputEl.files && inputEl.files[0];
      if (!file) { previewEl.style.display = "none"; previewEl.innerHTML = ""; return; }
      var err = validateFile(file, imgOnly);
      if (err) {
        previewEl.style.display = "block";
        previewEl.innerHTML = '<span style="color:#c81e1e;font-weight:600">' + esc(err) + '</span>';
        inputEl.value = "";
        return;
      }
      previewEl.style.display = "block";
      var sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      if (file.type === "application/pdf") {
        previewEl.innerHTML = '<strong>PDF attached:</strong> ' + esc(file.name) + ' (' + sizeMb + ' MB)';
      } else {
        var objUrl = URL.createObjectURL(file);
        previewEl.innerHTML = '<strong>Photo selected:</strong> ' + esc(file.name) + ' (' + sizeMb + ' MB)<img src="' + objUrl + '" alt="Preview">';
      }
    };
  }

  function renderMedia(url, type, title) {
    var clean = safeUrl(url);
    if (!clean) return "";
    if (type === "pdf") {
      return '<div class="media-wrap">' +
        '<div class="pdf-bar"><span><strong>Attached PDF Document</strong></span>' +
        '<a class="btn secondary" style="min-height:2.1rem;padding:.3rem .8rem;font-size:.85rem" href="' + esc(clean) + '" target="_blank" rel="noopener noreferrer">Open / Download PDF</a></div>' +
        '<iframe class="pdf-frame" src="' + esc(clean) + '#view=FitH" title="' + esc(title || "PDF") + '" loading="lazy"></iframe>' +
        '</div>';
    }
    if (type === "image") {
      return '<figure class="media-wrap"><img src="' + esc(clean) + '" alt="' + esc(title || "Figure") + '" loading="lazy"></figure>';
    }
    return "";
  }

  function all() {
    var mine = (Array.isArray(window.POSTS) ? window.POSTS : []).map(function (p) {
      return {
        id: p.slug,
        title: p.title,
        date: p.date || "2026-01-01",
        section: p.section,
        sub: p.sub_section || "",
        post_type: p.post_type || "article",
        excerpt: p.excerpt,
        body: p.body,
        media_url: p.media_url || "",
        media_type: p.media_type || "",
        author: "M. Sulaiman Saeed",
        study: "Biology (Wet-Lab Pathology & Zebrafish Models)",
        avatar: "dp.jpg",
        ig: "thesulaimansaeed"
      };
    });
    var com = (Array.isArray(community) ? community : []).map(function (p) {
      return {
        id: "c-" + p.id,
        title: p.title,
        date: p.created_at || "2026-01-01",
        section: p.section,
        sub: p.sub_section || "",
        post_type: p.post_type || "article",
        excerpt: p.excerpt,
        body: p.body,
        media_url: p.media_url || "",
        media_type: p.media_type || "",
        author: p.author_name,
        study: p.author_study || "",
        avatar: p.author_avatar || "",
        ig: ig(p.instagram)
      };
    });
    return mine.concat(com).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }

  function feedCards(list, emptyMsg) {
    if (!list.length) return '<div class="empty">' + (emptyMsg || 'No publications yet. <a href="#write">Publish the first review article, note, photo, or PDF</a>.') + '</div>';
    return '<div class="feed-list">' + list.map(function (p) {
      var subLabel = (p.section === "science" && p.sub && S.science.subs[p.sub]) ? S.science.subs[p.sub] : "";
      var typeBadge = p.post_type === "review" ? '<span class="badge review">Review Article</span>'
                    : p.post_type === "thought" ? '<span class="badge">Thought / Reflection</span>' : '';
      var mediaBadge = p.media_type === "pdf" ? '<span class="badge media">PDF</span>'
                     : p.media_type === "image" ? '<span class="badge media">Photo</span>' : '';
      return '<a class="pcard" href="#' + encodeURIComponent(p.id) + '">' +
        '<div class="pcard-top">' +
          '<div class="pcard-author">' + avatarHtml(p.avatar, p.author, "avatar-sm") +
            '<div class="pcard-meta"><strong>' + esc(p.author) + '</strong>' +
            '<span>' + esc(p.study || (S[p.section] ? S[p.section].t : "Contributor")) + '</span></div>' +
          '</div>' +
          '<div class="badges">' + typeBadge +
            (S[p.section] ? '<span class="badge">' + esc(S[p.section].t) + '</span>' : '') +
            (subLabel ? '<span class="badge">' + esc(subLabel) + '</span>' : '') +
            mediaBadge +
          '</div>' +
        '</div>' +
        '<h3>' + esc(p.title) + '</h3>' +
        (p.excerpt ? '<p>' + esc(p.excerpt) + '</p>' : '') +
        '<div class="pcard-foot"><span>' + fmt(p.date) + ' · ' + mins(p.body) + ' min read</span><span>Read &amp; Discuss →</span></div>' +
      '</a>';
    }).join("") + '</div>';
  }

  function sidebarHtml() {
    var membersHtml = profilesList.length
      ? profilesList.slice(0, 6).map(function (m) {
          return '<div class="member-item">' +
            avatarHtml(m.avatar_url, m.full_name, "avatar-sm") +
            '<div class="member-info">' +
              '<strong>' + esc(m.full_name) + '</strong>' +
              '<span>Studying: ' + esc(m.study_field) + '</span>' +
              '<small>Interests: ' + esc(m.future_interests) + '</small>' +
            '</div>' +
          '</div>';
        }).join("")
      : '<p class="note" style="font-size:.86rem">Join Paigham to showcase your field of study and future research interests here.</p>';

    return '<aside>' +
      '<div class="side-box">' +
        '<h3>Research Community</h3>' +
        membersHtml +
        '<p style="margin:.9rem 0 0"><a class="btn secondary" style="width:100%;min-height:2.35rem;font-size:.86rem" href="#login">' + (user ? "Edit Your Researcher Profile" : "Create Researcher Profile") + '</a></p>' +
      '</div>' +
      '<div class="side-box">' +
        '<h3>Publish Your Work</h3>' +
        '<p class="note" style="font-size:.86rem;margin-bottom:.85rem">Upload review articles across Physics, Chemistry &amp; Biology, share zebrafish or model organism findings, or post thoughts on Geopolitics &amp; Philosophy.</p>' +
        '<a class="btn" style="width:100%;min-height:2.4rem;font-size:.88rem" href="#write">+ Submit Article / PDF</a>' +
      '</div>' +
    '</aside>';
  }

  function home() {
    document.title = "Paigham — Research & Writing Network | M. Sulaiman Saeed"; setBg("home");
    var list = all().slice(0, 12);
    app.innerHTML = '<section class="hero">' +
      '<h1>Open Science, Model Organisms, Geopolitics &amp; Philosophy.</h1>' +
      '<p>Founded by <strong>M. Sulaiman Saeed</strong> — a collaborative space to publish review articles, share zebrafish and model organism research, upload PDFs &amp; figures, and exchange ideas.</p>' +
      '<div class="hero-actions">' +
        '<a class="btn" href="#write">+ Upload Review Article / Post</a>' +
        '<a class="btn secondary" href="#login">' + (user ? "My Researcher Profile" : "Join with Email Code") + '</a>' +
      '</div>' +
    '</section>' +
    '<div class="cards">' + keys.map(function (k) {
      return '<a class="card" href="#' + k + '" style="--c1:url(img/' + k + '.jpg);--c2:' + S[k].c + '"><h2>' + S[k].t + '</h2><p>' + S[k].d + '</p></a>';
    }).join("") + '</div>' +
    '<div class="feed-layout">' +
      '<div><div class="feed-head"><h2>Recent Publications &amp; Thoughts</h2></div>' + feedCards(list) + '</div>' +
      sidebarHtml() +
    '</div>';
    setNav("", "home");
  }

  function section(k) {
    document.title = S[k].t + " · Paigham"; setBg(k);
    var list = all().filter(function (p) { return p.section === k; });
    var subBar = "";

    if (k === "science") {
      var subs = S.science.subs;
      subBar = '<div class="subtabs" role="group" aria-label="Science branches">' +
        Object.keys(subs).map(function (sk) {
          return '<button type="button" class="subtab" data-sub="' + sk + '" aria-pressed="' + (sciSub === sk) + '">' + subs[sk] + '</button>';
        }).join("") + '</div>';
      if (sciSub !== "all") {
        list = list.filter(function (p) { return p.sub === sciSub; });
      }
    }

    var ctaLabel = k === "science" ? "+ Upload Review Article / Study"
                 : k === "models" ? "+ Share Model Organism Work"
                 : k === "geopolitics" ? "+ Share Geopolitical Thought"
                 : "+ Share Philosophical Thought";

    app.innerHTML = '<section class="hero"><h1>' + S[k].t + '</h1><p>' + S[k].d + '</p>' +
      '<div class="hero-actions"><a class="btn" href="#write?section=' + k + '">' + ctaLabel + '</a></div></section>' +
      subBar +
      '<div class="feed-layout">' +
        '<div>' + feedCards(list) + '</div>' +
        sidebarHtml() +
      '</div>';
    setNav("", k);

    if (k === "science") {
      app.querySelectorAll(".subtab").forEach(function (btn) {
        btn.onclick = function () {
          sciSub = btn.dataset.sub;
          section("science");
        };
      });
    }
  }

  function renderComments(postId) {
    var box = document.getElementById("comments-box");
    if (!box) return;
    if (!sb) {
      box.innerHTML = '<section class="comments"><h2>Discussion</h2><p class="note">Discussion requires Supabase connection.</p></section>';
      return;
    }

    var formHtml = user
      ? '<form class="form" id="cform">' +
        '<label>Contribute to the discussion<textarea class="short" name="body" minlength="1" maxlength="2000" placeholder="Write your academic feedback, question, or reflection..." required></textarea></label>' +
        '<label>Attach a figure, photo, or PDF (optional, max 5 MB)<input type="file" name="media" id="c-media" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"></label>' +
        '<div id="c-preview" class="preview-box" style="display:none"></div>' +
        '<button class="btn" type="submit" id="csub">Post Response</button><p class="note" role="status" id="cmsg"></p></form>'
      : '<p class="note"><a href="#login" style="color:var(--accent);font-weight:600">Log in or create a researcher account</a> to comment or attach photos/PDFs.</p>';

    box.innerHTML = '<section class="comments"><h2>Peer Discussion (<span id="ccount">0</span>)</h2><div class="clist" id="clist"><p class="note">Loading responses…</p></div>' + formHtml + '</section>';

    var cMediaInput = document.getElementById("c-media");
    var cPreview = document.getElementById("c-preview");
    if (cMediaInput && cPreview) bindPreview(cMediaInput, cPreview, false);

    function loadList() {
      sb.from("comments").select("id,user_id,author_name,author_study,author_avatar,instagram,body,media_url,media_type,created_at").eq("post_id", postId).order("created_at", { ascending: true })
        .then(function (r) {
          var items = r.data || [];
          var countEl = document.getElementById("ccount");
          var clist = document.getElementById("clist");
          if (!countEl || !clist) return;
          countEl.textContent = items.length;
          if (!items.length) {
            clist.innerHTML = '<p class="note">No responses yet. Start the discussion below.</p>';
            return;
          }
          clist.innerHTML = "";
          items.forEach(function (c) {
            var div = document.createElement("div");
            div.className = "citem";
            var head = document.createElement("div");
            head.className = "chead";

            var left = document.createElement("div");
            left.className = "cuser";
            left.innerHTML = avatarHtml(c.author_avatar, c.author_name, "avatar-sm");

            var info = document.createElement("span");
            var strong = document.createElement("strong");
            strong.style.color = "var(--ink)";
            strong.textContent = c.author_name;
            info.appendChild(strong);
            if (c.author_study) info.append(" · " + c.author_study);
            if (ig(c.instagram)) {
              var a = document.createElement("a");
              a.href = "https://instagram.com/" + ig(c.instagram);
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.style.color = "var(--accent)";
              a.textContent = " (@" + ig(c.instagram) + ")";
              info.appendChild(a);
            }
            info.append(" · " + fmt(c.created_at));
            left.appendChild(info);
            head.appendChild(left);

            if (user && user.id === c.user_id) {
              var del = document.createElement("button");
              del.type = "button";
              del.className = "linkbtn";
              del.textContent = "Delete";
              del.onclick = function () {
                sb.from("comments").delete().eq("id", c.id).then(loadList);
              };
              head.appendChild(del);
            }

            var p = document.createElement("p");
            p.className = "cbody";
            p.textContent = c.body;

            div.appendChild(head);
            div.appendChild(p);

            var cleanMedia = safeUrl(c.media_url);
            if (cleanMedia) {
              var mWrap = document.createElement("div");
              mWrap.className = "cmedia";
              if (c.media_type === "pdf") {
                var pdfLink = document.createElement("a");
                pdfLink.className = "btn secondary";
                pdfLink.style.minHeight = "2.1rem";
                pdfLink.style.padding = ".3rem .8rem";
                pdfLink.style.fontSize = ".85rem";
                pdfLink.href = cleanMedia;
                pdfLink.target = "_blank";
                pdfLink.rel = "noopener noreferrer";
                pdfLink.textContent = "View Attached PDF";
                mWrap.appendChild(pdfLink);
              } else if (c.media_type === "image") {
                var img = document.createElement("img");
                img.src = cleanMedia;
                img.alt = "Attachment by " + c.author_name;
                img.loading = "lazy";
                mWrap.appendChild(img);
              }
              div.appendChild(mWrap);
            }

            clist.appendChild(div);
          });
        });
    }

    loadList();

    var cf = document.getElementById("cform");
    if (cf) {
      cf.onsubmit = function (e) {
        e.preventDefault();
        var now = Date.now();
        var cmsg = document.getElementById("cmsg");
        var csub = document.getElementById("csub");
        if (now - lastActionAt < 5000) { cmsg.textContent = "Please wait a few seconds before posting again."; return; }
        var text = cf.body.value.trim();
        if (!text) return;
        var file = cf.media && cf.media.files ? cf.media.files[0] : null;
        var fileErr = validateFile(file, false);
        if (fileErr) { cmsg.textContent = fileErr; return; }

        lastActionAt = now;
        csub.disabled = true;
        cmsg.textContent = file ? "Uploading & posting…" : "Posting…";

        uploadFile(file, "comment", false).then(function (uploaded) {
          var m = user.user_metadata || {};
          var displayName = (profile && profile.full_name) || m.name || user.email.split("@")[0];
          var studyField = (profile && profile.study_field) || m.study_field || "";
          var avatarUrl = (profile && profile.avatar_url) || m.avatar_url || null;
          var instaHandle = (profile && profile.instagram) || m.instagram || "";

          return sb.from("comments").insert({
            post_id: postId,
            author_name: displayName.slice(0, 80),
            author_study: studyField.slice(0, 120) || null,
            author_avatar: avatarUrl,
            instagram: ig(instaHandle) || null,
            body: text,
            media_url: uploaded.url,
            media_type: uploaded.type
          });
        }).then(function (r) {
          csub.disabled = false;
          if (r.error) { cmsg.textContent = "Couldn't post: " + r.error.message; return; }
          cf.reset();
          if (cPreview) { cPreview.innerHTML = ""; cPreview.style.display = "none"; }
          cmsg.textContent = "";
          loadList();
        }).catch(function (err) {
          csub.disabled = false;
          cmsg.textContent = err.message || "Upload error.";
        });
      };
    }
  }

  function post(id) {
    var p = all().filter(function (x) { return x.id === id; })[0];
    if (!p) { app.innerHTML = '<div class="empty" style="margin-top:1.5rem">That publication doesn’t exist. <a href="#">Back to home feed</a></div>'; setNav("", ""); return; }
    document.title = p.title + " · Paigham"; setBg(p.section);
    var subLabel = (p.section === "science" && p.sub && S.science.subs[p.sub]) ? " · " + S.science.subs[p.sub] : "";
    var mediaHtml = renderMedia(p.media_url, p.media_type, p.title);
    var igHtml = p.ig ? ' · <a href="https://instagram.com/' + p.ig + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);font-weight:600">@' + p.ig + '</a>' : '';

    app.innerHTML = '<article class="article-card">' +
      '<p class="meta">' + fmt(p.date) + ' · ' + (S[p.section] ? S[p.section].t + subLabel : "") + ' · ' + mins(p.body) + ' min read</p>' +
      '<h1>' + esc(p.title) + '</h1>' +
      mediaHtml +
      '<div class="prose">' + md(p.body) + '</div>' +
      '<div class="author-banner">' +
        avatarHtml(p.avatar, p.author, "avatar-lg") +
        '<div><strong>' + esc(p.author) + '</strong>' +
        (p.study ? '<div class="note" style="font-size:.88rem">Studying: ' + esc(p.study) + '</div>' : '') +
        '<div class="note" style="font-size:.85rem">Published on Paigham' + igHtml + '</div></div>' +
      '</div>' +
      '<div id="comments-box"></div>' +
      '<a class="back" href="#' + p.section + '">← Back to ' + (S[p.section] ? S[p.section].t : "Home") + '</a>' +
    '</article>';
    setNav("", p.section);
    renderComments(p.id);
  }

  function about() {
    document.title = "About M. Sulaiman Saeed · Paigham"; setBg("home");
    app.innerHTML = '<article class="article-card"><h1>About Paigham</h1><div class="prose">' +
      '<p><strong>Paigham</strong> (پیغام) means <em>message</em> — an open research and writing platform built for students, researchers, and curious minds to publish review articles across Physics, Chemistry, and Biology, share model organism experiments, and discuss geopolitics and philosophy.</p>' +
      '<h2>About the Founder</h2>' +
      '<div class="founder-box">' +
      '<img id="founder-dp" class="founder-dp" src="dp.jpg" alt="M. Sulaiman Saeed">' +
      '<p>I’m <strong>M. Sulaiman Saeed</strong> (Muhammad Sulaiman Saeed), a Biology undergraduate at Sakarya University focused on wet-lab cell pathology, histology, toxicology, and CRISPR gene-editing mechanisms. Much of my laboratory research centers on zebrafish (<em>Danio rerio</em>) disease and seizure models, alongside independent writing on global affairs and philosophy.</p>' +
      '</div>' +
      '<h2>How to Participate</h2>' +
      '<p>Create a free researcher account with your email and password (we confirm your email once with a 6-digit code), set up your profile with your field of study and future research interests, and <a href="#write">submit your review article, photo, or PDF</a>.</p>' +
      '<h2>Contact</h2><ul>' +
      '<li>Admin Email: <a href="mailto:admin@paigham.live">admin@paigham.live</a></li>' +
      '<li>Feedback: <a href="mailto:feedback@paigham.live">feedback@paigham.live</a></li>' +
      '<li>Official Instagram: <a href="https://instagram.com/paigham.live" target="_blank" rel="noopener noreferrer">@paigham.live</a></li>' +
      '<li>Personal Instagram: <a href="https://instagram.com/thesulaimansaeed" target="_blank" rel="noopener noreferrer">@thesulaimansaeed</a></li>' +
      '</ul></div><a class="back" href="#">← Back to Home Feed</a></article>';

    var dpImg = document.getElementById("founder-dp");
    if (dpImg) {
      var fallbacks = ["dp.png", "dp.webp", "dp.jpeg"];
      var idx = 0;
      dpImg.onerror = function () {
        if (idx < fallbacks.length) dpImg.src = fallbacks[idx++];
      };
    }
    setNav("about", "");
  }

  function needSb(title) {
    app.innerHTML = '<article class="article-card"><h1>' + title + '</h1><p class="note">Accounts aren’t connected yet. Add your Supabase keys in config.js.</p></article>';
  }

  function login() {
    document.title = "Account · Paigham"; setBg("home"); setNav("login", "");
    if (!sb) return needSb("Account");

    // Logged-in Researcher Profile Editor
    if (user) {
      var m = user.user_metadata || {};
      var pName = (profile && profile.full_name) || m.name || "";
      var pStudy = (profile && profile.study_field) || m.study_field || "";
      var pFuture = (profile && profile.future_interests) || m.future_interests || "";
      var pBio = (profile && profile.bio) || m.bio || "";
      var pIg = (profile && profile.instagram) || m.instagram || "";
      var pAvatar = (profile && profile.avatar_url) || m.avatar_url || "";

      app.innerHTML = '<article class="article-card">' +
        '<div class="profile-header">' +
          avatarHtml(pAvatar, pName || user.email, "profile-dp") +
          '<div><h1 style="margin:0;font-size:1.65rem">' + esc(pName || "Complete Your Researcher Profile") + '</h1>' +
          '<p class="note">' + esc(user.email) + (pStudy ? ' · Studying: <strong>' + esc(pStudy) + '</strong>' : '') + '</p></div>' +
        '</div>' +
        '<form class="form" id="prof">' +
          '<label>Profile Photo (optional, JPG/PNG/WEBP)<input type="file" name="avatar" id="p-avatar" accept="image/jpeg,image/png,image/webp,image/gif"></label>' +
          '<div id="p-preview" class="preview-box" style="display:none"></div>' +
          '<label>Full Name <span class="req">*</span><input name="name" maxlength="80" placeholder="e.g. Ayesha Khan" required></label>' +
          '<label>What do you study? (Compulsory) <span class="req">*</span><input name="study" maxlength="120" placeholder="e.g. BSc Biology, Molecular Genetics, Physics, International Relations" required></label>' +
          '<label>Future Research &amp; Academic Interests (Compulsory) <span class="req">*</span><textarea class="short" name="future" maxlength="300" placeholder="e.g. CRISPR gene editing, zebrafish neurobiology, oncology, quantum optics..." required></textarea></label>' +
          '<label>Short Bio (optional)<textarea class="short" name="bio" maxlength="600" placeholder="Tell other researchers about your current lab work, university, or ideas..."></textarea></label>' +
          '<label>Instagram Username (optional)<input name="ig" maxlength="30" placeholder="optional_username" pattern="[A-Za-z0-9._]{1,30}"></label>' +
          '<div style="display:flex;gap:.75rem;flex-wrap:wrap">' +
            '<button class="btn" type="submit" id="psave">Save Researcher Profile</button>' +
            '<button class="btn secondary" id="out" type="button">Log out</button>' +
          '</div>' +
          '<p class="note" role="status" id="msg"></p>' +
        '</form>' +
      '</article>';

      app.querySelector("article").insertAdjacentHTML("beforeend",
        '<h2 style="font-size:1.2rem;margin-top:2rem">Change password</h2>' +
        '<form class="form" id="pwf" style="margin-top:.75rem"><label>New password (at least 8 characters)<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>' +
        '<label>Confirm new password<input type="password" name="pw2" minlength="8" autocomplete="new-password" required></label>' +
        '<button class="btn" type="submit">Update password</button><p class="note" role="status" id="pwmsg"></p></form>');
      document.getElementById("pwf").onsubmit = function (e) {
        e.preventDefault();
        var pm = document.getElementById("pwmsg");
        if (e.target.pw.value !== e.target.pw2.value) { pm.textContent = "The two passwords don’t match."; return; }
        pm.textContent = "Updating…";
        sb.auth.updateUser({ password: e.target.pw.value }).then(function (r) {
          pm.textContent = r.error ? r.error.message : "Password updated.";
          if (!r.error) e.target.reset();
        });
      };

      app.querySelector("article").insertAdjacentHTML("beforeend",
        '<h2 style="font-size:1.2rem;margin-top:2rem;color:#c81e1e">Delete account</h2>' +
        '<p class="note">Permanently deletes your profile, posts, comments and uploaded files. This cannot be undone.</p>' +
        '<form class="form" id="delf" style="margin-top:.75rem"><label>Type DELETE to confirm<input name="c" autocomplete="off" required></label>' +
        '<button class="btn secondary" type="submit">Delete my account</button><p class="note" role="status" id="delmsg"></p></form>');
      document.getElementById("delf").onsubmit = function (e) {
        e.preventDefault();
        var dm = document.getElementById("delmsg");
        if (e.target.c.value.trim() !== "DELETE") { dm.textContent = "Type DELETE exactly to confirm."; return; }
        dm.textContent = "Deleting…";
        var bucket = sb.storage.from("attachments");
        bucket.list(user.id, { limit: 1000 }).then(function (r) {
          var paths = (r.data || []).map(function (o) { return user.id + "/" + o.name; });
          return paths.length ? bucket.remove(paths) : null;
        }).then(function () { return sb.rpc("delete_my_account"); }).then(function (r) {
          if (r.error) throw new Error(r.error.message);
          return sb.auth.signOut();
        }).then(function () { location.hash = ""; }).catch(function (err) { dm.textContent = err.message || "Could not delete account."; });
      };

      var f = document.getElementById("prof");
      f.name.value = pName;
      f.study.value = pStudy;
      f.future.value = pFuture;
      f.bio.value = pBio;
      f.ig.value = pIg;

      var avInput = document.getElementById("p-avatar");
      var avPrev = document.getElementById("p-preview");
      bindPreview(avInput, avPrev, true);

      f.onsubmit = function (e) {
        e.preventDefault();
        var msg = document.getElementById("msg");
        var psave = document.getElementById("psave");
        var h = f.ig.value.trim().replace(/^@/, "");
        if (h && !ig(h)) {
          msg.textContent = "Instagram usernames can only contain letters, numbers, dots, and underscores (or leave it blank).";
          return;
        }
        var file = avInput && avInput.files ? avInput.files[0] : null;
        psave.disabled = true;
        msg.textContent = file ? "Uploading photo & saving profile…" : "Saving profile…";

        uploadFile(file, "avatar", true).then(function (uploaded) {
          var finalAvatar = uploaded.url || pAvatar || null;
          var fullName = f.name.value.trim();
          var studyField = f.study.value.trim();
          var futureInt = f.future.value.trim();
          var bioText = f.bio.value.trim();

          return sb.from("profiles").upsert({
            id: user.id,
            full_name: fullName,
            study_field: studyField,
            future_interests: futureInt,
            bio: bioText || null,
            instagram: h || null,
            avatar_url: finalAvatar,
            updated_at: new Date().toISOString()
          }).then(function (dbRes) {
            if (dbRes.error) throw new Error(dbRes.error.message);
            return sb.auth.updateUser({
              data: {
                name: fullName,
                study_field: studyField,
                future_interests: futureInt,
                bio: bioText,
                instagram: h,
                avatar_url: finalAvatar
              }
            });
          });
        }).then(function (authRes) {
          psave.disabled = false;
          if (authRes && authRes.error) { msg.textContent = authRes.error.message; return; }
          Promise.all([loadMyProfile(), loadAllProfiles()]).then(function () {
            msg.textContent = "Researcher profile saved!";
            login();
          });
        }).catch(function (err) {
          psave.disabled = false;
          msg.textContent = err.message || "Could not save profile.";
        });
      };

      document.getElementById("out").onclick = function () {
        profile = null;
        sb.auth.signOut();
      };
      return;
    }

    var AUTH_ERR = function (m) {
      if (/rate limit|exceeded|too many/i.test(m)) return "Too many emails were sent just now. Wait a few minutes and try again.";
      if (/invalid login/i.test(m)) return "Wrong email or password. If you joined before passwords existed, tap “Forgot password” to set one.";
      return m;
    };

    // Step 2A: one-time 6-digit code that confirms a NEW account's email
    if (mode === "verify") {
      app.innerHTML = '<article class="article-card" style="max-width:32rem;margin:2rem auto">' +
        '<h1>Confirm Your Email</h1>' +
        '<p class="note">We sent a 6-digit code to <strong>' + esc(pendingEmail) + '</strong>. Enter it once to activate your account. After that you log in with your email and password.</p>' +
        '<form class="form" id="vform" style="margin-top:1.25rem">' +
          '<label>6-Digit Code<input type="text" name="token" inputmode="numeric" pattern="[0-9]{6,8}" maxlength="8" autocomplete="one-time-code" placeholder="123456" required></label>' +
          '<button class="btn" type="submit">Confirm &amp; Log In</button>' +
          '<p class="note" role="status" id="msg"></p>' +
        '</form>' +
        '<p class="note" style="margin-top:1.25rem"><button class="linkbtn" id="resend" type="button">Resend code</button> · <button class="linkbtn" id="back-auth" type="button">Back</button></p>' +
      '</article>';
      var vmsg = function (t) { document.getElementById("msg").textContent = t; };
      document.getElementById("back-auth").onclick = function () { mode = "login"; login(); };
      document.getElementById("resend").onclick = function () {
        vmsg("Sending a new code…");
        sb.auth.resend({ type: "signup", email: pendingEmail }).then(function (r) {
          vmsg(r.error ? AUTH_ERR(r.error.message) : "A new code was sent. Check spam too.");
        });
      };
      document.getElementById("vform").onsubmit = function (e) {
        e.preventDefault();
        vmsg("Checking code…");
        sb.auth.verifyOtp({ email: pendingEmail, token: e.target.token.value.trim(), type: "signup" }).then(function (r) {
          if (r.error) return vmsg(AUTH_ERR(r.error.message));
          mode = "login";
        });
      };
      return;
    }

    // Step 2B: Forgot password -> 6-digit recovery code
    if (mode === "forgot") {
      app.innerHTML = '<article class="article-card" style="max-width:32rem;margin:2rem auto">' +
        '<h1>Reset Password</h1>' +
        '<p class="note">Enter your account email and we will send a 6-digit recovery code.</p>' +
        '<form class="form" id="fform" style="margin-top:1.25rem">' +
          '<label>Email Address<input type="email" name="email" autocomplete="email" required></label>' +
          '<button class="btn" type="submit">Send Recovery Code</button>' +
          '<p class="note" role="status" id="msg"></p>' +
        '</form>' +
        '<p class="note" style="margin-top:1.25rem"><button class="linkbtn" id="to-login" type="button">← Back to Log in</button></p>' +
      '</article>';
      var fmsg = function (t) { document.getElementById("msg").textContent = t; };
      document.getElementById("to-login").onclick = function () { mode = "login"; login(); };
      document.getElementById("fform").onsubmit = function (e) {
        e.preventDefault();
        var email = e.target.email.value.trim();
        fmsg("Sending recovery code…");
        sb.auth.resetPasswordForEmail(email).then(function (r) {
          if (r.error) return fmsg(AUTH_ERR(r.error.message));
          pendingEmail = email; mode = "reset"; login();
        });
      };
      return;
    }

    // Step 2C: recovery code + new password
    if (mode === "reset") {
      app.innerHTML = '<article class="article-card" style="max-width:32rem;margin:2rem auto">' +
        '<h1>Enter Recovery Code</h1>' +
        '<p class="note">Enter the 6-digit code sent to <strong>' + esc(pendingEmail) + '</strong> and choose a new password.</p>' +
        '<form class="form" id="rform" style="margin-top:1.25rem">' +
          '<label>6-Digit Recovery Code<input type="text" name="token" inputmode="numeric" pattern="[0-9]{6,8}" maxlength="8" autocomplete="one-time-code" placeholder="123456" required></label>' +
          '<label>New Password (at least 8 characters)<input type="password" name="password" minlength="8" autocomplete="new-password" required></label>' +
          '<button class="btn" type="submit">Update Password &amp; Log In</button>' +
          '<p class="note" role="status" id="msg"></p>' +
        '</form>' +
        '<p class="note" style="margin-top:1.25rem"><button class="linkbtn" id="resend-rec" type="button">Resend code</button> · <button class="linkbtn" id="cancel-rec" type="button">Cancel</button></p>' +
      '</article>';
      var rmsg = function (t) { document.getElementById("msg").textContent = t; };
      document.getElementById("cancel-rec").onclick = function () { mode = "login"; login(); };
      document.getElementById("resend-rec").onclick = function () {
        rmsg("Resending code…");
        sb.auth.resetPasswordForEmail(pendingEmail).then(function (r) {
          rmsg(r.error ? AUTH_ERR(r.error.message) : "New recovery code sent.");
        });
      };
      document.getElementById("rform").onsubmit = function (e) {
        e.preventDefault();
        var token = e.target.token.value.trim(), newPw = e.target.password.value;
        rmsg("Checking code…");
        recovering = true;
        sb.auth.verifyOtp({ email: pendingEmail, token: token, type: "recovery" }).then(function (r) {
          if (r.error) throw new Error(r.error.message);
          return sb.auth.updateUser({ password: newPw });
        }).then(function (u) {
          if (u.error) throw new Error(u.error.message);
          recovering = false; mode = "login"; login();
        }).catch(function (err) {
          recovering = false;
          rmsg(AUTH_ERR(err.message || "Could not reset password."));
        });
      };
      return;
    }

    // Step 1: Log in with email + password, or create an account
    var su = mode === "signup";
    app.innerHTML = '<article class="article-card" style="max-width:34rem;margin:2rem auto">' +
      '<h1>' + (su ? "Join Paigham Research Network" : "Log in to Paigham") + '</h1>' +
      '<p class="note" style="margin-bottom:1.1rem">' + (su ? "Create your researcher account. We email you a 6-digit code once to confirm your address." : "Log in with your email and password. You stay logged in on this device.") + '</p>' +
      '<form class="form" id="auth">' +
        (su ? '<label>Full Name <span class="req">*</span><input name="name" maxlength="80" placeholder="e.g. Muhammad Sulaiman Saeed" required></label>' +
              '<label>What do you study? <span class="req">*</span><input name="study" maxlength="120" placeholder="e.g. BSc Biology, Chemistry, Physics, Political Science" required></label>' +
              '<label>Future Interests <span class="req">*</span><input name="future" maxlength="300" placeholder="e.g. Zebrafish toxicology, oncology, astrophysics, geopolitics" required></label>' : '') +
        '<label>Email <span class="req">*</span><input type="email" name="email" autocomplete="email" required></label>' +
        '<label>Password' + (su ? ' (at least 8 characters)' : '') + ' <span class="req">*</span><input type="password" name="password" minlength="8" autocomplete="' + (su ? "new-password" : "current-password") + '" required></label>' +
        (su ? '<label>Confirm Password <span class="req">*</span><input type="password" name="password2" minlength="8" autocomplete="new-password" required></label>' : '') +
        '<button class="btn" type="submit">' + (su ? "Create Account" : "Log in") + '</button>' +
        '<p class="note" role="status" id="msg"></p>' +
      '</form>' +
      '<div style="margin-top:1.25rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem">' +
        '<span class="note">' + (su ? 'Already have an account? <button class="linkbtn" id="flip" type="button">Log in</button>' : 'New to Paigham? <button class="linkbtn" id="flip" type="button">Create account</button>') + '</span>' +
        (su ? '' : '<button class="linkbtn" id="forgot" type="button">Forgot password?</button>') +
      '</div>' +
    '</article>';

    var msg = function (t) { document.getElementById("msg").textContent = t; };
    document.getElementById("flip").onclick = function () { mode = su ? "login" : "signup"; login(); };
    if (!su) document.getElementById("forgot").onclick = function () { mode = "forgot"; login(); };

    document.getElementById("auth").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, email = f.email.value.trim(), pw = f.password.value;
      if (su) {
        if (pw !== f.password2.value) return msg("The two passwords don’t match.");
        msg("Creating account…");
        sb.auth.signUp({ email: email, password: pw, options: {
          data: { name: f.name.value.trim(), study_field: f.study.value.trim(), future_interests: f.future.value.trim() },
          emailRedirectTo: location.origin
        } }).then(function (r) {
          if (r.error) return msg(AUTH_ERR(r.error.message));
          if (r.data.user && r.data.user.identities && !r.data.user.identities.length) return msg("This email already has an account. Log in, or tap “Forgot password”.");
          if (r.data.session) return; // confirmation is off: already logged in
          pendingEmail = email; mode = "verify"; login();
        });
      } else {
        msg("Logging in…");
        sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
          if (r.error) {
            if (/not confirmed/i.test(r.error.message)) {
              pendingEmail = email;
              sb.auth.resend({ type: "signup", email: email }).then(function () { mode = "verify"; login(); });
              return;
            }
            return msg(AUTH_ERR(r.error.message));
          }
        });
      }
    };
  }

  function write(defaultSec) {
    document.title = "Publish on Paigham · Paigham"; setBg("home"); setNav("write", "");
    if (!sb) return needSb("Publish on Paigham");
    if (!user) {
      app.innerHTML = '<article class="article-card"><h1>Publish on Paigham</h1><p class="note">Log in or verify your email first to publish review articles across Science, share Model Organism work, or post Geopolitics &amp; Philosophy thoughts. <a href="#login" style="color:var(--accent);font-weight:600">Log in or create an account →</a></p></article>';
      return;
    }

    var m = user.user_metadata || {};
    var hasStudy = (profile && profile.study_field) || m.study_field;
    if (!hasStudy) {
      app.innerHTML = '<article class="article-card"><h1>Complete Your Researcher Profile First</h1><p class="note">Before publishing, please fill in what you study and your future interests on your profile page. <a href="#login" style="color:var(--accent);font-weight:600">Complete profile now →</a></p></article>';
      return;
    }

    app.innerHTML = '<article class="article-card">' +
      '<h1>Publish Review Article, Research Note, or Thought</h1>' +
      '<p class="note">Submit review articles across Physics, Chemistry &amp; Biology, share zebrafish or model organism findings, or post Geopolitics &amp; Philosophy reflections. Supports Markdown, photos, and PDFs (max 5 MB).</p>' +
      '<form class="form" id="wf" style="margin-top:1.35rem">' +
        '<label>Category<select name="section" id="sec-sel">' + keys.map(function (k) { return '<option value="' + k + '">' + S[k].t + '</option>'; }).join("") + '</select></label>' +
        '<label id="sub-wrap">Science Branch<select name="sub_section">' +
          '<option value="physics">Physics</option><option value="chemistry">Chemistry</option><option value="biology">Biology</option>' +
        '</select></label>' +
        '<label>Format<select name="post_type" id="type-sel">' +
          '<option value="review">Review Article / Literature Synthesis</option>' +
          '<option value="article">Research Note / Essay</option>' +
          '<option value="thought">Thought / Open Question</option>' +
        '</select></label>' +
        '<label>Title <span class="req">*</span><input name="title" minlength="3" maxlength="140" placeholder="e.g. Mechanisms of CRISPR-Cas9 Off-Target Effects in Danio rerio" required></label>' +
        '<label>Abstract / Short Summary<input name="excerpt" maxlength="240" placeholder="One or two sentences summarizing your key takeaway..."></label>' +
        '<label>Attach PDF Paper or Photo Figure (optional, max 5 MB)<input type="file" name="media" id="w-media" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"></label>' +
        '<div id="w-preview" class="preview-box" style="display:none"></div>' +
        '<label>Full Text / Article Body <span class="req">*</span><textarea name="body" minlength="10" maxlength="25000" placeholder="Write your review article, experimental observations, or thoughts here (Markdown supported)..." required></textarea></label>' +
        '<button class="btn" type="submit" id="wsub">Submit for Publication</button>' +
        '<p class="note" role="status" id="msg"></p>' +
      '</form>' +
    '</article>';

    var secSel = document.getElementById("sec-sel");
    var subWrap = document.getElementById("sub-wrap");
    var typeSel = document.getElementById("type-sel");
    if (defaultSec && S[defaultSec]) {
      secSel.value = defaultSec;
      if (defaultSec === "geopolitics" || defaultSec === "philosophy") typeSel.value = "thought";
    }
    function toggleSub() { subWrap.style.display = secSel.value === "science" ? "grid" : "none"; }
    secSel.onchange = toggleSub;
    toggleSub();

    var wMediaInput = document.getElementById("w-media");
    var wPreview = document.getElementById("w-preview");
    bindPreview(wMediaInput, wPreview, false);

    document.getElementById("wf").onsubmit = function (e) {
      e.preventDefault();
      var now = Date.now();
      var msg = document.getElementById("msg");
      var wsub = document.getElementById("wsub");
      if (now - lastActionAt < 10000) { msg.textContent = "Please wait a few seconds before submitting again."; return; }
      var f = e.target;
      var file = f.media && f.media.files ? f.media.files[0] : null;
      var fileErr = validateFile(file, false);
      if (fileErr) { msg.textContent = fileErr; return; }

      lastActionAt = now;
      wsub.disabled = true;
      msg.textContent = file ? "Uploading attachment & submitting…" : "Submitting…";

      uploadFile(file, "post", false).then(function (uploaded) {
        var displayName = (profile && profile.full_name) || m.name || user.email.split("@")[0];
        var studyField = (profile && profile.study_field) || m.study_field || "";
        var avatarUrl = (profile && profile.avatar_url) || m.avatar_url || null;
        var instaHandle = (profile && profile.instagram) || m.instagram || "";

        var payload = {
          section: f.section.value,
          sub_section: f.section.value === "science" ? f.sub_section.value : null,
          post_type: f.post_type.value,
          title: f.title.value.trim(),
          excerpt: f.excerpt.value.trim(),
          body: f.body.value,
          media_url: uploaded.url,
          media_type: uploaded.type,
          author_name: displayName.slice(0, 80),
          author_study: studyField.slice(0, 120) || null,
          author_avatar: avatarUrl,
          instagram: ig(instaHandle) || null
        };
        return sb.from("posts").insert(payload);
      }).then(function (r) {
        wsub.disabled = false;
        if (r.error) { msg.textContent = "Couldn’t submit: " + r.error.message; return; }
        f.reset();
        if (wPreview) { wPreview.innerHTML = ""; wPreview.style.display = "none"; }
        toggleSub();
        msg.textContent = "Submitted! Your work will appear on the feed once approved.";
      }).catch(function (err) {
        wsub.disabled = false;
        msg.textContent = err.message || "Upload error.";
      });
    };
  }

  function route() {
    var raw; try { raw = decodeURIComponent(location.hash.replace(/^#\/?/, "")); } catch (_e) { raw = ""; }
    var parts = raw.split("?");
    var h = parts[0];
    var params = new URLSearchParams(parts[1] || "");
    if (!h) home();
    else if (S[h]) section(h);
    else if (h === "about") about();
    else if (h === "login") login();
    else if (h === "write") write(params.get("section"));
    else post(h);
    window.scrollTo(0, 0);
  }

  function syncProfileOnLogin() {
    if (!sb || !user) return Promise.resolve();
    return sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (r) {
      if (r.data) {
        profile = r.data;
        return;
      }
      var m = user.user_metadata || {};
      if (m.study_field && m.future_interests) {
        var newProf = {
          id: user.id,
          full_name: (m.name || user.email.split("@")[0]).slice(0, 80),
          study_field: String(m.study_field).slice(0, 120),
          future_interests: String(m.future_interests).slice(0, 300),
          bio: m.bio || null,
          instagram: ig(m.instagram) || null,
          avatar_url: m.avatar_url || null
        };
        return sb.from("profiles").upsert(newProf).then(function () {
          profile = newProf;
          return loadAllProfiles();
        });
      }
    });
  }

  function loadMyProfile() {
    if (!sb || !user) { profile = null; return Promise.resolve(); }
    return sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (r) {
      profile = r.data || null;
    });
  }

  function loadAllProfiles() {
    if (!sb) return Promise.resolve();
    return sb.from("profiles").select("id,full_name,study_field,future_interests,bio,instagram,avatar_url").order("updated_at", { ascending: false }).limit(20)
      .then(function (r) { profilesList = r.data || []; });
  }

  function loadCommunity() {
    if (!sb) return Promise.resolve();
    return sb.from("posts").select("id,title,section,sub_section,post_type,excerpt,body,media_url,media_type,created_at,author_name,author_study,author_avatar,instagram").eq("approved", true).order("created_at", { ascending: false }).limit(100)
      .then(function (r) { community = r.data || []; });
  }

  function refresh() {
    document.getElementById("nav-login").textContent = user ? "My Profile" : "Log in / Join";
    if (recovering) return;
    if (/^#(login|write)/.test(location.hash)) route();
  }

  var rig = document.getElementById("rig");
  if (!window.matchMedia("(prefers-reduced-motion:reduce)").matches) {
    window.addEventListener("pointermove", function (e) {
      rig.style.setProperty("--ry", ((e.clientX / innerWidth - .5) * 30) + "deg");
      rig.style.setProperty("--rx", ((.5 - e.clientY / innerHeight) * 20) + "deg");
    });
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.update(); });
      });
      navigator.serviceWorker.register("sw.js");
    });
  }
  window.addEventListener("hashchange", route);
  route();

  if (sb) {
    Promise.all([loadCommunity(), loadAllProfiles()]).then(function () {
      if (!/^#(login|write|about)/.test(location.hash)) route();
    });
    sb.auth.getSession().then(function (r) {
      user = r.data.session ? r.data.session.user : null;
      syncProfileOnLogin().then(refresh);
    });
    sb.auth.onAuthStateChange(function (_e, s) {
      user = s ? s.user : null;
      syncProfileOnLogin().then(refresh);
    });
  }
})();
