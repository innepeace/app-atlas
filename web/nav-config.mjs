// 导航树分组配置（可调整）
// - NAV_GROUP_ID: 「导航入口」组对应的模块 id（buildSkeleton 把 5 Tab + 侧边栏入口屏聚到该模块），始终置顶。
// - TAB_ORDER: Tab 分组的展示顺序与标题。key 为内部键，label 为界面文案。
// - MODULE_TAB: 模块 id → Tab key 的映射。未在此表中的模块自动归入 'other'（其他）。
// 想调整分组：改 MODULE_TAB 即可；想调整顺序/标题：改 TAB_ORDER。

export const NAV_GROUP_ID = 'nav';

// 「导航入口」组：底部 5 Tab + 侧边栏，指向各自真实屏 id（这些屏仍保留在其原模块分组内）。
// screen 为真实存在的屏 id（registry 中唯一）；title 覆盖展示名。若 screen 不存在则渲染为未收集占位。
export const TAB_ENTRIES = [
  { screen: 'watchlistMain', title: 'Watchlist 自选' },
  { screen: 'marketMain', title: 'Markets 行情' },
  { screen: 'tradeCenterShow', title: 'Trade 交易中心 ⊕' },
  { screen: 'portfolioMain', title: 'Portfolio 持仓' },
  { screen: 'communityShowEnable', title: 'Feeds 社区' },
  { screen: 'personalHome', title: 'Sidebar 侧边栏' },
];

export const TAB_ORDER = [
  { key: 'market', label: '行情' },
  { key: 'trade', label: '交易' },
  { key: 'news', label: '资讯' },
  { key: 'community', label: '社区' },
  { key: 'mine', label: '我的' },
  { key: 'sidebar', label: '侧边栏' },
  { key: 'other', label: '其他（未归类）' },
];

export const MODULE_TAB = {
  // 行情
  market: 'market', quote: 'market', watchlist: 'market', stock: 'market',
  etf: 'market', stockEvents: 'market', tradeStockDepthList: 'market',
  scanner: 'market', heatRankingView: 'market',
  heatRankingViewWillAppear: 'market', heatRankingViewDidAppear: 'market',
  heatRankingViewDidDisappear: 'market',
  // 交易
  trade: 'trade', order: 'trade', fund: 'trade', ipo: 'trade',
  portfolio: 'trade', asset: 'trade', options: 'trade', payment: 'trade',
  // 资讯
  news: 'news', calendar: 'news', education: 'news', today: 'news',
  mainThemeView: 'news', mainThemeViewWillAppear: 'news',
  // 社区
  comment: 'community', community: 'community', CommentListVC: 'community',
  CommunityContainerVC: 'community', nickNameAndAvatar: 'community',
  commentChart: 'community', requestCommunityUserInfo: 'community',
  commentMoreAction: 'community', commentEditor: 'community',
  shareMeunShow: 'community',
  // 我的
  user: 'mine', personal: 'mine', settings: 'mine', setup: 'mine',
  update: 'mine', message: 'mine',
  // 侧边栏（暂无明确归属，按需补充）
  // other: app / webview / webView / common / search / pdf / aichat / ai /
  //        animation / socketBasicStartMonitor / loadCurrentPremission / test
};

export function tabOf(moduleId) {
  return MODULE_TAB[moduleId] || 'other';
}
