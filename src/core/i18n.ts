// 站内文案的中英对照表。
// 英文留空的条目一律回退到中文，故可以逐条补全，未补的照常显示。
// 文案里的 {xxx} 为占位符，调用处用 t(key, { xxx: ... }) 填值。

import type { LimitTable } from "./types.js";

/** 一条文案 */
interface Msg {
  zh: string;
  /** 留空则回退到 zh */
  en: string;
}

/** 声明一条文案 */
function msg(zh: string, en: string = ""): Msg {
  return { zh, en };
}

export type Lang = "zh" | "en";

/** 全部文案。按模块或页面分组，键即分组名 */
const MESSAGES = {
  // ---- 页面标题与描述（index.html 里另有一份中文静态副本，供无脚本时显示） ----
  "meta.title": msg("万籁阁比赛数据站", "ONELEG OCG Tournament Data"),
  "meta.description": msg(
    "北京万籁阁（ONELEG）游戏王 OCG 比赛数据站，展示历次比赛结果、卡组环境分布与上位构筑统计，并收录国内大型赛事数据，支持卡组构筑与比赛卡表导出。",
    "Yu-Gi-Oh! OCG tournament data hub for Beijing ONELEG. Browse past tournament results, meta breakdowns and top cut deck statistics, plus data from major tournaments in China Mainland. Includes a deck builder and tournament decklist export."
  ),

  // ---- 通用 ----
  "common.loading": msg("加载中...", "Loading…"),
  "common.remove": msg("移除 {name}", "Remove {name}"),

  // ---- 入口 ----
  "app.loading": msg("正在加载…", "Loading…"),
  "app.loadFailed": msg("加载数据失败：{msg}", "Failed to load data: {msg}"),
  "app.loadFailedHint": msg(
    "请通过本地服务器访问（例如 npm run serve），而非直接双击打开文件。",
    "Serve this site over HTTP (for example, npm run serve) instead of opening the file directly."
  ),
  "app.deckDecodeFailed": msg(
    "链接构筑无法解析，默认加载空构筑。",
    "The deck in this link could not be decoded. Loading an empty deck instead."
  ),

  // ---- 站点配置 ----
  "site.home.title": msg("万籁阁游戏王 OCG 比赛数据站", "ONELEG Yu-Gi-Oh! OCG Tournament Data"),
  "site.event.title": msg("中国大陆游戏王赛事数据站", "Yu-Gi-Oh! China Mainland Tournament Data"),
  "edition.ocg": msg("OCG", "OCG"),
  "edition.sc": msg("简体中文", "Simplified Chinese"),

  // ---- 导航 ----
  "menu.main": msg("主站", "Home"),
  "menu.event": msg("国内赛事数据站", "China Event Data"),
  "menu.builder": msg("构筑导出", "Deck Builder"),
  "menu.faq": msg("关于网站", "About"),
  "nav.siteMenu": msg("切换站点", "Switch site"),
  "nav.view.pie": msg("比赛详情", "Tournaments"),
  "nav.view.trend": msg("上位卡组统计", "Top Cut Stats"),
  "nav.lang.toEn": msg("切换到英文", "Switch to English"),
  "nav.lang.toZh": msg("切换到中文", "Switch to Chinese"),

  // ---- 页脚 ----
  "footer.faq": msg("关于网站", "About"),
  "footer.repo": msg("网站仓库", "Repo"),
  "footer.cardSupport": msg("卡片数据支持：", "Card data provided by "),
  "footer.ygocdb": msg("百鸽"),
  "footer.updated": msg("最后更新于 {date}", "Last updated {date}"),

  // ---- 离开提醒 ----
  "leave.deckConfirm": msg(
    "当前构筑存在已有卡片，离开后将会丢失。确定离开？",
    "This deck already contains cards and will be lost if you leave. Leave anyway?"
  ),

  // ---- 数据加载 ----
  "data.loadFailed": msg("无法加载数据文件 {path}（HTTP {status}）", "Failed to load data file {path} (HTTP {status})"),
  "data.badFormat": msg("数据文件格式不正确：缺少 decks 数组", "Malformed data file: missing decks array"),

  // ---- 比赛详情 ----
  "pie.selectMatch": msg("选择比赛：", "Select tournament:"),
  "pie.noMatch": msg("暂无比赛数据。", "No tournament data."),
  "pie.noMatchOption": msg("（无比赛）", "(no tournament)"),
  "pie.meta.type": msg("比赛类型", "Type"),
  "pie.meta.date": msg("比赛日期", "Date"),
  "pie.meta.players": msg("参赛人数", "Players"),
  "pie.meta.playersValue": msg("{n} 人", "{n}"),
  "rank.first": msg("🥇 冠军", "🥇 1st"),
  "rank.second": msg("🥈 亚军", "🥈 2nd"),
  "rank.top4": msg("🥉 四强", "🥉 3-4th"),
  "deck.view": msg("查看构筑", "View deck"),
  "deck.loadFailed": msg("无法加载卡组文件", "Failed to load the deck file"),

  // ---- 卡组区域与弹窗 ----
  "deck.main": msg("主卡组", "Main Deck"),
  "deck.extra": msg("额外卡组", "Extra Deck"),
  "deck.side": msg("副卡组", "Side Deck"),
  "deck.preview": msg("构筑预览", "Deck Preview"),
  "deck.downloadYdk": msg("下载构筑 YDK 文件", "Download YDK"),
  "deck.removeHint": msg("点击移除", "Click to remove"),
  "deck.overLimit": msg("{title} {count} 张，超过 {limit} 张上限", "{title} has {count} cards, over the limit of {limit}"),

  // ---- 上位卡组统计 ----
  "trend.date": msg("比赛日期：", "Date:"),
  "trend.dateSeparator": msg(" 至 ", " to "),
  "trend.clear": msg("清除", "Clear"),
  "trend.type": msg("比赛类型：", "Type:"),
  "trend.addDeck": msg("添加卡组：", "Add archetype:"),
  "trend.searchPlaceholder": msg("搜索卡组名并添加…", "Search archetype names…"),
  "trend.noMatchingDeck": msg("无匹配的卡组名", "No matching archetype name"),
  "trend.allDecksAdded": msg("已添加全部上位卡组", "All archetypes added"),
  "trend.showAll": msg("查看全部上位卡组", "Show all"),
  "trend.clearDecks": msg("清空卡组", "Clear"),

  // ---- 构筑导出 ----
  "builder.ydk.import": msg("导入 YDK", "Import YDK"),
  "builder.ydk.file": msg("导入 YDK 文件：", "Import YDK file:"),
  "builder.ydk.chooseFile": msg("选择文件", "Choose file"),
  "builder.ydk.text": msg("导入 YDK 文本：", "Import YDK text:"),
  "builder.ydk.textPlaceholder": msg("粘贴 YDK 文本…", "Paste YDK text…"),
  "builder.ydk.importText": msg("导入文本", "Import"),
  "builder.ydk.importing": msg("导入中…", "Importing…"),
  "builder.ydk.emptyText": msg("请先粘贴 YDK 文本。", "Paste some YDK text first."),
  "builder.ydk.unrecognized": msg(
    "未识别到卡片，请检查文本格式。",
    "No cards recognized. Check the text format."
  ),
  "builder.ydk.importFailed": msg("导入失败：{msg}", "Import failed: {msg}"),
  "builder.ydk.readFailed": msg("读取失败：{msg}", "Read failed: {msg}"),
  "builder.search": msg("卡片搜索：", "Search card:"),
  "builder.search.placeholder": msg("输入关键词后回车…", "Type a keyword and press Enter…"),
  "builder.search.submit": msg("搜索", "Search"),
  "builder.search.clearDeck": msg("清空构筑", "Clear deck"),
  "builder.search.confirmClear": msg("确认清空当前构筑？", "Clear the current deck?"),
  "builder.search.searching": msg("搜索中…", "Searching…"),
  "builder.search.empty": msg("没有找到匹配的卡片。", "No matching cards found."),
  "builder.search.failed": msg("搜索失败：{msg}", "Search failed: {msg}"),
  "builder.results.info": msg("卡片信息", "Card info"),
  "builder.result.noName": msg("（无中文名）", "(no name)"),
  "builder.result.noJpName": msg("（无日文名）", "(no Japanese name)"),
  "builder.step.overLimit": msg(
    "数量超过当前适用禁限卡表要求。",
    "This exceeds the limit for this card on the current banlist."
  ),
  "builder.step.sectionFull": msg(
    "{label}已达 {limit} 张上限，请先移除卡片再进行添加。",
    "{label} is already at its limit of {limit}. Remove a card before adding another."
  ),
  "builder.deck.editNote": msg("点击卡片可将其从构筑中移除。", "Click a card to remove it from the deck."),
  "builder.deck.readOnlyNote": msg("点击卡片以查看卡片详情。", "Click a card to view its detail."),
  "builder.export.langLabel": msg("请选择导出语言：", "Export language:"),
  "builder.export.pdf": msg("导出为 PDF 比赛卡表", "Export PDF"),
  "builder.export.ydk": msg("导出为 YDK 文件", "Export YDK"),
  "builder.export.blank": msg("下载空卡表", "Download blank decklist"),
  "builder.export.share": msg("复制分享链接", "Copy share link"),
  "builder.export.edit": msg("编辑卡组", "Edit deck"),
  "builder.export.empty": msg(
    "构筑为空，请先导入或添加卡片。",
    "The deck is empty. Import or add cards first."
  ),
  "builder.export.pdfFailed": msg(
    "生成比赛卡表失败：{msg}",
    "Failed to generate the decklist: {msg}"
  ),
  "builder.export.blankFailed": msg(
    "下载空白卡表失败：{msg}",
    "Failed to download the blank decklist: {msg}"
  ),
  "builder.export.copyPrompt": msg("请手动复制分享链接：", "Copy the share link manually:"),
  "builder.lang.jp": msg("日文", "Japanese"),
  "builder.lang.sc": msg("简体中文", "Simplified Chinese"),

  // ---- 禁限卡表 ----
  "limit.label": msg("适用禁限卡表：", "Limit regulation:"),
  "limit.none": msg("无（默认）", "None (default)"),
  "limit.view": msg("查看", "View"),
  "limit.loadFailed": msg(
    "禁卡表加载失败，将不做张数校验。",
    "Failed to load the limit regulation. Card counts will not be validated."
  ),
  "limit.forbidden": msg("禁止卡", "Forbidden"),
  "limit.limited": msg("限制卡", "Limited"),
  "limit.semiLimited": msg("准限制卡", "Semi-Limited"),
  "limit.notFound": msg("未找到该禁限卡表", "Limit regulation not found"),
  "limit.select": msg("选择禁限卡表：", "Select limit regulation:"),
  "limit.cardsFailed": msg("卡片信息加载失败，卡片按卡密排列", "Failed to load card data; the list is ordered by card ID"),
  "limit.readFailed": msg("读取 {url} 失败（HTTP {status}）", "Failed to read {url} (HTTP {status})"),

  // ---- 卡片检索 ----
  "cards.searchFailed": msg("检索接口返回 HTTP {status}", "Card search returned HTTP {status}"),

  // ---- 卡表导出 ----
  "deckForm.readFailed": msg(
    "读取空白卡表失败（HTTP {status}）",
    "Failed to read the blank decklist (HTTP {status})"
  ),
  "deckForm.noCanvas": msg("浏览器未能创建画布", "The browser could not create a canvas"),
  "deckForm.pngFailed": msg("画布导出图片失败", "Failed to export the canvas as an image"),

  // ---- 饼图 ----
  "pieChart.title": msg("比赛结果与环境分布", "Results and Meta Breakdown"),
  "pieChart.elimTitle": msg("{title}淘汰赛"),
  "pieChart.elimCaption": msg("淘汰赛卡组分布", "Top cut breakdown"),
  "pieChart.caption": msg("总环境卡组分布", "Overall meta breakdown"),
  "pieChart.empty": msg("本场比赛暂无环境卡组数据。", "No breakdown for this tournament."),
  "pieChart.loading": msg("饼图加载中……", "Loading chart…"),
  "pieChart.aria": msg("{title} 卡组分布饼图", "{title} deck breakdown pie chart"),
  "pieChart.tooltip": msg("数量 {num} · 占比 {pct}%", "Count {num} · {pct}%"),
  "pieChart.archetypeSeparator": msg("；", "; "),
  // 子卡组名与主卡组名之间：中文直接相连，英文留一个空格
  "pieChart.archetypeGap": msg("", " "),
  "others.title": msg(
    "others 详情（共 {count} 种 / {sum} 个卡组）",
    "Details of others ({count} archetypes / {sum} decks)"
  ),

  // ---- 折线图 ----
  "line.empty": msg(
    "请选择至少一个卡组以查看上位数量统计",
    "Select at least one archetype to see top cut counts"
  ),
  "line.aria": msg("卡组数量趋势折线图", "Deck count trend line chart"),

  // ---- 关于网站 ----
  // 问与答含内联链接，故整段存 HTML 片段：英文的语序与链接位置由译文自己安排，
  // 无须迁就中文的分句。调用处按 innerHTML 写入。
  "faq.q1": msg("Q：这是什么网站？", "Q: What is this site for?"),
  "faq.a1": msg(
    "A：这是北京万籁阁（ONELEG）游戏王 OCG 比赛数据站，用于整理并展示所有由北京万籁阁举办的游戏王 OCG 比赛的结果与环境分布数据，并对上位结果进行统计。同时，网站有中国大陆游戏王赛事数据分站，用于收集、整理并展示 WCQ2026 后举办的所有国内大型赛事（包括 OCG 与简体中文环境）的结果与环境分布数据。数据均会实时更新。此外，本网站也支持卡组构筑与比赛卡表导出。",
    "A: This is the Yu-Gi-Oh! OCG tournament data hub for Beijing ONELEG. It gathers the tournaments ONELEG has run and presents the results, the meta breakdowns and the top cut statistics for each. A second section covers all major events in Chinese mainland since WCQ2026, again with results and meta breakdowns. All of the data updates in real time. This site also offers a deck builder and decklist export."
  ),
  "faq.q2": msg(
    "Q：为什么部分比赛的部分上位选手构筑未录入？",
    "Q: Why are some top cut decklists missing?"
  ),
  "faq.a2": msg(
    "A：网站上线前的比赛上位构筑我们均未录入，我们会尽量保证录入后续所有积分赛与王中王邀请赛的上位构筑。",
    "A: We did not record top cut decklists for tournaments held before this site launched; we will do our best to record all top cut decklists for every upcoming Ranking and Invite-only tournament."
  ),
  "faq.q3": msg(
    "Q：为什么构筑预览与构筑导出的卡图有时会无法加载，或者构筑导出功能无法导入或搜索到部分卡片？",
    "Q: Why do some card images fail to load in the deck preview and deck builder, and why can't the builder import or find certain cards?"
  ),
  "faq.a3": msg(
    'A：构筑预览与构筑导出部分的卡图 CDN 由 <a href="https://cdn.233.momobako.com" target="_blank" rel="noopener noreferrer">cdn.233.momobako.com</a> 提供（超先行卡卡图由 <a href="https://cdntx.moecube.com/" target="_blank" rel="noopener noreferrer">cdntx.moecube.com</a> 提供），卡片检索与详情由<a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a>提供，在此一并感谢。如果出现卡图无法正常加载，一般情况下非本网站问题。同时，对于仅公布信息但尚未正式发售的先行卡，<a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a>尚不支持检索；通过 YDK 导入的卡片也均需借助<a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a>数据库查询基础信息，故本网站功能尚不支持该类卡片。',
    'A: Card images in the deck preview and deck builder are mostly served by <a href="https://cdn.233.momobako.com" target="_blank" rel="noopener noreferrer">cdn.233.momobako.com</a>, with superpre card images coming from <a href="https://cdntx.moecube.com/" target="_blank" rel="noopener noreferrer">cdntx.moecube.com</a>; card search and data come from <a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a> — our thanks to all of them. If an image fails to load, the cause is usually not this site. Cards that have been revealed but not yet released cannot be searched on <a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a> yet, and cards imported from a YDK file also need its database for their basic information, so this site cannot support them for now.'
  ),
  "faq.q4": msg("Q：对网站有其他疑问或建议？", "Q: Other questions or suggestions about this site?"),
  "faq.a4": msg(
    'A：欢迎<a href="mailto:imagine076@qq.com">联系作者</a>进行讨论与修改。',
    'A: Feel free to <a href="mailto:imagine076@qq.com">contact the author</a>.'
  ),
  "faq.links": msg("相关链接", "Related links"),
  "faq.link.oneleg": msg("北京ONELEG万籁阁游戏王 B 站官方账号", "Beijing ONELEG Official on Bilibili"),
  "faq.link.ygo": msg("游戏王卡片游戏 B 站官方账号", "Yu-Gi-Oh! Card Game Official on Bilibili"),
  "faq.link.ygocdb": msg("百鸽"),

  // ---- 导出图片 ----
  // "export.button": msg("导出图片", "Export image"),
  // "export.buttonTitle": msg("导出当前饼图为图片", "Export the current pie chart as an image"),
  // "export.askBackground": msg(
  //   "是否添加自定义背景图片？\n\n点击“确定”选择背景图片；\n点击“取消”使用纯色背景。",
  //   "Add a custom background image?\n\nClick “OK” to choose a background image;\nclick “Cancel” to use a solid background."
  // ),
  // "export.noSvg": msg("未找到 SVG 元素", "No SVG element found"),
  // "export.noCanvas": msg("无法创建 canvas context", "Could not create a canvas context"),
  // "export.imageFailed": msg("图片加载失败", "Failed to load the image"),
  // "export.pngFailed": msg("导出失败：无法生成图片", "Export failed: could not generate the image"),
  // "export.failed": msg("导出失败：{msg}", "Export failed: {msg}"),
  // "export.unknownError": msg("未知错误", "Unknown error"),
};

export type MsgKey = keyof typeof MESSAGES;

// ---- 当前语言 ----

let lang: Lang = "zh";

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
}

/** URL 参数 -> 语言；除 en 外一律按中文 */
export function parseLang(param: string | null): Lang {
  return param === "en" ? "en" : "zh";
}

/** 取一条文案，并按 params 替换其中的 {xxx}；无对应参数时原样保留占位符 */
export function t(key: MsgKey, params?: Record<string, string | number>): string {
  const entry = MESSAGES[key];
  const text = (lang === "en" ? entry.en : "") || entry.zh;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

/**
 * 卡组名的中英对照。键为数据里的中文卡组名，英文留空则照显中文。
 * 目前中文名同时是卡图与 center.json 的索引，故只作显示用；
 * 待全部翻译完成、索引也改为英文之后，这张表才会变成真正的主数据。
 *
 * 英文名取百鸽的官方英文名；尚未发行英文版的系列（多为近两年的新系列）
 * 用的是其常用英译，日后有官方英文名时替换即可。
 */
export const DECK_NAMES_EN: Record<string, string> = {
  "-英雄": "-HERO",
  "D.D.ダイナマイト": "D.D. Dynamite",
  DDD: "D/D/D",
  GMX: "GMX",
  "R.B.": "R.B.",
  三幻魔: "Sacred Beast",
  亚特兰蒂斯: "Atlantis",
  光与暗的仪式: "Light and Darkness Ritual",
  光之黄金柜: "Shining Sarcophagus",
  光道: "Lightsworn",
  六武众: "Six Samurai",
  共鸣者: "Resonator",
  冥铭途: "Memento",
  冰结界: "Ice Barrier",
  列车: "Train",
  剑斗兽: "Gladiator Beast",
  卡通: "Toon",
  召唤兽: "Invoked",
  同步士: "Synchron",
  命运英雄: "Destiny HERO",
  埃尔德里奇: "Eldlich",
  堕天使: "Darklord",
  塞尼特: "Zenet",
  多种加速同步: "Multiple Accel Synchro",
  多种送入墓地: "Multiple Sends to GY",
  多种陷阱: "Multiple Traps",
  天杯龙: "Tenpai Dragon",
  奥艺: "Ars Magna",
  妖精传姬: "Fairy Tail",
  宝石骑士: "Gem-Knight",
  对击斗魂: "Vanquish Soul",
  小丑戏帮: "Clown Crew",
  尤贝尔: "Yubel",
  巳剑: "Mitsurugi",
  帝王: "Monarch",
  幻想魔族: "Illusions",
  "异解△": "Xenovader△",
  弈勇: "Vaylantz",
  影依: "Shaddoll",
  影灵衣: "Nekroz",
  征龙: "Dragon Ruler",
  御巫: "Mikanko",
  急袭猛禽: "Raidraptor",
  恐啡肽: "Dinomorphia",
  恐啡肽骇龙: "Dinomorphia",
  恐龙: "Dinosaur",
  恩底弥翁: "Endymion",
  恶魔: "Archfiend",
  拉比丽斯: "Labrynth",
  拟声: "Onomat",
  捕食植物: "Predaplant",
  救援王牌: "Rescue-ACE",
  时间黑魔术师: "Dark Time Wizard",
  星圣: "Constellar",
  星宿: "Dracotail",
  星骑士: "Satellarknight",
  月光: "Lunalight",
  机关傀偶: "Gimmick Puppet",
  杀手旋律: "Kewl Tune",
  枪弹: "Rokket",
  植物族: "Plants",
  水晶机巧: "Crystron",
  泪冠哀歌: "Tearlaments",
  活死人的呼声: "Call of the Haunted",
  海皇: "Atlantean",
  海造贼: "Plunder Patroll",
  淘气仙星: "Trickstar",
  混沌: "Chaos",
  游魊: "Ghoti",
  灵魂鸟: "Shinobird",
  炎王: "Fire King",
  烙印: "Branded",
  焰圣骑士: "Infernoble Knight",
  狱炎机: "Infernoid",
  狱神: "Power Patron",
  王家的神殿: "Temple of the Kings",
  电子界族: "Cyberse",
  电子龙: "Cyber Dragon",
  白森: "White Forest",
  百夫骑: "Centur-Ion",
  皮尔莉: "Purrely",
  盈彩月夜: "Raise Moon",
  相剑: "Swordsoul",
  码丽丝: "Maliss",
  破械: "Unchained",
  磁石战士: "Magnet Warrior",
  神碑: "Runick",
  神艺: "Artmage",
  空牙团: "Fur Hire",
  童话动物: "Melffy",
  纠罪巧: "Enneacraft",
  终刻: "DoomZ",
  绚岚: "Radiant Typhoon",
  罪宝: "Sinful Spoils",
  耀圣: "Elfnote",
  肃声: "Voiceless Voice",
  自鸣天琴: "Orcust",
  艮鬼: "Ashtra",
  虫惑魔: "Traptrix",
  蛇眼: "Snake-Eye",
  超级量子: "Super Quant",
  转生炎兽: "Salamangreat",
  银河眼: "Galaxy-Eyes",
  闪刀姬: "Sky Striker",
  随风飘飘游: "Floowandereeze",
  雷热涡炉: "Ryzeal",
  雷盟: "Blitzclique",
  霍普: "Utopia",
  青眼: "Blue-Eyes",
  青蛙: "Frog",
  驱魔姐妹: "Exosister",
  魅影骑士团: "The Phantom Knights",
  魔女工艺: "Witchcrafter",
  魔弹: "Magical Musket",
  魔术师: "Magician",
  魔镌: "Fiendsmith",
  黑羽: "Blackwing",
  黑魔导: "Dark Magician",
  黯蜜: "Yummy",
  龙华: "Ryu-Ge",
  龙女仆: "Dragonmaid",
};

/** 按当前语言取卡组显示名；中文模式与未翻译的一律返回原名 */
export function deckName(zh: string): string {
  if (lang !== "en") return zh;
  return DECK_NAMES_EN[zh] || zh;
}

/**
 * 比赛类型的中英对照。键为数据里的类型名，英文留空则照显中文。
 * 类型名同时是颜色映射与筛选的键，故同样只作显示用。
 */
const MATCH_TYPE_NAMES_EN: Record<string, string> = {
  娱乐赛: "Casual",
  积分赛: "Ranking",
  王中王邀请赛: "Invite-only",
  特殊规则赛: "Special Format",
  城市巡回赛: "CCT",
  YCS: "YCS",
  特别大会: "Special",
  "WCQ 预选赛": "WCQ Regional Qualifier",
  WCQ: "WCQ",
};

/** 按当前语言取比赛类型显示名 */
export function matchTypeName(zh: string): string {
  if (lang !== "en") return zh;
  return MATCH_TYPE_NAMES_EN[zh] || zh;
}

/**
 * 按当前语言取禁限卡表显示名。
 * 与上面两张表不同，英文名存在卡表文件自身（data/limits/*.json 的 name_en），
 * 故表里读不到时回退中文，规则与 deckName 一致。
 */
export function limitName(table: LimitTable): string {
  if (lang !== "en") return table.name;
  return table.name_en || table.name;
}
