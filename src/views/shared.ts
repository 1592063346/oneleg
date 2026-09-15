// 视图间共享的小工具

import type { MatchType } from "../types.js";

/** 比赛类型对应的颜色标识（用于徽章、标签、类型筛选） */
export function matchTypeColor(type: MatchType): string {
  return (
    {
      // 主站
      积分赛: "purple",
      娱乐赛: "green",
      王中王邀请赛: "orange",
      特殊规则赛: "brown",
      // 分站（国内赛事数据站）
      城市巡回赛: "blue",
      YCS: "purple",
      特别大会: "green",
      "WCQ 预选赛": "orange",
      WCQ: "red",
    }[type] || ""
  );
}
