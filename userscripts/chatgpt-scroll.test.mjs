// 从用户脚本提取真实函数,验证现场 DOM、滚动坐标与取消重试。
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./dual-chat-compare.user.js", import.meta.url), "utf8");
const extract = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `找不到函数: ${start}`);
  return source.slice(a, b);
};
const list = (items) => Object.assign(items, { item: (i) => items[i] ?? null });
class Element {
  constructor(attrs = {}, children = [], { top = 0, width = 700, height = 60, tag = "div", text = "", display = "block" } = {}) {
    Object.assign(this, { attrs, children, top, width, height, tag, text, display, scrollTop: 0, scrollHeight: height, clientHeight: height, clientTop: 0, overflowY: "visible" });
    for (const child of children) child.parentElement = this;
  }
  get textContent() { return this.text + this.children.map((el) => el.textContent).join(""); }
  get isConnected() { return true; }
  get nextElementSibling() { const kids = this.parentElement?.children ?? []; return kids[kids.indexOf(this) + 1] ?? null; }
  matches(selector) {
    return selector.split(",").some((part) => {
      part = part.trim();
      const attr = part.match(/^\[([^=\]]+)(?:=['"]([^'"]+)['"])?\]$/);
      if (attr) return attr[1] in this.attrs && (attr[2] === undefined || this.attrs[attr[1]] === attr[2]);
      if (part.startsWith("#")) return this.attrs.id === part.slice(1);
      return part === this.tag;
    });
  }
  closest(selector) { for (let el = this; el; el = el.parentElement) if (el.matches(selector)) return el; return null; }
  all() { return [this, ...this.children.flatMap((el) => el.all())]; }
  querySelectorAll(selector) {
    assert.ok(!selector.includes("*"), "禁止全元素扫描");
    return list(this.all().slice(1).filter((el) => el.matches(selector)));
  }
  compareDocumentPosition(other) {
    let root = this;
    while (root.parentElement) root = root.parentElement;
    return root.all().indexOf(other) > root.all().indexOf(this) ? 4 : 2;
  }
  getBoundingClientRect() {
    if (this.display === "contents" || this.display === "none") return { top: 0, width: 0, height: 0 };
    for (let parent = this.parentElement; parent; parent = parent.parentElement) {
      if (parent.display === "none" || (parent.display !== "contents" && parent.width === 0 && parent.height === 0)) return { top: 0, width: 0, height: 0 };
    }
    let top = this.top;
    for (let el = this.parentElement; el; el = el.parentElement) top -= el.scrollTop;
    return { top, width: this.width, height: this.height };
  }
  scrollTo(options) { this.lastScroll = options; this.scrollTop = options.top; }
}
const bubble = (text = "问题") => new Element({ "data-user-message-bubble": "" }, [], { top: 136, text });
const marker = () => new Element({ "data-chatgpt-agent-turn-start": "" }, [], { width: 0, height: 0 });
const answer = () => new Element({}, [new Element({}, [], { text: "第一段" }), new Element({}, [], { text: "第二段" })], { top: 161, height: 1800 });
const round = (kids) => new Element({ "data-turn-key": "key" }, kids);
function setup(root, viewport = new Element({}, [], { height: 341 })) {
  const document = {
    scrollingElement: viewport, documentElement: viewport, body: root,
    querySelectorAll: (selector) => list(root.all().filter((el) => el.matches(selector))),
    querySelector: (selector) => root.all().find((el) => el.matches(selector)) ?? null,
  };
  return new Function("Element", "Node", "document", "getComputedStyle", "console", `
    const PANEL_ID = "panel";
    const SITE = "chatgpt";
    const safeText = (t) => (t ?? "").trim();
    ${extract("  const isVisible =", "  // 全页找最可能的会话滚动容器")}
    ${extract("    const getConversationRoot =", "    const getChatGptLatestTurn =")}
    ${extract("    const getChatGptLatestTurn =", "    const scrollToLatest =")}
    return { getConversationRoot, getChatGptAnswerTarget, scrollChatGptToLatest, getLatestAnswerFingerprint };
  `)(Element, { DOCUMENT_POSITION_FOLLOWING: 4 }, document, (el) => ({ overflowY: el.overflowY, display: el.display }), { warn() {} });
}
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

test("SPA 现场: 第一个 main 尺寸为零,选择实际显示的会话并滚动", () => {
  const hidden = () => new Element({}, [round([bubble("缓存问题"), marker(), answer()])], { tag: "main", width: 0, height: 0 });
  const a = answer();
  const live = new Element({}, [round([bubble(), a])], { tag: "main", width: 1165, height: 341 });
  Object.assign(live, { overflowY: "auto", scrollHeight: 2062, scrollTop: 161 });
  const root = new Element({}, [hidden(), live, hidden()]);
  const api = setup(root);
  assert.equal(api.getConversationRoot() === live, true, "不能选 DOM 顺序中的第一个或最后一个缓存 main");
  assert.equal(api.scrollChatGptToLatest(), true);
  assert.equal(live.scrollTop, 91);
  assert.equal(a.getBoundingClientRect().top, 70);
  assert.equal(api.getLatestAnswerFingerprint(), live.textContent);
});
test("SPA 切换后重新选择当前显示的 main,不缓存旧页面根节点", () => {
  const first = new Element({}, [round([bubble(), answer()])], { tag: "main", width: 1165, height: 341 });
  const second = new Element({}, [round([bubble(), answer()])], { tag: "main", width: 0, height: 0 });
  const api = setup(new Element({}, [first, second]));
  assert.equal(api.getConversationRoot() === first, true);
  Object.assign(first, { width: 0, height: 0 });
  Object.assign(second, { width: 1165, height: 341 });
  assert.equal(api.getConversationRoot() === second, true);
});
test("现场: 空零尺寸标记不覆盖气泡后的回答;单轮也能定位", () => {
  const a = answer();
  const root = new Element({}, [round([marker(), new Element({}, [bubble()]), new Element({}, [], { height: 0 }), a])], { height: 341 });
  Object.assign(root, { scrollHeight: 2062, scrollTop: 161, overflowY: "auto" });
  const api = setup(root);
  assert.equal(api.getChatGptAnswerTarget(root), a);
  assert.equal(api.scrollChatGptToLatest(), true);
  assert.equal(root.scrollTop, 91);
  assert.equal(a.getBoundingClientRect().top, 70);
  assert.equal(root.lastScroll.behavior, "instant");
});
test("现场复例: display:contents 包装层内的首个实际内容块可定位", () => {
  const contents = (children) => new Element({}, children, { display: "contents" });
  const emptyControls = new Element({}, [], { height: 32, width: 104 });
  let q = new Element({}, [bubble(), emptyControls]);
  q = new Element({}, [new Element({}, [new Element({}, [q])])]);
  const first = new Element({}, [], { top: 230, text: "思考了 30s" });
  const hidden = new Element({}, [], { text: "隐藏内容", display: "none" });
  const content = contents([hidden, contents([first])]);
  const body = contents([answer()]);
  const hiddenMarker = new Element({ "data-chatgpt-agent-turn-start": "" }, [], { display: "none" });
  const turn = round([hiddenMarker, new Element({}, [contents([q]), content, body])]);
  const root = new Element({}, [turn], { height: 341 });
  Object.assign(root, { scrollHeight: 2062, scrollTop: 1721, overflowY: "auto" });
  assert.equal(root.querySelectorAll("[data-user-message-bubble]").item(0).getBoundingClientRect().top, -1585);
  const api = setup(root);
  assert.equal(api.getChatGptAnswerTarget(root), first);
  assert.equal(api.scrollChatGptToLatest(), true);
  assert.equal(first.getBoundingClientRect().top, 70);
  assert.equal(root.scrollTop, 160);
});
test("display:none 的子树不会被当作回答", () => {
  const hidden = new Element({}, [answer()], { display: "none" });
  const root = new Element({}, [round([bubble(), hidden, marker()])]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), null);
});
test("透明包装中的按钮被跳过,取后面的真实内容", () => {
  const a = answer();
  const wrapper = new Element({}, [new Element({}, [], { tag: "button", text: "复制" }), a], { display: "contents" });
  const root = new Element({}, [round([bubble(), wrapper])]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), a);
});
test("独立回答块: 五个 turn-key、两个提问气泡,末块无气泡但有隐藏起点", () => {
  const hiddenMarker = () => new Element({ "data-chatgpt-agent-turn-start": "" }, [], { display: "none", tag: "span" });
  const a = answer();
  const contents = (kids) => new Element({}, kids, { display: "contents" });
  const root = new Element({}, [
    round([hiddenMarker(), bubble("第一问")]),
    round([hiddenMarker(), answer()]),
    round([hiddenMarker(), new Element({}, [], { text: "工具输出" })]),
    round([hiddenMarker(), bubble("第二问")]),
    round([contents([contents([hiddenMarker()])]), contents([a])]),
  ], { tag: "main", height: 341 });
  Object.assign(root, { overflowY: "auto", scrollHeight: 2062, scrollTop: 161 });
  const api = setup(root);
  assert.equal(root.querySelectorAll("[data-turn-key]").length, 5);
  assert.equal(root.querySelectorAll("[data-user-message-bubble]").length, 2);
  assert.equal(api.getChatGptAnswerTarget(root) === a, true, "应沿隐藏起点找回答,不能要求同块存在提问气泡");
  assert.equal(api.scrollChatGptToLatest(), true);
  assert.equal(a.getBoundingClientRect().top, 70);
});
test("问题块的隐藏起点在气泡之前时,不把提问当作回答", () => {
  const root = new Element({}, [round([marker(), bubble()])]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), null);
});
test("最新轮次优先;旧轮次 assistant 或标记不会抢占", () => {
  const old = new Element({ "data-message-author-role": "assistant" }, [], { text: "旧回答" });
  const a = answer();
  const root = new Element({}, [round([old, marker()]), round([bubble(), a])]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), a);
});
test("整宽提问和多段回答: 返回完整回答,不选第二段", () => {
  const a = answer();
  const root = new Element({}, [round([bubble(), a])]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), a);
});
test("无保存问题、深层气泡包装、按钮在气泡之后", () => {
  let q = new Element({}, [bubble(), new Element({}, [], { tag: "button", text: "复制" })]);
  for (let i = 0; i < 5; i++) q = new Element({}, [q]);
  const a = answer();
  const root = new Element({}, [round([q, a])]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), a);
});
test("回答未生成时不误选旧回答或整个最新轮次", () => {
  const root = new Element({}, [round([answer()]), round([bubble(), marker()])]);
  const api = setup(root);
  assert.equal(api.getChatGptAnswerTarget(root), null);
  assert.equal(api.scrollChatGptToLatest(), false);
});
test("传统 assistant 标记无需 turn-key", () => {
  const a = new Element({ "data-message-author-role": "assistant" }, [], { text: "回答" });
  const root = new Element({}, [bubble(), a]);
  assert.equal(setup(root).getChatGptAnswerTarget(root), a);
});
test("文档滚动使用视口原点,不重复计算 document 的负坐标", () => {
  const a = new Element({ "data-message-author-role": "assistant" }, [], { top: 161, text: "回答" });
  const root = new Element({}, [a]);
  const viewport = new Element({}, [root], { height: 341 });
  Object.assign(viewport, { scrollTop: 161, scrollHeight: 2062 });
  viewport.getBoundingClientRect = () => ({ top: -viewport.scrollTop });
  const api = setup(root, viewport);
  assert.equal(api.scrollChatGptToLatest(), true);
  assert.equal(viewport.scrollTop, 91);
});
test("指纹只读最新轮次文本,不读空标记或历史布局", () => {
  const latest = round([bubble(), marker(), answer()]);
  const root = new Element({}, [round([answer()]), latest]);
  root.getBoundingClientRect = latest.getBoundingClientRect = () => { throw new Error("指纹不应读布局"); };
  const api = setup(root);
  assert.equal(api.getLatestAnswerFingerprint(), latest.textContent);
});
test("容器不足以对齐时按可滚动上限定位", () => {
  const a = new Element({ "data-message-author-role": "assistant" }, [], { top: 1000, text: "回答" });
  const root = new Element({}, [a], { height: 341 });
  Object.assign(root, { scrollHeight: 500, overflowY: "auto" });
  const api = setup(root);
  assert.equal(api.scrollChatGptToLatest(), true);
  assert.equal(root.scrollTop, 159);
});
test("一次重试可取消,不遗留强制拉回任务", () => {
  const timers = new Map(); let id = 0; let calls = 0;
  const api = new Function("window", "Adapter", `
    const SITE = "chatgpt";
    let pendingLatestScrollTimers = [];
    let pendingLatestStop = null;
    const setLatestStatus = () => {};
    ${extract("  const scrollToLatestOnThisPage =", "  let pendingLatestStop =")}
    ${extract("  const cancelPendingLatest =", "  const requestLatestOnThisPage =")}
    return { scrollToLatestOnThisPage, cancelPendingLatest };
  `)({ setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } }, { scrollToLatest() { calls++; return true; } });
  api.scrollToLatestOnThisPage();
  assert.equal(calls, 1);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 180);
  api.cancelPendingLatest();
  assert.equal(timers.size, 0);
});
console.log(`${count} tests passed`);
