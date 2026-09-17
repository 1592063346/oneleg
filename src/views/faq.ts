// “关于网站”视图

export function buildFaqView(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "faq-view";
  wrap.innerHTML = `
    <h3>FAQ</h3>

    <div class="faq-item">
      <p><strong>Q：这是什么网站？</strong></p>
      <p>A：这是北京万籁阁（ONELEG）游戏王 OCG 比赛数据站，用于整理并展示所有由北京万籁阁举办的游戏王 OCG 比赛的结果与环境分布数据，并对上位结果进行统计。同时，网站有中国大陆游戏王赛事数据分站，用于收集、整理并展示 WCQ2026 后举办的所有国内大型赛事（包括 OCG 与简体中文环境）的结果与环境分布数据。数据均会实时更新。此外，本网站也支持卡组构筑与比赛卡表导出。</p>
    </div>

    <div class="faq-item">
      <p><strong>Q：为什么部分比赛的部分上位选手构筑未录入？</strong></p>
      <p>A：网站上线前的比赛上位构筑我们均未录入，我们会尽量保证录入后续所有积分赛与王中王邀请赛的上位构筑。</p>
    </div>

    <div class="faq-item">
      <p><strong>Q：为什么构筑预览与构筑导出的卡图有时会无法加载？</strong></p>
      <p>A：构筑预览与构筑导出部分的卡图 CDN 由 <a href="https://cdn.233.momobako.com" target="_blank" rel="noopener noreferrer">cdn.233.momobako.com</a> 提供，卡片详情由<a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a>提供，在此一并感谢。如果出现卡图无法正常加载，一般情况下非本网站问题。</p>
    </div>

    <div class="faq-item">
      <p><strong>Q：为什么构筑导出功能无法导入或搜索到部分卡片？</strong></p>
      <p>A：对于未发售先行卡，<a href="https://ygocdb.com" target="_blank" rel="noopener noreferrer">百鸽</a>尚不支持检索；通过 YDK 导入的卡片也均需借助百鸽数据库查询基础信息。因此，本网站功能尚不支持该类卡片。</p>
    </div>

    <div class="faq-item">
      <p><strong>Q：对网站有其他疑问或建议？</strong></p>
      <p>A：欢迎<a href="mailto:imagine076@qq.com">联系作者</a>进行讨论与修改。</p>
    </div>

    <h3>相关链接</h3>

    <ul class="faq-links">
      <li><a href="https://space.bilibili.com/3706978180270726/" target="_blank" rel="noopener noreferrer">北京ONELEG万籁阁游戏王 B 站官方账号</a></li>
      <li><a href="https://space.bilibili.com/519200091/" target="_blank" rel="noopener noreferrer">游戏王卡片游戏 B 站官方账号</a></li>
      <li><a href="https://ygocdb.com/" target="_blank" rel="noopener noreferrer">百鸽</a></li>
    </ul>
  `;
  return wrap;
}
