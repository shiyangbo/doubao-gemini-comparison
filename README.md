# Dual Chat Compare（Tampermonkey MVP）

目标：在你已经登录的前提下，只输入一次问题，把问题同步填入豆包、Google AI Studio、Kimi 与 ChatGPT 的输入框；支持一键开始回答；并支持一键滚动到最新。

## 安装

1. Chrome 安装 Tampermonkey
2. Tampermonkey → 新建脚本
3. 复制粘贴 [dual-chat-compare.user.js](userscripts/dual-chat-compare.user.js) 全部内容并保存
4. 打开以下页面（建议左右分屏），确保已登录
   - 豆包：`https://www.doubao.com/`
   - AI Studio：`https://aistudio.google.com/`
   - Kimi：`https://www.kimi.com/` 或 `https://kimi.moonshot.cn/`
   - ChatGPT：`https://chatgpt.com/`（含项目页）

## 使用（精简 MVP）

1. 在任意一页右下角浮动面板输入问题
2. 点击「上屏」：已打开并运行脚本的站点输入框自动填入（不发送）
3. 点击「开始回答」：已打开并运行脚本的站点自动发送，开始生成回答
4. 点击「最新」：定位到最新回答开头；ChatGPT 根据当前会话的消息结构定位，不依赖最近一次上屏的问题，找不到可靠目标时提示失败；其他站点优先匹配最近一次上屏的问题，并保留滚到最新位置的兜底。点击后面板会自动收起，状态通过右下角轻提示显示

定位完成后，如果你主动使用鼠标滚轮滚动页面或点击页面（面板本身除外），脚本会取消尚未完成的自动定位任务，不会再把页面强行拉回原位置。

默认是收起状态，只显示一个小浮点按钮；点一下即可展开。收起/展开在两个页面会联动生效。

新开页面或刷新页面时，浮动面板输入框会默认清空，不回填上一次历史问题。

## 说明

- 不接管登录，主要动作由你显式点击触发
- 若网页结构改版，需要在脚本里更新输入框/发送按钮/回答区域的适配逻辑

## 站点适配与维护

当前维护重点是四类能力：输入框识别、文本写入、发送触发、最新回答定位。

- 最新定位：定位过程中会安排几次延迟校正；用户开始使用鼠标滚轮后会取消这些未完成的校正，避免干扰手动浏览。

- 豆包：优先匹配靠近底部的 `textarea` 或 `Slate` 风格编辑器；开始回答时走“填充→等待重渲染→发送→验证”的异步流程：填充后先等 React 把语音键换成发送键再点击（完整 pointer/mouse 事件序列，而不是只发 `click`），并显式排除输入框左侧的「+」附件键、「快速」模型切换键等同样无文字/aria 的干扰按钮；每一步发送后都验证是否真正发出（跳转新会话/会话节点增加/输入框被清空），未发出则依次换 Enter、重新填充再点按钮重试。
- AI Studio：优先匹配带 `prompt` 语义的输入框，再按页面底部位置兜底。
- Kimi：优先匹配 `role="textbox"`、`aria-multiline="true"`、`data-lexical-editor="true"` 等更像真实聊天输入框的节点，避免误选其他可编辑区域。另外 Kimi 会把填入的文本保存为“新会话草稿”，导致下次首次打开时历史问题被自动恢复到输入框；脚本在页面加载后会检查编辑器内容，若与最近一次问题完全一致则自动清除。
- ChatGPT：输入框使用 `#prompt-textarea`，发送优先点击真实发送按钮；“最新”基于当前可见页面、最新消息块和实际回答内容定位。实现约束、现场证据与排查方法见下文「ChatGPT Web 适配上下文」。
- 普通 `textarea/input`：通过原型链 `value setter` 写入，再派发 `input/change` 事件。
- `contenteditable`：优先走原生 `execCommand("insertText")`，并以目标节点中的实际文本作为成功判断依据，不能只依赖返回值。
- Kimi 特例：其富文本编辑器对 `execCommand` 返回值不稳定，且对额外补发事件较敏感；如果文本已进入 DOM，就不要再走 fallback 重写，否则可能出现重复输入。

建议后续维护顺序：

1. 先检查输入框选择器是否失效。
2. 再检查写入方式是否仍被目标站点接收。
3. 最后再看“最新定位”区域选择器是否因页面改版失效。

如果后续某一站再次失效，优先在浏览器开发者工具里确认：

- 实际命中的输入框节点是不是聊天输入框本身。
- 该节点是 `textarea/input` 还是 `contenteditable`。
- 文本是否已进入目标节点 DOM，但 UI 状态没有同步。

## 最新定位的稳定性说明

豆包、Kimi、AI Studio 的最新定位会优先尝试按“最近一次上屏的问题”定位到对应回答的开头；ChatGPT 不使用此问题匹配路径。为了应对问题里包含特殊字符、换行、全角半角、不可见空白等情况，问题匹配做了容错处理：

- Unicode 归一化：使用 NFKC 统一全角/半角等兼容字符
- 空白规范化：把换行、Tab、多空格折叠为单空格
- 清理不可见字符：移除零宽字符（如 \u200B 等）
- 忽略标点/符号：匹配时弱化大多数标点与特殊符号对结果的影响（更关注字母/数字/中文等正文）
- 模糊兜底：当整句包含匹配失败时，会使用头尾片段与分段命中率做兜底匹配，提升长问题、多行问题的命中率


## ChatGPT Web 适配上下文

### 已验证版本与现场特征

2026-10-15，脚本 `0.5.14` 经用户在 Chrome 实际环境验证，修复了点击「最新」无法回到回答开头的问题。以下记录针对这次观察到的站点构建，不保证后续 ChatGPT DOM 不变；未来适配应先采集失效页面的结构，再修改选择器。

| 现场证据 | 对实现的约束 |
| --- | --- |
| SPA 内切换历史会话后失败，而 Ctrl-R 刷新后可成功；失败状态曾出现第一个 `main` 宽高均为 0，但文档中另有带实际尺寸的消息 | 每次从 `main, [role="main"]` 中选择有布局尺寸的容器，不能缓存第一次找到的根节点或固定取第一个 `main` |
| 传统 `[data-message-author-role="assistant"]`、`[data-testid^="conversation-turn"]`、`[data-message-id]` 和 `[data-scroll-root]` 曾全部为 0 | 不能把旧选择器存在作为前提；也不能把未命中等同于会话为空 |
| 一份现场数据有 5 个 `[data-turn-key]`、2 个 `[data-user-message-bubble]`，两者数量不一致 | `data-turn-key` 是消息块边界，不能假定每块都同时包含提问与回答；最新块可能没有提问气泡 |
| `[data-chatgpt-agent-turn-start]` 是 `display:none` 的空 `span`，矩形恒为 `(0, 0, 0, 0)` | 隐藏标记只用于找到其后的内容，不能直接使用它的坐标，也不能因为它隐藏就丢弃结构线索 |
| 提问与回答之间有多层 `display:contents` 包装，自身宽高为 0，但子节点正常显示 | 遇到这类透明包装时进入其子节点，取首个实际可见的内容块；不能跳过整棵子树 |
| 气泡后紧接的操作按钮区域可能没有文本；气泡与回答并非直接兄弟 | 跳过按钮、空块，沿气泡或起点标记的祖先查找后续兄弟；查找止于当前消息块，不跨入下一块 |
| 实际滚动发生于 `thread-scroll-container overflow-x-hidden overflow-y-auto ...` 的 `div`，`window.scrollY` 为 0 | 沿目标的祖先链查找有实际滚动空间的纵向容器，不能只滚动窗口或 `main` |

这些证据来自多次不同会话的现场采样，不能拼成一份固定 DOM 模板。尤其“隐藏旧 main”和“最新回答块没有气泡”是两个独立问题，修复前者不代表后者也已解决。

### 当前定位流程与维护边界

核心代码位于 [userscripts/dual-chat-compare.user.js](userscripts/dual-chat-compare.user.js)：

1. `getConversationRoot()` 每次选取有实际布局尺寸的主容器；`getChatGptLatestTurn()` 在其中取最后一个 `[data-turn-key]`，没有此标记时才使用当前根容器。
2. `getChatGptAnswerTarget()` 优先使用位于最新提问之后的可见 assistant 节点；否则依次以提问气泡、回答起点标记为结构锚点，沿包装层查找后续可见内容。
3. 对 `display:contents` 仅下钻其透明包装；对 `display:none` 内容、按钮及空块不作为回答。隐藏的回答起点标记可用作锚点，其自身坐标不可用。
4. `scrollChatGptToLatest()` 沿目标父节点向上找滚动容器，必要时使用有滚动空间的 `document.scrollingElement`。目标位置按 `scrollTop + 目标 top - 容器内容区 top - 70px` 计算，并限制在可滚动范围内；文档滚动使用视口原点，避免重复计算文档负坐标。
5. 使用 `scrollTo({ behavior: "instant" })` 直接定位，避免平滑滚动被站点打断；180ms 后重新查找并重试一次。鼠标滚轮或面板外的 `pointerdown` 会清理重试和回答监听。
6. 定位后沿用回答变化监听，指纹读取统一最多每 500ms 一次；只读最新消息块或回答的文本，不在此路径读取全部历史消息的布局。观察到内容变化并停止约 1.8 秒后再次定位，监听最长 90 秒；无变化约 2.5 秒后结束。

性能要求：不增加全页面 `querySelectorAll("*")` 扫描，不按帧遍历历史消息，不持续强制拉回滚动位置；不要用递归几何猜测、段落数量或气泡宽度识别回答。此前这些猜测曾把回答段落当作消息列表，或把第二段误作回答开头。增加延时也不能修复根节点或回答边界选错的问题。

### 再次失效时如何排查

先记录 Tampermonkey 中的脚本版本，在**失败且尚未刷新**的会话里采样，再与同一会话 Ctrl-R 后的状态比较。仅测试刷新进入会话，无法覆盖 SPA 切换场景。

优先查看 Console 中以 `[Dual Chat Compare]` 开头的日志；日志中的 DOM 节点可直接在 Elements 面板定位：

| 日志 | 检查顺序 |
| --- | --- |
| `未找到回答节点`，附 `root`、`turn` | `root` 是否为当前可见主容器；最后消息块是否有气泡或起点标记；锚点到实际内容之间是否增加了包装层或新的隐藏方式 |
| `未找到回答的滚动容器`，附 `target` | 从目标向上查看 `overflow-y`、`scrollHeight`、`clientHeight`；确认滚动容器是否仍在祖先链上 |
| `滚动未到位`，附 `target`、`scroller`、`desired`、`actual` | 目标与容器是否属于当前页面；站点是否重置滚动；不要仅凭 `scrollTo()` 未抛异常就判定成功 |

采集时应比较**所有主容器**，不要再次只用 `document.querySelector("main")` 作为活动页面证据。下面的只读代码仅扫描主容器和命名标记，避免导出聊天正文：

```js
(() => {
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const selectors = [
    "[data-turn-key]", "[data-user-message-bubble]",
    '[data-message-author-role="assistant"]', "[data-chatgpt-agent-turn-start]"
  ];
  console.log(JSON.stringify(
    [...document.querySelectorAll('main, [role="main"]')].map(root => ({
      rect: rect(root),
      display: getComputedStyle(root).display,
      markers: Object.fromEntries(selectors.map(selector => [selector,
        [...root.querySelectorAll(selector)].slice(-5).map(el => ({
          rect: rect(el), display: getComputedStyle(el).display,
          parentTag: el.parentElement?.tagName,
          nextTag: el.nextElementSibling?.tagName
        }))
      ]))
    })), null, 2
  ));
})();
```

DevTools 应选择 ChatGPT 顶层页面的 `top` 上下文。现场 Console 还出现过 `runner.html` 的 CSP 错误、`requestProvider.js` 的 localStorage 异常与其他请求的 404；这些日志本身不足以证明定位脚本报错，应先看本脚本前缀日志、命中的节点及实际滚动数据，不要据此放宽 CSP 或修改浏览器安全设置。

### 回归验证

本地执行：

```sh
node --check userscripts/dual-chat-compare.user.js
node userscripts/chatgpt-scroll.test.mjs
git diff --check
```

[chatgpt-scroll.test.mjs](userscripts/chatgpt-scroll.test.mjs) 从用户脚本原样提取实际函数，覆盖隐藏旧主容器、SPA 切换、独立回答块无提问气泡、隐藏起点、多层透明包装、整宽消息、文档/元素滚动坐标及取消重试。它使用模拟 DOM 验证定位决策，不代替真实浏览器的布局、虚拟化或性能验收。

Chrome 验收至少包括：刷新直接进入会话、从侧栏连续切换不同历史会话且不刷新、只有一问一答、多轮长回答、流式回答结束后定位、手动滚轮/点击取消。确认定位到回答开头而非提问、整轮开头或回答第二段，并确认输入与滚动保持流畅。更新脚本后先刷新一次加载新版，再开始不刷新的 SPA 切换验收；不要把每次测试前刷新当作验收步骤。
