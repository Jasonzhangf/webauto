export const COLLECT_KEYWORDS = [
  '月全食',
  '湖南卫视元宵喜乐会',
  '全国政协十四届四次会议新闻发布会',
  '央视元宵晚会',
  '刘文祥 每家店味道不一样',
  '伊朗称向美航母发射4枚巡航导弹',
  '多地辟谣网传新能源汽车里程税',
  '元宵晚会节目单',
  '世界油阀关闭',
  '元宵节',
  '刘文祥头像',
  '黄金跌破5100美元',
  '迪奥官宣王楚然',
  '品牌方回应迪丽热巴缺席',
  '369为TES野辅发声',
  '伊朗纳坦兹核设施遭破坏',
  '油价或涨超70%',
  '全球股市黑色星期二',
  '月全食直播',
  '男子1年吃347顿火锅全家都陪不动了',
];

export function pickRandomKeyword(list = COLLECT_KEYWORDS) {
  const items = Array.isArray(list) ? list.filter(Boolean) : [];
  if (items.length === 0) return '月全食';
  const index = Math.floor(Math.random() * items.length);
  return items[index] || items[0];
}
