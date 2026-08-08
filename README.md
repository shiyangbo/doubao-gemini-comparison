# Dual Chat Compare（Tampermonkey MVP）

目标：在你已经登录的前提下，只输入一次问题，把问题同步填入豆包、Google AI Studio 与 Kimi 的输入框；支持一键开始回答；并支持一键滚动到最新。

## 安装

1. Chrome 安装 Tampermonkey
2. Tampermonkey → 新建脚本
3. 复制粘贴 [dual-chat-compare.user.js](file:///Users/shiyangbo/claude_playground_coding_plan/userscripts/dual-chat-compare.user.js) 全部内容并保存
4. 打开以下页面（建议左右分屏），确保已登录
   - 豆包：`https://www.doubao.com/`
   - AI Studio：`https://aistudio.google.com/`
   - Kimi：`https://www.kimi.com/` 或 `https://kimi.moonshot.cn/`

## 使用（精简 MVP）

1. 在任意一页右下角浮动面板输入问题
2. 点击「上屏」：三页输入框自动填入（不发送）
3. 点击「开始回答」：三页自动发送，开始生成回答
4. 点击「最新」：优先定位到“最近一次上屏问题”对应的最新回答开头；若定位失败则滚到对话最新位置；点击后面板会自动收起，状态通过右下角轻提示显示

默认是收起状态，只显示一个小浮点按钮；点一下即可展开。收起/展开在两个页面会联动生效。

新开页面或刷新页面时，浮动面板输入框会默认清空，不回填上一次历史问题。

## 说明

- 不接管登录，主要动作由你显式点击触发
- 若网页结构改版，需要在脚本里更新输入框/发送按钮/回答区域的适配逻辑

## 站点适配与维护

当前维护重点是三类能力：输入框识别、文本写入、最新回答定位。

- 豆包：优先匹配靠近底部的 `textarea` 或 `Slate` 风格编辑器。
- AI Studio：优先匹配带 `prompt` 语义的输入框，再按页面底部位置兜底。
- Kimi：优先匹配 `role="textbox"`、`aria-multiline="true"`、`data-lexical-editor="true"` 等更像真实聊天输入框的节点，避免误选其他可编辑区域。
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

点击「最新」时，会优先尝试按“最近一次上屏的问题”定位到对应回答的开头。为了应对问题里包含特殊字符、换行、全角半角、不可见空白等情况，匹配做了容错处理：

- Unicode 归一化：使用 NFKC 统一全角/半角等兼容字符
- 空白规范化：把换行、Tab、多空格折叠为单空格
- 清理不可见字符：移除零宽字符（如 \u200B 等）
- 忽略标点/符号：匹配时弱化大多数标点与特殊符号对结果的影响（更关注字母/数字/中文等正文）
- 模糊兜底：当整句包含匹配失败时，会使用头尾片段与分段命中率做兜底匹配，提升长问题、多行问题的命中率
