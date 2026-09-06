/**
 * 塔罗牌库与类型。
 *
 * 这些原本在 src/types.ts 里，但只有塔罗用得到，
 * 摘出产品主线时一并搬进来，让 types.ts 只保留在用的东西。
 */

export interface TarotCard {
  name: string;
  image: string;
  meaning: string;
}

export interface TarotReading {
  id: string;
  question: string;
  mode: 'single' | 'three';
  cards: TarotCard[];
  interpretation: string;
  timestamp: number;
}

export const TAROT_CARDS: TarotCard[] = [
  // Major Arcana
  { name: "愚者", image: "🃏", meaning: "新的开始，冒险，纯真" },
  { name: "魔术师", image: "🪄", meaning: "创造力，行动力，潜能" },
  { name: "女祭司", image: "🌙", meaning: "直觉，潜意识，神秘" },
  { name: "皇后", image: "👑", meaning: "丰饶，母性，自然" },
  { name: "皇帝", image: "🏛️", meaning: "权威，结构，稳定" },
  { name: "教皇", image: "⛪", meaning: "传统，信仰，教育" },
  { name: "恋人", image: "❤️", meaning: "选择，结合，价值观" },
  { name: "战车", image: "🛡️", meaning: "意志，胜利，控制" },
  { name: "力量", image: "🦁", meaning: "勇气，耐性，内在力量" },
  { name: "隐士", image: "🏮", meaning: "内省，孤独，寻求真理" },
  { name: "命运之轮", image: "🎡", meaning: "变化，周期，命运" },
  { name: "正义", image: "⚖️", meaning: "公平，真理，法律" },
  { name: "倒吊人", image: "⚓", meaning: "牺牲，新视角，等待" },
  { name: "死亡", image: "💀", meaning: "结束，转变，新生" },
  { name: "节制", image: "🧪", meaning: "平衡，融合，节制" },
  { name: "恶魔", image: "😈", meaning: "束缚，欲望，成瘾" },
  { name: "高塔", image: "⚡", meaning: "剧变，灾难，觉醒" },
  { name: "星星", image: "⭐", meaning: "希望，灵感，宁静" },
  { name: "月亮", image: "🌕", meaning: "不安，幻想，直觉" },
  { name: "太阳", image: "☀️", meaning: "快乐，成功，活力" },
  { name: "审判", image: "🎺", meaning: "觉醒，重生，决定" },
  { name: "世界", image: "🌍", meaning: "完成，旅行，圆满" },

  // Wands (Action, Passion, Energy)
  { name: "权杖一", image: "🪄", meaning: "灵感，新机会，创造力" },
  { name: "权杖二", image: "🪄", meaning: "规划，决定，远见" },
  { name: "权杖三", image: "🪄", meaning: "扩张，展望，合作" },
  { name: "权杖四", image: "🪄", meaning: "庆祝，和谐，稳定" },
  { name: "权杖五", image: "🪄", meaning: "竞争，冲突，挑战" },
  { name: "权杖六", image: "🪄", meaning: "胜利，认可，自信" },
  { name: "权杖七", image: "🪄", meaning: "防御，坚持，勇气" },
  { name: "权杖八", image: "🪄", meaning: "迅速，行动，消息" },
  { name: "权杖九", image: "🪄", meaning: "韧性，警惕，坚持" },
  { name: "权杖十", image: "🪄", meaning: "压力，负担，责任" },
  { name: "权杖侍从", image: "🪄", meaning: "探索，热情，消息" },
  { name: "权杖骑士", image: "🪄", meaning: "冲动，冒险，行动" },
  { name: "权杖皇后", image: "🪄", meaning: "自信，热情，社交" },
  { name: "权杖国王", image: "🪄", meaning: "领导力，愿景，企业家精神" },

  // Cups (Emotions, Relationships, Intuition)
  { name: "圣杯一", image: "🍷", meaning: "爱，新感情，直觉" },
  { name: "圣杯二", image: "🍷", meaning: "伙伴关系，吸引力，联系" },
  { name: "圣杯三", image: "🍷", meaning: "友谊，庆祝，社区" },
  { name: "圣杯四", image: "🍷", meaning: "冥想，冷淡，重新评估" },
  { name: "圣杯五", image: "🍷", meaning: "失落，悲伤，遗憾" },
  { name: "圣杯六", image: "🍷", meaning: "怀旧，纯真，分享" },
  { name: "圣杯七", image: "🍷", meaning: "幻想，选择，白日梦" },
  { name: "圣杯八", image: "🍷", meaning: "离开，寻求真理，放弃" },
  { name: "圣杯九", image: "🍷", meaning: "满足，愿望实现，快乐" },
  { name: "圣杯十", image: "🍷", meaning: "幸福，家庭，圆满" },
  { name: "圣杯侍从", image: "🍷", meaning: "敏感，创意，消息" },
  { name: "圣杯骑士", image: "🍷", meaning: "浪漫，理想主义，邀请" },
  { name: "圣杯皇后", image: "🍷", meaning: "直觉，同情，治愈" },
  { name: "圣杯国王", image: "🍷", meaning: "情感平衡，控制，慷慨" },

  // Swords (Intellect, Conflict, Communication)
  { name: "宝剑一", image: "⚔️", meaning: "突破，清晰，正义" },
  { name: "宝剑二", image: "⚔️", meaning: "僵局，逃避，选择" },
  { name: "宝剑三", image: "⚔️", meaning: "心碎，痛苦，分离" },
  { name: "宝剑四", image: "⚔️", meaning: "休息，恢复，沉思" },
  { name: "宝剑五", image: "⚔️", meaning: "冲突，失败，自私" },
  { name: "宝剑六", image: "⚔️", meaning: "过渡，离开，缓解" },
  { name: "宝剑七", image: "⚔️", meaning: "欺骗，逃避，背叛" },
  { name: "宝剑八", image: "⚔️", meaning: "束缚，无助，受限" },
  { name: "宝剑九", image: "⚔️", meaning: "焦虑，噩梦，绝望" },
  { name: "宝剑十", image: "⚔️", meaning: "背叛，终结，失败" },
  { name: "宝剑侍从", image: "⚔️", meaning: "好奇，警觉，沟通" },
  { name: "宝剑骑士", image: "⚔️", meaning: "行动，急躁，智力" },
  { name: "宝剑皇后", image: "⚔️", meaning: "独立，清晰，客观" },
  { name: "宝剑国王", image: "⚔️", meaning: "权威，逻辑，真理" },

  // Pentacles (Material, Work, Finance)
  { name: "星币一", image: "🪙", meaning: "繁荣，新机会，表现" },
  { name: "星币二", image: "🪙", meaning: "平衡，适应，优先顺序" },
  { name: "星币三", image: "🪙", meaning: "团队合作，技能，学习" },
  { name: "星币四", image: "🪙", meaning: "控制，稳定，占有欲" },
  { name: "星币五", image: "🪙", meaning: "贫困，孤立，不安全" },
  { name: "星币六", image: "🪙", meaning: "慷慨，分享，平衡" },
  { name: "星币七", image: "🪙", meaning: "耐心，评估，奖励" },
  { name: "星币八", image: "🪙", meaning: "学徒，勤奋，精通" },
  { name: "星币九", image: "🪙", meaning: "独立，奢侈，自给自足" },
  { name: "星币十", image: "🪙", meaning: "财富，遗产，家庭" },
  { name: "星币侍从", image: "🪙", meaning: "雄心，勤奋，机会" },
  { name: "星币骑士", image: "🪙", meaning: "可靠，耐心，努力工作" },
  { name: "星币皇后", image: "🪙", meaning: "务实，安全，慷慨" },
  { name: "星币国王", image: "🪙", meaning: "成功，纪律，丰富" },
];
