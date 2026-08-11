// 导航树分组配置
// - NAV_GROUP_ID: 「导航入口」组对应的模块 id，始终置顶。
// - TAB_ORDER: Tab 分组的展示顺序与标题。
// - MODULE_TAB: 模块 id → Tab key 的映射。未在此表中的模块自动归入 'other'。

export const NAV_GROUP_ID = 'nav';

// 底部 Tab 入口：对应各 Tab 的首屏
export const TAB_ENTRIES = [
  { screen: 'chatList', title: 'Chat' },
  { screen: 'contactList', title: 'Contacts' },
  { screen: 'discoverMain', title: 'Discover' },
  { screen: 'meProfile', title: 'Me' },
];

export const TAB_ORDER = [
  { key: 'chat', label: 'Chat' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'discover', label: 'Discover' },
  { key: 'me', label: 'Me' },
  { key: 'other', label: 'Other' },
];

export const MODULE_TAB = {
  chat: 'chat',
  contacts: 'contacts',
  discover: 'discover',
  me: 'me',
};

export function tabOf(moduleId) {
  return MODULE_TAB[moduleId] || 'other';
}
