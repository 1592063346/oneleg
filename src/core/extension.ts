// 扩展模块：不列入站点菜单、只在 URL 可及的页面。
//
// 模块自带站点前缀、数据加载、页首与视图，核心只把它们接进路由、外壳与渲染分发，
// 故新增一个同类页面只需写一个模块目录，再把模块加进下面的 EXTENSIONS 数组，
// 其余代码一律无须改动。

import type { Site, State, AppActions } from "./config.js";
import { postModule } from "../posts/module.js";

export interface ExtensionModule {
  /** 站点标识，路由与应用状态里的 site */
  site: Site;
  /** URL 基础路径，如 "/posts"。其后的剩余路径即本模块的参数 */
  path: string;
  /** 进入模块时加载数据。param 取自地址，入口页为 null；失败由模块自己的视图提示 */
  load(param: string | null): Promise<void>;
  /** 渲染视图主体 */
  render(state: State, actions: AppActions): HTMLElement;
  /** 页首导航。扩展模块不套站点外壳，页首由模块自己给出；省略则页首留空 */
  nav?(state: State, actions: AppActions): Node | null;
  /** 数据是否已缓存，可原地重绘而不必重走 load；省略则一律重走 */
  isReady?(): boolean;
}

/** 全部扩展模块。新增一个同类页面，只需在这里加一项 */
export const EXTENSIONS: ExtensionModule[] = [postModule];

/** 该站点对应的扩展模块；不是扩展模块则为 null */
export function extensionFor(site: Site): ExtensionModule | null {
  return EXTENSIONS.find((each) => each.site === site) ?? null;
}

/** 该站点的数据是否已缓存，可原地重绘 */
export function extensionReady(site: Site): boolean {
  return extensionFor(site)?.isReady?.() === true;
}

/** 按 URL 路径匹配扩展模块，param 为路径中基础前缀之后的剩余部分 */
export function matchExtension(
  path: string
): { module: ExtensionModule; param: string | null } | null {
  for (const module of EXTENSIONS) {
    if (path === module.path) return { module, param: null };
    if (path.startsWith(module.path + "/")) {
      const rest = path.slice(module.path.length + 1);
      return { module, param: rest ? decodeParam(rest) : null };
    }
  }
  return null;
}

/** 解码地址里的参数。转义不合法（如地址中存在孤立的 %）时原样返回，交由模块按不存在的页面处理 */
function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
