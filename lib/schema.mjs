export const STATUS = {
  UNCOLLECTED: 'uncollected',
  COLLECTING: 'collecting',
  COLLECTED: 'collected',
};

export const STATUS_LABEL = {
  uncollected: '未收集',
  collecting: '收集中',
  collected: '已收集',
};

export function isStatus(s) {
  return Object.values(STATUS).includes(s);
}
