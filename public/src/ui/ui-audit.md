# UI 组件盘点（Home / Story / Phone）

- Home（index.html + shell/pages/*）：✅ tab 栏按钮、各页 action 按钮和搜索框均走 ui-btn/ui-input；✅ gender/role 选择使用 ui-select 包装；✅ 删除确认/设置弹层为 ui-modal；⚠ 请在后续检查 unlock 表单在极窄宽度下的换行情况。
- Story（story-embed.html/legacy-chat.html）：✅ 气泡结构统一 ui-bubble；✅ 输入区 textarea 包裹 ui-input，发送/工具按钮为 ui-btn；✅ restart / edit sheet 用 ui-modal-backdrop + ui-modal；⚠ 折叠通话记录按钮的展开/收起文本需回归设计再微调。
- Phone（phone-embed.html）：✅ 顶栏已套 ui-page-header；✅ moments/聊天输入走 ui-input + ui-btn；✅ 红包/通话 overlay 采用 ui-modal；⚠ 在超长菜单时下拉可能溢出视窗，后续可加滚动。
