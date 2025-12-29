// 提示块工具：角色身份/规则等复用片段，Narrator 与 World Driver 共用
// REVIEW: 角色卡字段展示/格式调整可在此修改

export function buildCharacterIdentityBlock(card) {
    if (!card) return "";
    const name = (card.name || "").trim() || "未命名角色";
    const gender = (card.sex || card.gender || "").trim() || "无性别";
    const abo = card.aboSub ? `/${card.aboSub}` : "";
    const species = (card.species || "").trim() || "未指定";
    const worldTag = (card.worldTag || card.world || "").trim();
    const worldLore = (card.worldLore || card.world || "").trim();
    const appearance = (card.appearance || "").trim();
    const personaStyle = (card.personaStyle || card.persona || "").trim();
    const height = (card.height || card.stature || "").trim();
    const background = (card.background || card.worldview || "").trim();
    const storyline = (card.storyline || card.storyLine || "").trim();
    return [
        "你正在扮演以下角色：",
        `姓名：${name}`,
        `性别：${gender}${abo}`,
        `种族：${species}`,
        height ? `身高：${height}` : "",
        worldTag ? `世界标签：${worldTag}` : "",
        worldLore ? `世界背景：${worldLore}` : "",
        background ? `角色背景：${background}` : "",
        storyline ? `故事线索：${storyline}` : "",
        appearance ? `外貌：${appearance}` : "",
        personaStyle ? `说话风格：${personaStyle}` : ""
    ].filter(Boolean).join("\n");
}

export function buildCharacterRulesBlock(card) {
    if (!card) return "";
    const parts = [];
    if (card.replyRules || card.rules) parts.push(`回复规则：\n${card.replyRules || card.rules}`);
    if (Array.isArray(card.dynamic) && card.dynamic.length) {
        parts.push(`动态性格：${card.dynamic.join("；")}`);
    }
    return parts.filter(Boolean).join("\n");
}
