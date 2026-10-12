// 文章模块：在扩展机制里的登记项（见 core/extension.ts）

import type { ExtensionModule } from "../core/extension.js";
import { loadPostIndex, loadedPostIndex } from "./data.js";
import { buildPostNav, buildPostView } from "./view.js";

export const postModule: ExtensionModule = {
  site: "posts",
  path: "/posts",
  // 正文按需加载（见 view.ts），进入模块时只需取回清单
  load: async () => {
    await loadPostIndex();
  },
  render: (state, actions) => buildPostView(state, actions),
  nav: (state, actions) => buildPostNav(state, actions),
  isReady: () => loadedPostIndex() !== null,
};
