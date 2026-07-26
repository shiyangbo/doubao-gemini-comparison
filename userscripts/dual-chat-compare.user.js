// ==UserScript==
// @name         Dual Chat Compare (Doubao vs AI Studio)
// @namespace    local.dual-chat-compare
// @version      0.3.5
// @description  豆包 + Google AI Studio：一次输入，上屏/开始回答/滚到最新（MVP）
// @match        *://www.doubao.com/*
// @match        *://doubao.com/*
// @match        *://aistudio.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// ==/UserScript==
 
(() => {
  const APP_ID = "dual_chat_compare_v1";
  const PANEL_ID = `${APP_ID}__panel`;
  const STORAGE_PREFIX = `${APP_ID}:`;
  const KEY = {
    question: `${STORAGE_PREFIX}question`,
    action: `${STORAGE_PREFIX}action`,
    uiCollapsed: `${STORAGE_PREFIX}ui:collapsed`,
  };

  const SITE = (() => {
    const host = location.host.toLowerCase();
    if (host.includes("doubao.com")) return "doubao";
    if (host.includes("aistudio.google.com")) return "aistudio";
    return null;
  })();

  if (!SITE) return;

  const now = () => Date.now();
  const safeText = (text) => (text ?? "").replace(/\u00A0/g, " ").trim();

  const isVisible = (el) => {
    if (!el) return false;
    if (!(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
 
  const isCenterColumn = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || 1;
    const cx = rect.left + rect.width / 2;
    if (cx < vw * 0.22 || cx > vw * 0.78) return false;
    return true;
  };
 
  const isInPageChrome = (el) => {
    if (!el || !(el instanceof Element)) return false;
    return !!el.closest("nav, header, footer, aside, [role='navigation']");
  };

  const readQuestion = () => GM_getValue(KEY.question, null);
  const writeQuestion = (text) => {
    const payload = { id: `${now()}_${Math.random().toString(16).slice(2)}`, text: safeText(text), ts: now(), from: SITE };
    GM_setValue(KEY.question, payload);
    return payload;
  };

  const writeAction = (type, questionId, runId) => {
    const payload = {
      id: `${now()}_${Math.random().toString(16).slice(2)}`,
      type,
      questionId: questionId ?? null,
      runId: runId ?? null,
      ts: now(),
      from: SITE,
    };
    GM_setValue(KEY.action, payload);
    return payload;
  };
 
  const readCollapsed = () => !!GM_getValue(KEY.uiCollapsed, false);
  const writeCollapsed = (collapsed) => {
    GM_setValue(KEY.uiCollapsed, !!collapsed);
  };

  const getAutoInputCandidates = () => {
    const selectors = ["textarea", 'div[contenteditable="true"]', '[role="textbox"]', "input[type='text']"];
    const candidates = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
    return candidates
      .filter((el) => isVisible(el))
      .filter((el) => !el.closest(`#${PANEL_ID}`))
      .filter((el) => el.getBoundingClientRect().bottom > window.innerHeight * 0.5);
  };

  const setInputText = (el, text) => {
    const t = safeText(text);
    if (!t) return false;
    if (!el) return false;
    try {
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc?.set) desc.set.call(el, t);
        else el.value = t;

        try {
          el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: t }));
        } catch {
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, t);
      } catch {
        el.textContent = t;
      }
      try {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: t }));
      } catch {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    } catch {
      return false;
    }
  };

  const pressKeyCombo = (inputEl, { key, code, ctrlKey, metaKey, shiftKey, altKey }) => {
    try {
      inputEl.focus();
      const isEnter = key === "Enter";
      const opts = {
        key,
        code,
        keyCode: isEnter ? 13 : 0,
        which: isEnter ? 13 : 0,
        ctrlKey: !!ctrlKey,
        metaKey: !!metaKey,
        shiftKey: !!shiftKey,
        altKey: !!altKey,
        bubbles: true,
        cancelable: true,
      };
      inputEl.dispatchEvent(new KeyboardEvent("keydown", opts));
      inputEl.dispatchEvent(new KeyboardEvent("keypress", opts));
      inputEl.dispatchEvent(new KeyboardEvent("keyup", opts));
      return true;
    } catch {
      return false;
    }
  };

  const Adapter = (() => {
    const findInput = () => {
      if (SITE === "doubao") {
        const selectors = [
          'textarea[placeholder*="发消息"]',
          'textarea[placeholder*="消息"]',
          'textarea[placeholder*="说话"]',
          'div[contenteditable="true"][data-slate-editor="true"]',
          'div[contenteditable="true"][role="textbox"]',
          'div[contenteditable="true"]',
        ];
        const els = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
        const candidates = els
          .filter((el) => isVisible(el))
          .filter((el) => !el.closest(`#${PANEL_ID}`))
          .filter((el) => el.getBoundingClientRect().bottom > window.innerHeight * 0.5);
        candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
        return candidates[0] ?? null;
      }

      if (SITE === "aistudio") {
        const selectors = [
          'textarea[aria-label*="prompt" i]',
          'textarea[placeholder*="prompt" i]',
          'textarea[aria-label*="Start typing a prompt" i]',
          'div[contenteditable="true"][aria-label*="prompt" i]',
          'div[contenteditable="true"][role="textbox"]',
          "textarea",
          'div[contenteditable="true"]',
        ];
        const els = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
        const candidates = els
          .filter((el) => isVisible(el))
          .filter((el) => !el.closest(`#${PANEL_ID}`))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.bottom <= window.innerHeight * 0.5) return false;
            if (rect.width < 180) return false;
            return true;
          });
        candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
        return candidates[0] ?? null;
      }

      const candidates = getAutoInputCandidates();
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      return candidates[0] ?? null;
    };

    const fill = (text) => {
      const input = findInput();
      if (!input) return false;
      return setInputText(input, text);
    };

    const send = () => {
      const input = findInput();
      if (!input) return false;
      return pressKeyCombo(input, { key: "Enter", code: "Enter" });
    };

    const scrollToLatest = () => {
      const normalize = (s) => {
        const raw = `${s ?? ""}`;
        const nfkc = typeof raw.normalize === "function" ? raw.normalize("NFKC") : raw;
        return nfkc
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      };
      const stripPunct = (s) =>
        normalize(s)
          .replace(/[^\p{L}\p{N} ]+/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
      const keyify = (s) => stripPunct(s).replace(/ /g, "");
      const qRaw = readQuestion()?.text ?? "";
      const qNorm = stripPunct(qRaw);
      const qKey = keyify(qRaw);
      const matchesQuestion = (hay) => {
        if (!qNorm) return false;
        const hNorm = stripPunct(hay);
        if (!hNorm) return false;
        if (hNorm.includes(qNorm)) return true;
        if (!qKey) return false;
        const hKey = keyify(hay);
        if (!hKey) return false;
        if (hKey.includes(qKey)) return true;
        if (qKey.length >= 24) {
          const head = qKey.slice(0, 24);
          const tail = qKey.slice(-24);
          if (hKey.includes(head) && hKey.includes(tail)) return true;
        }
        if (qKey.length >= 12) {
          let total = 0;
          let hits = 0;
          const step = Math.max(6, Math.floor(qKey.length / 6));
          for (let i = 0; i < qKey.length; i += step) {
            const seg = qKey.slice(i, i + 10);
            if (seg.length < 6) continue;
            total += 1;
            if (hKey.includes(seg)) hits += 1;
          }
          if (total >= 2 && hits / total >= 0.6) return true;
        }
        return false;
      };
      if (SITE === "doubao") {
        const msgList =
          document.querySelector("[class^='message-list-']") ??
          document.querySelector("[class*='message-list-']") ??
          document.querySelector("main") ??
          document.body;
        if (qNorm) {
          const items = Array.from(msgList.querySelectorAll("[data-container-type='block-v2']"))
            .filter((el) => !el.closest(`#${PANEL_ID}`))
            .filter((el) => isVisible(el))
            .filter((el) => !isInPageChrome(el));
          if (items.length > 0) {
            const hitIdx = (() => {
              for (let i = items.length - 1; i >= 0; i -= 1) {
                const t = items[i].innerText ?? items[i].textContent ?? "";
                if (matchesQuestion(t)) return i;
              }
              return -1;
            })();
            if (hitIdx >= 0) {
              for (let j = hitIdx + 1; j < items.length; j += 1) {
                const cand = items[j];
                const hasAnswer = !!cand.querySelector(".md-box-root .container-enLQFx, .md-box-root [class*='container-enLQFx']");
                if (!hasAnswer) continue;
                try {
                  cand.scrollIntoView({ block: "start", behavior: "smooth" });
                  return true;
                } catch {
                  break;
                }
              }
            }
          }
        }
        const blocks = Array.from(msgList.querySelectorAll(".md-box-root"))
          .filter((el) => !el.closest(`#${PANEL_ID}`))
          .filter((el) => isVisible(el))
          .filter((el) => !isInPageChrome(el))
          .filter((el) => !!el.querySelector(".container-enLQFx, [class*='container-enLQFx']"));
        if (blocks.length > 0) {
          blocks.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
          const latest = blocks[0];
          try {
            latest.scrollIntoView({ block: "start", behavior: "smooth" });
            return true;
          } catch {
            // ignore
          }
        }
        const scroller = msgList.querySelector(".scroller") ?? msgList;
        try {
          scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
          return true;
        } catch {
          try {
            scroller.scrollTop = scroller.scrollHeight;
            return true;
          } catch {
            return false;
          }
        }
      }

      const container =
        document.querySelector("ms-chat-session ms-autoscroll-container") ??
        document.querySelector("ms-chat-session") ??
        document.querySelector("main") ??
        document.body;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const hosts = Array.from(container.querySelectorAll("[id]"))
        .filter((el) => el instanceof Element)
        .filter((el) => uuidRe.test(el.id))
        .filter((el) => !el.closest(`#${PANEL_ID}`))
        .filter((el) => !!el.querySelector("ms-text-chunk"));

      if (hosts.length > 0 && qNorm) {
        const hitIdx = (() => {
          for (let i = hosts.length - 1; i >= 0; i -= 1) {
            const t = hosts[i].innerText ?? hosts[i].textContent ?? "";
            if (matchesQuestion(t)) return i;
          }
          return -1;
        })();
        if (hitIdx >= 0) {
          for (let j = hitIdx + 1; j < hosts.length; j += 1) {
            const host = hosts[j];
            const isModel = !!host.querySelector("ms-cmark-node, ms-chunk-editor ms-cmark-node");
            if (!isModel) continue;
            try {
              host.scrollIntoView({ block: "start", behavior: "smooth" });
              return true;
            } catch {
              break;
            }
          }
        }
      }

      if (hosts.length > 0) {
        for (let i = hosts.length - 1; i >= 0; i -= 1) {
          const host = hosts[i];
          const isModel = !!host.querySelector("ms-cmark-node, ms-chunk-editor ms-cmark-node");
          if (!isModel) continue;
          try {
            host.scrollIntoView({ block: "start", behavior: "smooth" });
            return true;
          } catch {
            // ignore
          }
          break;
        }
      }

      const chunks = Array.from(container.querySelectorAll("ms-text-chunk")).filter((el) => !el.closest(`#${PANEL_ID}`));
      const lastChunk = chunks.at(-1);
      if (lastChunk && lastChunk instanceof Element) {
        try {
          lastChunk.scrollIntoView({ block: "start", behavior: "smooth" });
          return true;
        } catch {
          // ignore
        }
      }
      try {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        return true;
      } catch {
        try {
          container.scrollTop = container.scrollHeight;
          return true;
        } catch {
          return false;
        }
      }
    };

    return { findInput, fill, send, scrollToLatest };
  })();

  const UI = (() => {
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.style.position = "fixed";
    root.style.right = "12px";
    root.style.bottom = "12px";
    root.style.width = "320px";
    root.style.zIndex = "2147483647";
    root.style.background = "rgba(18, 18, 20, 0.92)";
    root.style.color = "#f2f2f2";
    root.style.border = "1px solid rgba(255,255,255,0.12)";
    root.style.borderRadius = "10px";
    root.style.boxShadow = "0 12px 36px rgba(0,0,0,0.32)";
    root.style.backdropFilter = "blur(6px)";
    root.style.font = "12px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    root.style.overflow = "hidden";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "9px 10px";

    const title = document.createElement("div");
    title.textContent = SITE === "doubao" ? "豆包" : "AI Studio";
    title.style.fontWeight = "600";
    title.style.opacity = "0.92";

    const btnToggle = document.createElement("button");
    btnToggle.textContent = "展开";
    btnToggle.style.padding = "6px 10px";
    btnToggle.style.borderRadius = "999px";
    btnToggle.style.border = "1px solid rgba(255,255,255,0.14)";
    btnToggle.style.background = "rgba(255,255,255,0.06)";
    btnToggle.style.color = "#f2f2f2";
    btnToggle.style.cursor = "pointer";

    header.appendChild(title);
    header.appendChild(btnToggle);

    const body = document.createElement("div");
    body.style.padding = "0 10px 10px 10px";

    const qInput = document.createElement("textarea");
    qInput.rows = 3;
    qInput.style.width = "100%";
    qInput.style.boxSizing = "border-box";
    qInput.style.resize = "vertical";
    qInput.style.padding = "8px";
    qInput.style.borderRadius = "8px";
    qInput.style.border = "1px solid rgba(255,255,255,0.16)";
    qInput.style.background = "rgba(0,0,0,0.35)";
    qInput.style.color = "#f2f2f2";
    qInput.placeholder = "输入一次问题";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "8px";

    const mkBtn = (text) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.style.flex = "1";
      b.style.padding = "8px 10px";
      b.style.borderRadius = "10px";
      b.style.border = "1px solid rgba(255,255,255,0.14)";
      b.style.background = "rgba(255,255,255,0.06)";
      b.style.color = "#f2f2f2";
      b.style.cursor = "pointer";
      return b;
    };

    const btnScreen = mkBtn("上屏");
    const btnStart = mkBtn("开始回答");
    const btnLatest = mkBtn("最新");

    btnRow.appendChild(btnScreen);
    btnRow.appendChild(btnStart);
    btnRow.appendChild(btnLatest);

    body.appendChild(qInput);
    body.appendChild(btnRow);

    root.appendChild(header);
    root.appendChild(body);
    document.documentElement.appendChild(root);

    let collapsed = readCollapsed();
    if (GM_getValue(KEY.uiCollapsed, null) == null) {
      collapsed = true;
      writeCollapsed(true);
    }
    const setCollapsed = (v, sync) => {
      collapsed = !!v;
      body.style.display = collapsed ? "none" : "block";
      btnToggle.textContent = collapsed ? "展开" : "收起";
      title.style.display = collapsed ? "none" : "block";
      root.style.width = collapsed ? "52px" : "320px";
      root.style.height = collapsed ? "52px" : "auto";
      root.style.borderRadius = collapsed ? "14px" : "10px";
      root.style.boxShadow = collapsed ? "0 10px 30px rgba(0,0,0,0.28)" : "0 12px 36px rgba(0,0,0,0.32)";
      header.style.padding = collapsed ? "0" : "9px 10px";
      header.style.justifyContent = collapsed ? "center" : "space-between";
      btnToggle.style.width = collapsed ? "52px" : "auto";
      btnToggle.style.height = collapsed ? "52px" : "auto";
      btnToggle.style.padding = collapsed ? "0" : "6px 10px";
      btnToggle.style.borderRadius = collapsed ? "14px" : "999px";
      btnToggle.style.border = collapsed ? "none" : "1px solid rgba(255,255,255,0.14)";
      btnToggle.style.background = collapsed ? "transparent" : "rgba(255,255,255,0.06)";
      if (sync) writeCollapsed(collapsed);
    };
    setCollapsed(collapsed, false);
 
    btnToggle.addEventListener("click", () => {
      setCollapsed(!collapsed, true);
    });
 
    return { qInput, btnScreen, btnStart, btnLatest, setCollapsed };
  })();

  const applyQuestionToThisPage = (qText) => {
    return Adapter.fill(qText);
  };

  const startAnswerOnThisPage = (qText) => {
    const filled = Adapter.fill(qText);
    if (!filled) return false;
    const sent = Adapter.send();
    return sent;
  };

  const scrollToLatestOnThisPage = () => {
    return Adapter.scrollToLatest();
  };

  UI.btnScreen.addEventListener("click", () => {
    const qText = safeText(UI.qInput.value);
    if (!qText) return;
    const q = writeQuestion(qText);
    writeAction("screen", q.id);
    applyQuestionToThisPage(qText);
  });

  UI.btnStart.addEventListener("click", () => {
    const qText = safeText(UI.qInput.value);
    if (!qText) return;
    const q = writeQuestion(qText);
    writeAction("start", q.id);
    startAnswerOnThisPage(qText);
  });

  UI.btnLatest.addEventListener("click", () => {
    writeAction("latest");
    scrollToLatestOnThisPage();
  });

  GM_addValueChangeListener(KEY.action, (_name, _oldVal, newVal, remote) => {
    if (!remote) return;
    const type = newVal?.type;
    const q = readQuestion();
    const qText = safeText(q?.text ?? "");
    if (type === "screen") {
      if (!qText) return;
      applyQuestionToThisPage(qText);
      return;
    }
    if (type === "start") {
      if (!qText) return;
      startAnswerOnThisPage(qText);
      return;
    }
    if (type === "latest") {
      scrollToLatestOnThisPage();
    }
  });

  const initFromShared = () => {
    const q = readQuestion();
    const qText = safeText(q?.text ?? "");
    if (qText) UI.qInput.value = qText;
  };

  GM_addValueChangeListener(KEY.question, (_name, _oldVal, newVal) => {
    const qText = safeText(newVal?.text ?? "");
    UI.qInput.value = qText;
  });
 
  GM_addValueChangeListener(KEY.uiCollapsed, (_name, _oldVal, newVal, remote) => {
    if (!remote) return;
    UI.setCollapsed(!!newVal, false);
  });

  initFromShared();
})();
