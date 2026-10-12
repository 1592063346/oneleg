// 文章的数据模型

/** 一篇文章的元信息（data/posts/index.json 中的单条） */
export interface PostMeta {
  /** URL 标识：路由 /posts/<id> 与正文文件名 data/posts/<id>.md 都用它 */
  id: string;
  /** 文章标题 */
  title: string;
  /** 作者，可选项 */
  author?: string;
  /** 发布日期，形如 "2026/10/12"，可选项 */
  date?: string;
  /** 简介，列表页显示，可选项 */
  desc?: string;
}

/** data/posts/index.json 的顶层结构 */
export interface PostIndexFile {
  posts?: PostMeta[];
}
