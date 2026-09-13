/**
 * AI/M.I. Content Script v1.0
 * A Layer Between You and the Noise
 *
 * 4 capabilities:
 *  1. Toxicity Feed Filter  — blur toxic posts & messages (WhatsApp Web, Instagram, Twitter, Reddit, Search)
 *  2. NSFW Image Shield     — blur explicit images via CNN (offscreen WASM)
 *  3. Semantic Topic Filter — hide posts matching user topics via semantic clusters & similarity
 *  4. Pre-Post Vibe Checker — detect toxicity in composer drafts before sending, offer clean rephrase
 */

(function () {
  "use strict";
  if (window.__aimiLoaded) return;
  window.__aimiLoaded = true;

  /* ══════════════════════════════════════════════════════════════
   *  SETTINGS (synced from chrome.storage)
   * ══════════════════════════════════════════════════════════════ */
  let CFG = {
    toxicityEnabled: true,
    nsfwEnabled: true,
    semanticEnabled: false,
    vibeCheckEnabled: true,
    toxicityThreshold: 0.55,
    semanticThreshold: 0.60,
    semanticTopics: [],
    nsfwThreshold: 0.30
  };

  /* Session stats */
  let STATS = { postsScanned: 0, toxicCount: 0, nsfwCount: 0, semanticMatches: 0, toxicitySum: 0 };

  function saveStats() {
    chrome.storage?.local?.set({ aimiStats: STATS });
  }

  function loadSettings(cb) {
    if (!chrome.storage?.sync) { cb(); return; }
    chrome.storage.sync.get(["aimiConfig"], (data) => {
      if (data.aimiConfig) Object.assign(CFG, data.aimiConfig);
      cb();
    });
  }

  function listenSettingsChanges() {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === "sync" && changes.aimiConfig) {
        Object.assign(CFG, changes.aimiConfig.newValue || {});
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  CONTENT-HASH CACHE  (session-scoped, bounded)
   * ══════════════════════════════════════════════════════════════ */
  const MAX_CACHE = 500;
  const inferenceCache = new Map(); // hash → { type, score, result, ts }

  function simpleHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function cacheGet(hash) { return inferenceCache.get(hash); }
  function cacheSet(hash, val) {
    if (inferenceCache.size >= MAX_CACHE) {
      const oldest = inferenceCache.keys().next().value;
      inferenceCache.delete(oldest);
    }
    inferenceCache.set(hash, val);
  }

  /* ══════════════════════════════════════════════════════════════
   *  BOUNDED TWO-TIER QUEUE
   * ══════════════════════════════════════════════════════════════ */
  const MAX_QUEUE = 30;
  const queue = { high: [], low: [] };
  const pendingIds = new Set();
  let queueRunning = false;

  function enqueue(job) {
    if (pendingIds.has(job.id)) return;
    // Check cache before queuing
    const cached = cacheGet(job.hash);
    if (cached) { applyResult(job.element, job.type, cached); return; }

    pendingIds.add(job.id);
    if (job.priority === "HIGH") {
      queue.high.push(job);
    } else {
      if (queue.high.length + queue.low.length >= MAX_QUEUE) {
        queue.low.shift();
      }
      queue.low.push(job);
    }
    if (!queueRunning) drainQueue();
  }

  async function drainQueue() {
    queueRunning = true;
    while (queue.high.length > 0 || queue.low.length > 0) {
      const job = queue.high.shift() || queue.low.shift();
      if (!job) break;
      pendingIds.delete(job.id);
      try { await processJob(job); } catch {}
      await new Promise(r => setTimeout(r, 0)); // yield to main thread
    }
    queueRunning = false;
  }

  /* ══════════════════════════════════════════════════════════════
   *  ON-DEVICE TOXICITY ANALYSIS (client-side fallback engine)
   * ══════════════════════════════════════════════════════════════ */
  const FILLER_WORDS = [
    "mc","bc","b.c.","m.c.","mkc","bsdk","bkl","bck","madarchod","behenchod","bhenchod",
    "bhosadike","bhosdike","bhosdiwale","cunt","fck","stfu","kys"
  ];
  const TOXIC_WORDS = [
    "chutiya","chutiye","bakchodi","saala","saale","kutta","kutte","harami","haraami",
    "kamina","kaminey","kamine","randi","bhadwa","bhadwe","gandu","gndu","lodu","laude",
    "lavde","lnd","lund","chut","gaand","bhosdi","tatte","jhaatu","chod","chodo","chodna",
    "chudai","chudwa","gaandmasti","dalaal","suar","suar ki aulad","namak haram","haraamzada",
    "bewakoof","gadha","ullu","ullu ke patthe","dimaag kharab","pagal","andhe","bakwas",
    "chup kar","aukaat","aukat","bhad me ja","bhaad mein ja","mar ja","jahil","nirlajj",
    "fuck","fucking","fucked","fucker","goat fucker","shit","bitch","asshole","moron",
    "idiot","retard","scumbag","dickhead","bastard","hate you","kill yourself","go die",
    "rape","balatkaar","kutte ki zat","कुत्ते की ज़ात","सूअर की औलाद","gadhe ki aulad",
    "गधे की औलाद","bandar ki aulad","बंदर की औलाद","हरामी","हरामज़ादा","चूतिया","चुतिया",
    "टट्टी","लंड","गांडू","भड़वा","रांड","रंडी","चूत","lavda","लौड़ा","lawda","loda",
    "chodu","चोदू","chutmar","चूतमार","chutiyapa","चूतियापा","बहनचोद","मादरचोद","भोसड़ीके",
    "भोसड़ीके","गांड","अपशब्द","फक","motherfucker","dumbass","dipshit","bullshit",
    "piece of shit","shut up","get lost","whore","slut","dick","pussy","teri maa ki",
    "teri ma ki","maa chuda","gand mara","gaand mara","lode","lauda","jhantu","jhant",
    "chinal","hijra","hijda","bhen ke lode","teri aisi taisi","ugly","loser","clown",
    "disgusting","pathetic","trash","garbage","die"
  ];
  const THREATS = [
    "send you to heaven","hunt you down","will end you","dig a grave","put you in a body bag",
    "sleep with the fishes","put you in the ground","send you to god","meet your maker",
    "know where you live","i will kill you","slit your throat","watch your back","die in a fire"
  ];
  const REPHRASE = {
    "idiot":"misguided person","idiots":"those who disagree","moron":"misinformed person",
    "morons":"misinformed people","stupid":"unhelpful","hate":"disagree with",
    "shut up":"let's pause","chup kar":"let's pause","fuck off":"please give me space",
    "fuck you":"I disagree with you","fucking":"extremely","shit":"subpar","crap":"low quality",
    "asshole":"unreasonable person","chutiya":"confused person","chutiye":"confused person",
    "saala":"friend","saale":"friend","gandu":"fellow","bitch":"person","bastard":"individual",
    "bewakoof":"uninformed person","gadha":"stubborn one","ullu":"friend",
    "bakwas":"unhelpful discussion","nikal":"please leave","chal nikal":"let's move on",
    "suar":"unpleasant individual","pagal":"excited","aukaat":"capability","aukat":"capability",
    "bhosdi wala":"friend","bhosdike":"friend","kaminey":"friend","kamine":"friend",
    "ugly":"unique","loser":"striving learner","clown":"entertainer","चूतिया":"confused person",
    "हरामी":"mischievous person"
  };

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function normLeet(text) {
    const m = {"0":"o","1":"i","3":"e","4":"a","5":"s","@":"a","$":"s","!":"i"};
    let n = ""; for (const c of (text||"")) n += m[c]||c;
    return n.replace(/f[*_\-.]+(u?)c?k/gi,"fuck")
            .replace(/f[*_\-.]+(u?)c?king/gi,"fucking")
            .replace(/sh[*_\-.]+(i?)t/gi,"shit")
            .replace(/b[*_\-.]+(i?)t?ch/gi,"bitch")
            .replace(/b[*_\-.]+sdk/gi,"bsdk")
            .replace(/ch[*_\-.]+t/gi,"chut");
  }
  function buildW(w, isFiller) {
    const dev=/[\u0900-\u097F]/.test(w), e=esc(w);
    let tR,rR;
    if(dev){tR=new RegExp("(?<=^|[^\\p{L}\\p{N}])"+e+"(?=$|[^\\p{L}\\p{N}])","ui");rR=new RegExp("(?<=^|[^\\p{L}\\p{N}])"+e+"(?=$|[^\\p{L}\\p{N}])","gui");}
    else{const p=/^\w/.test(w)?"\\b":"(?<=^|\\s)",s=/\w$/.test(w)?"\\b":"(?=$|\\s)";tR=new RegExp(p+e+s,"i");rR=new RegExp(p+e+s,"gi");}
    return {word:w,isFiller,tR,rR};
  }
  const COMPILED_SWEARS = [...FILLER_WORDS.map(w=>buildW(w,true)),...TOXIC_WORDS.map(w=>buildW(w,false))].sort((a,b)=>b.word.length-a.word.length);

  function localToxicityScore(text) {
    if (!text || text.length < 2) return 0;
    const norm = normLeet(text), lower = norm.toLowerCase();
    let score = 0;
    for (const t of THREATS) { if (lower.includes(t)) { score = Math.max(score, 0.95); } }
    for (const item of COMPILED_SWEARS) {
      if (item.tR.test(norm)) { score = Math.max(score, item.isFiller ? 0.75 : 0.85); }
    }
    return score;
  }

  function localRephrase(rawText) {
    const norm = normLeet(rawText);
    let sug = norm;
    for (const t of THREATS) sug = sug.replace(new RegExp(esc(t),"gi"), "resolve our disagreement calmly");
    for (const item of COMPILED_SWEARS) {
      if (item.tR.test(sug)) {
        const rep = item.isFiller ? "" : (REPHRASE[item.word.toLowerCase()] || REPHRASE[item.word] || "***");
        sug = sug.replace(item.rR, rep);
      }
    }
    sug = sug.replace(/\s*,\s*,+/g,",").replace(/\s*,\s*/g,", ").replace(/\s{2,}/g," ").trim();
    return sug || "I would like to offer constructive feedback on this.";
  }

  /* ══════════════════════════════════════════════════════════════
   *  TOXICITY ANALYSIS  (background bridge → local fallback)
   * ══════════════════════════════════════════════════════════════ */
  async function analyzeToxicity(text) {
    // Try background worker → local FastAPI server
    if (chrome.runtime?.sendMessage) {
      try {
        const res = await new Promise(resolve => {
          chrome.runtime.sendMessage({type:"CHECK_VIBE_BACKEND", text}, r => resolve(chrome.runtime.lastError ? null : r));
        });
        if (res?.success && res.data) {
          return {
            score: res.data.status === "toxic" ? 0.85 : 0.1,
            isToxic: res.data.status === "toxic",
            reason: res.data.reason || "AI",
            suggestion: res.data.rephrase_suggestion || text
          };
        }
      } catch {}
    }
    // On-device fallback
    const score = localToxicityScore(text);
    return {
      score,
      isToxic: score >= CFG.toxicityThreshold,
      reason: score >= CFG.toxicityThreshold ? "Abusive language detected" : "safe",
      suggestion: localRephrase(text)
    };
  }

  /* ══════════════════════════════════════════════════════════════
   *  NSFW IMAGE CLASSIFICATION  (via offscreen WASM worker)
   * ══════════════════════════════════════════════════════════════ */
  function resolveUrl(rawUrl) {
    if (!rawUrl) return "";
    try { return new URL(rawUrl, window.location.href).href; }
    catch { return rawUrl.startsWith("//") ? window.location.protocol + rawUrl : rawUrl; }
  }

  async function classifyImage(url) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type:"CLASSIFY_IMAGE", url, threshold: CFG.nsfwThreshold}, res =>
        resolve(chrome.runtime.lastError ? {success:false} : (res || {success:false}))
      );
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  JOB PROCESSOR
   * ══════════════════════════════════════════════════════════════ */
  async function processJob(job) {
    if (!document.body.contains(job.element)) return;

    if (job.type === "toxicity") {
      if (!CFG.toxicityEnabled) return;
      const result = await analyzeToxicity(job.text);
      cacheSet(job.hash, {type:"toxicity", score:result.score, isToxic:result.isToxic, suggestion:result.suggestion});
      STATS.postsScanned++;
      STATS.toxicitySum += result.score;
      if (result.isToxic) {
        STATS.toxicCount++;
        applyBlurPost(job.element, result.score, result.suggestion);
      }
      saveStats();

    } else if (job.type === "nsfw") {
      if (!CFG.nsfwEnabled) return;
      const res = await classifyImage(job.url);
      if (res?.success && res.result) {
        cacheSet(job.hash, {type:"nsfw", isUnsafe:res.result.isUnsafe, score:res.result.confidence});
        if (res.result.isUnsafe) {
          STATS.nsfwCount++;
          applyBlurImage(job.element, res.result);
          saveStats();
        }
      }

    } else if (job.type === "semantic") {
      if (!CFG.semanticEnabled || CFG.semanticTopics.length === 0) return;
      const score = localSemanticScore(job.text, CFG.semanticTopics);
      cacheSet(job.hash, {type:"semantic", score, matches:score >= CFG.semanticThreshold});
      if (score >= CFG.semanticThreshold) {
        STATS.semanticMatches++;
        applyBlurPost(job.element, score, null, "semantic");
        saveStats();
      }
    }
  }

  function applyResult(el, type, cached) {
    if (!el || !document.body.contains(el)) return;
    if (type === "toxicity" && cached.isToxic) applyBlurPost(el, cached.score, cached.suggestion);
    else if (type === "nsfw" && cached.isUnsafe) applyBlurImage(el, {confidence:cached.score});
    else if (type === "semantic" && cached.matches) applyBlurPost(el, cached.score, null, "semantic");
  }

  /* ══════════════════════════════════════════════════════════════
   *  SEMANTIC SCORE (Thematic Semantic Clusters + Word Similarity)
   * ══════════════════════════════════════════════════════════════ */
  const THEMATIC_CLUSTERS = {
    "politics": ["politic", "election", "senate", "congress", "president", "bipartisan", "democrat", "republican", "parliament", "lobby", "minister", "campaign", "ballot", "legislation", "governance"],
    "crypto": ["crypto", "bitcoin", "ethereum", "solana", "token", "presale", "airdrop", "arbitrage", "blockchain", "binance", "uniswap", "pump", "wallet", "nft"],
    "crypto scams": ["crypto", "pump", "presale", "arbitrage", "100x", "gem", "whitelist", "guaranteed", "roi", "exploit", "smart contract"],
    "hate speech": ["slur", "harass", "attack", "scum", "repulsive", "filth", "vermin", "worthless", "subhuman"],
    "violence": ["assault", "murder", "kill", "threat", "weapon", "blood", "execute", "injure"]
  };

  function localSemanticScore(text, topics) {
    const lower = text.toLowerCase();
    let maxScore = 0;

    for (const rawTopic of topics) {
      const topic = rawTopic.trim().toLowerCase();
      if (!topic) continue;

      if (lower.includes(topic)) {
        maxScore = Math.max(maxScore, 0.90);
        continue;
      }

      let relatedTerms = [];
      for (const [key, cluster] of Object.entries(THEMATIC_CLUSTERS)) {
        if (topic.includes(key) || key.includes(topic)) {
          relatedTerms.push(...cluster);
        }
      }

      if (relatedTerms.length > 0) {
        let matchCount = 0;
        for (const term of relatedTerms) {
          if (lower.includes(term)) matchCount++;
        }
        if (matchCount >= 2) {
          maxScore = Math.max(maxScore, 0.85);
        } else if (matchCount === 1) {
          maxScore = Math.max(maxScore, 0.65);
        }
      }

      const words = topic.split(/\s+/).filter(w => w.length >= 3);
      if (words.length > 0) {
        let matched = 0;
        for (const w of words) {
          if (lower.includes(w)) matched++;
        }
        const ratio = matched / words.length;
        if (ratio >= 0.5) maxScore = Math.max(maxScore, ratio * 0.8);
      }
    }

    return maxScore;
  }

  /* ══════════════════════════════════════════════════════════════
   *  RENDERER — Inline Line Blur/Reveal UI
   * ══════════════════════════════════════════════════════════════ */
  function applyBlurPost(el, score, suggestion, type = "toxicity") {
    if (el.dataset.aimiBlurred === "true") return;
    el.dataset.aimiBlurred = "true";

    // If el itself is an inline/leaf text container
    if (el.matches?.("span.selectable-text, span._a9zs, div._amid, p, li") || (el.matches?.("[dir='auto']") && !el.querySelector("[dir='auto']"))) {
      blurElement(el);
      return;
    }

    // Find candidate leaf text elements (WhatsApp, Instagram, Search, Feeds)
    const rawCandidates = Array.from(el.querySelectorAll(
      "span.selectable-text, span._a9zs, div._amid, div[dir='auto'], span[dir='auto'], li, p, .VwiC3b, [data-aimi-text], .post-body, .tweet-text, .copyable-text"
    ));
    // Filter to leaf nodes (don't pick parent wrappers if children are candidates)
    const candidateLines = rawCandidates.filter(c => !rawCandidates.some(other => other !== c && c.contains(other)));

    const targets = [];
    if (candidateLines.length > 0) {
      candidateLines.forEach(line => {
        const t = line.innerText?.trim() || "";
        if (t.length >= 2 && localToxicityScore(t) >= CFG.toxicityThreshold) {
          targets.push(line);
        }
      });
      // Fallback: if no individual leaf triggered on its own, pick highest scoring candidate
      if (targets.length === 0) {
        let highest = null;
        let maxS = 0;
        candidateLines.forEach(line => {
          const t = line.innerText?.trim() || "";
          const s = localToxicityScore(t);
          if (s > maxS) { maxS = s; highest = line; }
        });
        if (highest && maxS > 0) targets.push(highest);
        else targets.push(candidateLines[0]);
      }
    }

    if (targets.length === 0) {
      targets.push(el);
    }

    targets.forEach(target => blurElement(target));
  }

  function blurElement(target) {
    if (!target || target.classList.contains("aimi-line-blurred") || target.closest(".aimi-line-blurred")) return;
    target.classList.add("aimi-line-blurred");
    target.setAttribute("title", "Sensitive content · Click to reveal");

    const revealHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      target.classList.remove("aimi-line-blurred");
      target.removeAttribute("title");
      target.removeEventListener("click", revealHandler, true);
    };

    target.addEventListener("click", revealHandler, true);
  }

  /* ══════════════════════════════════════════════════════════════
   *  RENDERER — NSFW Image Blur/Reveal
   * ══════════════════════════════════════════════════════════════ */
  function applyBlurImage(img, result) {
    if (img.dataset.aimiNsfwBlurred === "true") return;
    img.dataset.aimiNsfwBlurred = "true";
    img.style.setProperty("filter", "blur(28px) brightness(0.8)", "important");
    img.style.setProperty("transition", "filter 0.25s ease", "important");
    img.classList.add("aimi-nsfw-blurred");

    let wrapper = img.closest(".aimi-nsfw-container");
    if (!wrapper) {
      const targetEl = img.parentElement?.tagName === "PICTURE" ? img.parentElement : img;
      const parent = targetEl.parentElement;
      if (!parent) return;
      wrapper = document.createElement("div");
      wrapper.className = "aimi-nsfw-container";
      wrapper.style.cssText = "position:relative;display:inline-block;border-radius:6px;overflow:hidden;";
      parent.insertBefore(wrapper, targetEl);
      wrapper.appendChild(targetEl);
    }

    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "aimi-nsfw-toggle";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg> Show`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); e.preventDefault();
      const blurred = img.style.getPropertyValue("filter")?.includes("blur");
      if (blurred) {
        img.style.setProperty("filter","none","important");
        img.classList.remove("aimi-nsfw-blurred");
        btn.classList.add("aimi-revealed");
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> Hide`;
      } else {
        img.style.setProperty("filter","blur(28px) brightness(0.85)","important");
        img.classList.add("aimi-nsfw-blurred");
        btn.classList.remove("aimi-revealed");
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg> Show`;
      }
    });
    wrapper.appendChild(btn);
  }

  /* ══════════════════════════════════════════════════════════════
   *  CONTENT DETECTION — Post & Chat Feed Pipeline
   * ══════════════════════════════════════════════════════════════ */
  const POST_SELECTORS = [
    // Social media posts & tweets
    "article", "[data-testid='tweet']", "[data-testid='cellInnerDiv']",
    ".feed-shared-update-v2", ".x5yr21d",
    "[data-aimi-post]", ".post-card", ".aimi-post",
    // WhatsApp Web chat messages & bubbles
    "div.message-in", "div.message-out", "div.copyable-text", "div.focusable-list-item",
    "div[data-id]", "span.selectable-text", "div._akbu", "div._amj_", "span._ao3e",
    // Instagram (feed posts, comments, reels comments, DMs)
    "div._a9ym", "div._a9zr", "span._a9zs", "div._amid", "div[role='row']",
    "ul._a9z6 > li", "div._aa34", "div.x1lliihq", "div.x78zum5.xdt5ytf",
    "div.html-div.xdj266r.x11i5rnm", "div[dir='auto']",
    // Search Engines (Google Search, AI Overview, Bing, Yahoo)
    "div.g", ".MjjYud", ".tF2Cxc", "div[data-sokoban-container]", "li.b_algo",
    "div.cUnQKe", "div[data-attrid]", "div.xpdopen", "div.g-blk", "div.ULSxyf", "div.wDYxhc", "div.M8OgIe", "div.KDCVub",
    // Social / Forums / Comments
    "shreddit-post", "shreddit-comment", "[role='article']", ".comment", ".post", ".search-result"
  ];

  const processedPosts = new WeakSet();
  let postObserver = null;
  let visObserver = null;

  function extractPostText(el) {
    return (el.innerText || "").slice(0, 2500).trim();
  }

  function schedulePost(el, priority) {
    if (processedPosts.has(el)) return;
    if (el.classList.contains("aimi-line-blurred") || el.closest?.(".aimi-line-blurred") || el.querySelector?.(".aimi-line-blurred")) return;
    processedPosts.add(el);

    const text = extractPostText(el);
    if (!text || text.length < 2) return;

    const hash = simpleHash(text);
    const id = hash + "_toxicity";

    enqueue({ id, type:"toxicity", element:el, text, hash, priority });

    if (CFG.semanticEnabled && CFG.semanticTopics.length > 0) {
      enqueue({ id:hash+"_semantic", type:"semantic", element:el, text, hash:hash+"_sem", priority });
    }
  }

  function initFeedPipeline() {
    // IntersectionObserver — HIGH for visible, LOW for near-visible
    visObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!processedPosts.has(e.target)) {
          schedulePost(e.target, e.intersectionRatio > 0.1 ? "HIGH" : "LOW");
        }
      }
    }, { rootMargin: "250px 0px", threshold: [0, 0.1, 0.5] });

    // MutationObserver — detect new post and chat message containers
    postObserver = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          for (const sel of POST_SELECTORS) {
            if (node.matches?.(sel)) {
              visObserver.observe(node);
              schedulePost(node, "HIGH");
            }
            node.querySelectorAll?.(sel).forEach(el => {
              visObserver.observe(el);
              schedulePost(el, "HIGH");
            });
          }
        }
      }
    });

    postObserver.observe(document.body, {childList:true, subtree:true});

    // Initial scan
    for (const sel of POST_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => {
        visObserver.observe(el);
        schedulePost(el, "HIGH");
      });
    }

    // Periodic sweep every 1.2s for virtualized scrolling lists (WhatsApp Web & Instagram)
    setInterval(() => {
      if (!CFG.toxicityEnabled && !CFG.semanticEnabled) return;
      for (const sel of POST_SELECTORS) {
        const items = document.querySelectorAll(sel);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!processedPosts.has(item) && !item.classList.contains("aimi-line-blurred") && !item.querySelector(".aimi-line-blurred")) {
            schedulePost(item, "HIGH");
          }
        }
      }
    }, 1200);
  }

  /* ══════════════════════════════════════════════════════════════
   *  NSFW IMAGE PIPELINE
   * ══════════════════════════════════════════════════════════════ */
  const processedImgs = new WeakSet();
  const imgObserver = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (e.isIntersecting) { processImageEl(e.target); obs.unobserve(e.target); }
    }
  }, { rootMargin: "300px" });

  function processImageEl(img) {
    if (!CFG.nsfwEnabled) return;
    if (processedImgs.has(img)) return;
    if (!img.complete || (img.naturalWidth === 0 && img.width === 0)) {
      img.addEventListener("load", () => processImageEl(img), {once:true}); return;
    }
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w < 40 || h < 40) return;
    const rawUrl = img.currentSrc || img.src;
    if (!rawUrl) return;
    const url = resolveUrl(rawUrl);
    if (!url) return;

    processedImgs.add(img);
    const hash = simpleHash(url);
    const cached = cacheGet(hash + "_nsfw");
    if (cached) { if(cached.isUnsafe) applyBlurImage(img, {confidence:cached.score}); return; }

    enqueue({id:hash+"_nsfw", type:"nsfw", element:img, url, hash:hash+"_nsfw", priority:"LOW"});
  }

  function observeImage(img) {
    if (img.dataset.aimiImgObs === "true") return;
    img.dataset.aimiImgObs = "true";
    imgObserver.observe(img);
    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) processImageEl(img);
  }

  const imgMutObs = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === "childList") {
        for (const n of mut.addedNodes) {
          if (n.nodeType !== Node.ELEMENT_NODE) continue;
          if (n.tagName === "IMG") observeImage(n);
          n.querySelectorAll?.("img").forEach(observeImage);
        }
      } else if (mut.type === "attributes" && mut.target.tagName === "IMG") {
        const img = mut.target;
        const url = resolveUrl(img.currentSrc || img.src);
        if (img.dataset.lastUrl !== url) { img.dataset.lastUrl = url; img.dataset.aimiImgObs = "false"; observeImage(img); }
      }
    }
  });

  /* ══════════════════════════════════════════════════════════════
   *  PRE-POST COMPOSER CHECKER (Professional, unobtrusive)
   * ══════════════════════════════════════════════════════════════ */
  let activeDraftInput = null;
  let _replacing = false;
  let vibeDebounceTimer = null;

  function initVibeChecker() {
    let tooltip = document.getElementById("aimi-vibe-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "aimi-vibe-tooltip";
      tooltip.innerHTML = `
        <div class="aimi-tip-header">
          <div class="aimi-tip-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <span>Tone Advisory</span>
          </div>
          <span class="aimi-tip-badge" id="aimi-reason-badge">Toxic</span>
        </div>
        <div class="aimi-tip-body">
          This phrasing may be perceived as abrasive. Suggested alternative:
          <div class="aimi-suggestion-box" id="aimi-suggestion-text"></div>
        </div>
        <div class="aimi-tip-actions">
          <button class="aimi-btn-replace" id="aimi-btn-replace" type="button">Replace Text</button>
          <button class="aimi-btn-ignore" id="aimi-btn-ignore" type="button">Dismiss</button>
        </div>`;
      document.body.appendChild(tooltip);
    }

    function showTooltip(result, inputEl) {
      activeDraftInput = inputEl;
      const reasonBadge = document.getElementById("aimi-reason-badge");
      const suggText = document.getElementById("aimi-suggestion-text");
      if (reasonBadge) reasonBadge.textContent = result.reason || "Toxic Tone";
      if (suggText) suggText.textContent = `"${result.suggestion}"`;
      tooltip.style.display = "block";

      const box = inputEl.closest('[contenteditable="true"]') || inputEl.closest('[role="textbox"]') || inputEl;
      const rect = box.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();

      let top = rect.top - tipRect.height - 12;
      if (top < 10) top = rect.bottom + 12;
      let left = Math.max(16, rect.left);
      if (left + tipRect.width > window.innerWidth - 20) {
        left = window.innerWidth - tipRect.width - 20;
      }

      tooltip.style.position = "fixed";
      tooltip.style.top = Math.max(10, top) + "px";
      tooltip.style.left = Math.max(10, left) + "px";

      document.getElementById("aimi-btn-replace").onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        document.getElementById("aimi-btn-replace").disabled = true;
        tooltip.style.display = "none";
        const tgt = inputEl && document.body.contains(inputEl) ? inputEl : activeDraftInput;
        await applyTextReplacement(tgt, result.suggestion);
        setTimeout(() => { document.getElementById("aimi-btn-replace").disabled = false; }, 600);
        if (chrome.storage?.local) {
          chrome.storage.local.get(["aimiStats"], (d) => {
            const s = d.aimiStats || {};
            s.vibeReplaced = (s.vibeReplaced || 0) + 1;
            chrome.storage.local.set({ aimiStats: s });
          });
        }
      };

      document.getElementById("aimi-btn-ignore").onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        tooltip.style.display = "none";
      };
    }

    function checkActiveComposer(target) {
      if (!CFG.vibeCheckEnabled) return;
      const composer = (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
        ? target
        : (document.activeElement?.isContentEditable || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" ? document.activeElement : null);

      if (!composer) return;
      const text = (composer.innerText || composer.textContent || composer.value || "").trim();
      if (!text || text.length < 3) {
        tooltip.style.display = "none";
        return;
      }

      // Fast local evaluation (< 0.1ms)
      const score = localToxicityScore(text);
      if (score >= CFG.toxicityThreshold) {
        const suggestion = localRephrase(text);
        showTooltip({ isToxic: true, score, reason: "Abusive language detected", suggestion }, composer);
      } else {
        tooltip.style.display = "none";
      }
    }

    // Capture-phase listeners to beat any framework stopPropagation
    ["input", "keyup", "paste"].forEach(evType => {
      document.addEventListener(evType, (e) => {
        clearTimeout(vibeDebounceTimer);
        vibeDebounceTimer = setTimeout(() => {
          checkActiveComposer(e.target);
        }, 300);
      }, true);
    });

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") tooltip.style.display = "none"; });
    document.addEventListener("pointerdown", (e) => {
      if (!tooltip.contains(e.target)) tooltip.style.display = "none";
    });
  }

  /* ── Text Replacement Engine ── */
  async function applyTextReplacement(target, newText) {
    if (!target || _replacing) return false;
    _replacing = true;
    try {
      if ((target.tagName==="INPUT"||target.tagName==="TEXTAREA") && !target.isContentEditable) {
        target.focus();
        if (target._valueTracker) target._valueTracker.setValue("");
        const Proto = target.tagName==="TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(Proto,"value")?.set;
        if (nativeSetter) nativeSetter.call(target, newText); else target.value = newText;
        target.dispatchEvent(new InputEvent("input",{bubbles:true,cancelable:true,inputType:"insertText",data:newText}));
        target.dispatchEvent(new Event("change",{bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        if (target.value !== newText) { target.focus(); target.select(); document.execCommand("insertText",false,newText); }
        return true;
      }
      const ceRoot = target.isContentEditable ? (target.closest?.('[contenteditable="true"]')||target) : target.closest?.('[contenteditable="true"]');
      if (ceRoot) {
        ceRoot.focus();
        const sel = window.getSelection(); const range = document.createRange();
        range.selectNodeContents(ceRoot); sel.removeAllRanges(); sel.addRange(range);
        const ok = document.execCommand("insertText",false,newText);
        if (ok && ceRoot.innerText.trim()===newText.trim()) return true;
        const lexSpans = ceRoot.querySelectorAll('span[data-lexical-text="true"]');
        if (lexSpans.length>0) { lexSpans[0].textContent=newText; for(let i=1;i<lexSpans.length;i++) lexSpans[i].remove(); }
        else { const c=ceRoot.querySelector("p")||ceRoot; while(c.firstChild) c.removeChild(c.firstChild); c.textContent=newText; }
        requestAnimationFrame(()=>{try{ceRoot.dispatchEvent(new InputEvent("input",{bubbles:true,cancelable:false,inputType:"insertReplacementText",data:newText}));}catch{ceRoot.dispatchEvent(new Event("input",{bubbles:true}));}});
        return true;
      }
      target.innerText = newText; return true;
    } finally { setTimeout(()=>{_replacing=false;},250); }
  }



  /* ══════════════════════════════════════════════════════════════
   *  INIT
   * ══════════════════════════════════════════════════════════════ */
  function init() {
    loadSettings(() => {
      listenSettingsChanges();

      // NSFW image pipeline
      document.querySelectorAll("img").forEach(observeImage);
      imgMutObs.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src","srcset"]});

      // Toxicity + semantic feed & chat pipeline
      initFeedPipeline();

      // Pre-post composer checker
      if (CFG.vibeCheckEnabled) initVibeChecker();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
