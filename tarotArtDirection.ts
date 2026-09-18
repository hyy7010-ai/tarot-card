/**
 * 真心塔罗 · 插画艺术方向
 *
 * 78 张能不能像一套牌，取决于这份母样式，而不是单张画得多好。
 * 设计原则（每一条都对应一个 AI 出图的失败模式）：
 *  - 严格 4 色油墨：限定色板 = 一致性的物理保证，也直接对应平台色板
 *  - 无脸 / 背身剪影：脸是 AI 最不稳定的部位；同时呼应 AI 人设「统一、无名、无角色」
 *  - 丝网 / Riso 印刷质感：颗粒和轻微套印偏移会把不同批次的图统一成同一「印刷品」
 *  - 画面里不出现文字、不画边框：牌名和边框由卡片组件提供
 *  - 保留韦特体系的经典图像学：解读要能被懂塔罗的人读懂
 */

export const MASTER_STYLE = [
  // 2026-09-06 在 Canva Dream Lab 用 高塔 / 恋人 / 宝剑三 三个题材实测锁定。
  // 以下每一条都对应用户选中样张里稳定出现的特征，改动前先回看那三张。
  'Tarot card illustration, tall portrait composition, full-bleed artwork.',
  'Silkscreen / risograph print: flat solid inks, visible paper grain, slight misregistration, no gradients, no 3D, no photorealism.',
  // 2026-09-11 补：原来的母样式从没写过背景色，于是模型每次自由发挥 ——
  // 试出第一张小阿卡纳时背景跑成了藏青，和已有的 22 张深紫对不上。
  // 底色必须钉死，否则 55 张会各是各的颜色。
  'Strict four-ink palette, no other colours anywhere: the whole background is deep violet-purple #2E0854 (never navy, never blue-grey, never black), solid pink #FFB6C1, orange #FF8C00, and acid green #CCFF00.',
  'Acid green #CCFF00 appears ONLY as a few small four-point star sparkles - never as a large shape. Exception: the lightning bolt on The Tower and the serpent on The Lovers or The Devil, which are that card own motif.',
  'Figures are faceless, elongated, art-deco silhouettes in solid pink — never a detailed face, never outlined.',
  /*
    ⚠️ 这一条以前是「one focal symbol centered; a crescent moon near the top」——
       把构图也钉死了，于是 78 张成了同一张牌画 78 遍：
       主体永远居中、弯月永远压在它正上方、粉云永远框住上下两角。
       实测 w11 / c11 / s03 三张摆在一起，只有道具不同。

       一致性应该来自**材质**（油墨、颗粒、套印偏移、无脸剪影），不是来自构图。
       上面那些定死油墨和质感的条目一个字都没动 —— 它们才是让 78 张像一套牌的原因。
       这一条改成允许而非强制，构图交给每张牌自己的场景描述。
  */
  'Composition follows the scene description, not a fixed template: the subject may sit off-centre, low in the frame, high, cropped, or fill it entirely. A crescent moon may appear where the scene calls for it and need not be centred or present at all. Small four-point star sparkles; soft pink cloud banks may frame edges; fine vertical rain or grain lines allowed as texture.',
  'Generous negative space. Mood: nocturnal, still, austere, quietly powerful — not cute, not whimsical.',
  'No text, no letters, no numbers, no border, no frame, no watermark.',
].join(' ');

export const NEGATIVE = 'text, letters, typography, border, frame, realistic face, photorealism, 3d render, gradient shading, cute, chibi, cluttered, watermark, low contrast';

/** 大阿卡纳：每张独立场景（韦特图像学的简化版） */
export const MAJOR_SCENES: Record<string, string> = {
  愚者:     'a faceless figure stepping off a cliff edge into open violet sky, small bundle on a staff, a white dog at the heel, a rising sun behind',
  魔术师:   'a faceless figure with one arm raised to the sky and one pointing to the ground, a lemniscate hovering above the head, a wand, cup, sword and pentacle on a low table',
  女祭司:   'a seated veiled faceless figure between two tall pillars, a crescent moon at her feet, a thin veil of pomegranates behind',
  皇后:     'a faceless figure reclining on a throne in a field of wheat, a crown of twelve stars, a heart-shaped shield, a stream flowing past',
  皇帝:     'a faceless figure seated rigidly on a stone throne carved with ram heads, holding an ankh scepter, barren mountains behind',
  教皇:     'a faceless robed figure raised between two pillars with a triple cross staff, two small kneeling silhouettes below, crossed keys at the base',
  恋人:     'two faceless figures standing apart beneath a vast winged silhouette, a tree of flames and a tree with a serpent, sun overhead',
  战车:     'a faceless armored figure standing in a canopied chariot drawn by one pale and one dark sphinx, a walled city far behind',
  力量:     'a faceless figure gently closing the jaws of a lion, a lemniscate above the head, a chain of flowers, calm and unhurried',
  隐士:     'a cloaked faceless figure alone on a mountain peak holding a lantern with a six-pointed star inside, leaning on a staff',
  命运之轮: 'a great wheel inscribed with symbols suspended in the sky, a sphinx on top, a serpent descending one side, a jackal-headed figure rising the other',
  正义:     'a seated faceless figure between pillars, a raised sword in one hand and balanced scales in the other, a square crown',
  倒吊人:   'a faceless figure hanging upside down by one foot from a living T-shaped tree, the other leg crossed, a soft halo around the head',
  死亡:     'a skeletal armored rider on a pale horse carrying a black banner with a white rose, a river and a distant sunrise between two towers',
  节制:     'a winged faceless figure with one foot in water and one on land, pouring liquid between two cups in an impossible arc, a path to a distant crown of light',
  恶魔:     'a horned winged figure crouched on a black cube, an inverted pentagram above, two small chained figures below, torch pointing down',
  高塔:     'a tall tower on a crag struck by a bolt of lightning, its crown blown off, two faceless figures falling, flames in the shape of falling drops',
  星星:     'a kneeling faceless figure pouring water from two jugs onto land and pool, one large eight-pointed star and seven small ones overhead, an ibis in a tree',
  月亮:     'a full moon with a crescent face dripping light, a path between two towers, a dog and a wolf howling, a crayfish emerging from a pool',
  太阳:     'a radiant sun with straight and wavy rays, a small faceless child riding a white horse, sunflowers along a wall, a red banner',
  审判:     'a winged figure blowing a trumpet from the clouds, faceless figures rising from open coffins with arms lifted, mountains and sea below',
  世界:     'a dancing faceless figure inside an oval laurel wreath holding two wands, the four living creatures in the corners: angel, eagle, lion, bull',
};

/** 小阿卡纳：花色语义 + 点数场景 */
const SUIT_OBJECT: Record<string, string> = {
  权杖: 'wooden wands sprouting small leaves',
  圣杯: 'chalices',
  宝剑: 'swords',
  星币: 'pentacle coins',
};

const PIP_SCENES: Record<string, Record<number, string>> = {
  权杖: {
    1: 'a single hand emerging from a cloud gripping a sprouting wand over a river valley',
    2: 'a faceless figure on a battlement holding a globe, one wand in hand and one mounted, looking out to sea',
    3: 'a faceless figure seen from behind on a cliff watching ships, three wands planted around them',
    4: 'four wands forming a garland-draped gateway, small celebrating silhouettes and a castle behind',
    5: 'five faceless youths clashing wands in a chaotic mock battle',
    6: 'a laurel-crowned faceless rider on a horse in procession, wand raised with a wreath, followers with wands',
    7: 'a faceless figure on high ground defending with one wand against six rising from below',
    8: 'eight wands flying in parallel through open sky above a river and hills',
    9: 'a bandaged faceless figure leaning on one wand, eight more standing as a fence behind',
    10: 'a bent faceless figure carrying ten heavy wands toward a distant town',
  },
  圣杯: {
    1: 'a hand from a cloud holding an overflowing chalice, a dove descending, five streams falling into a lily pond',
    2: 'two faceless figures exchanging cups, a winged lion head over a caduceus between them',
    3: 'three faceless figures in a ring raising cups in celebration, fruit and vines at their feet',
    4: 'a faceless figure seated under a tree arms crossed, three cups before them, a fourth offered by a hand from a cloud',
    5: 'a cloaked faceless figure with head bowed before three spilled cups, two upright cups behind, a bridge and a distant house',
    6: 'a faceless child handing a cup full of flowers to a smaller child in a quiet garden courtyard',
    7: 'a faceless silhouette before seven cups floating in clouds, each holding a different vision: a castle, jewels, a wreath, a dragon, a serpent, a veiled figure, a head',
    8: 'a faceless figure walking away from eight stacked cups toward mountains under an eclipse moon',
    9: 'a satisfied faceless figure seated arms crossed before a curved shelf of nine cups',
    10: 'an arc of ten cups curving across the sky over a faceless couple with arms raised and two dancing children, a house and river below',
  },
  宝剑: {
    1: 'a hand from a cloud gripping an upright sword crowned with a wreath, barren mountains below',
    2: 'a blindfolded seated faceless figure holding two crossed swords, a calm sea and crescent moon behind',
    3: 'a solid pink heart pierced by three orange swords against deep violet storm clouds and vertical rain',
    4: 'a faceless figure lying in repose on a tomb, hands in prayer, three swords on the wall and one beneath',
    5: 'a faceless figure gathering three swords with a smug posture, two dejected figures walking away, two swords on the ground, a stormy sky',
    6: 'a ferryman poling a boat carrying a cloaked faceless figure and child across still water, six swords standing in the bow',
    7: 'a faceless figure tiptoeing away from a camp carrying five swords, two left standing behind',
    8: 'a bound and blindfolded faceless figure standing in shallow water surrounded by eight swords planted in the ground, a castle on a cliff behind',
    9: 'a faceless figure sitting up in bed with face in hands, nine swords hanging horizontally on the dark wall',
    10: 'a prone faceless figure with ten swords in the back, a deep violet sky lifting to a thin orange dawn over still water',
  },
  星币: {
    1: 'a hand from a cloud holding a single large pentacle over a walled garden with an arched gateway',
    2: 'a faceless figure dancing while juggling two pentacles linked by a lemniscate ribbon, ships on rolling waves behind',
    3: 'a faceless craftsman on a bench carving a cathedral arch with three pentacles inscribed, two robed figures holding plans',
    4: 'a faceless figure clutching one pentacle to the chest, one balanced on the head, one under each foot, a city behind',
    5: 'two faceless figures, one on crutches, walking through snow past a lit stained-glass window of five pentacles',
    6: 'a faceless merchant with balanced scales dropping coins to two kneeling figures, six pentacles above',
    7: 'a faceless figure leaning on a hoe gazing at a bush heavy with seven pentacles',
    8: 'a faceless apprentice on a bench carving pentacles, six hung on a post and one at their feet, a town in the distance',
    9: 'a faceless figure in a rich garden with a hooded falcon on the wrist, nine pentacles on the vines, a manor behind',
    10: 'a faceless elder seated with two dogs beneath an arch, a couple and child passing, ten pentacles arranged as the tree of life',
  },
};

/**
 * 宫廷牌：**16 个各自的场景**，不是 4 个模板换道具。
 *
 * ⚠️ 原来是这样的：
 *      侍从: 'a young faceless figure standing in an open landscape, holding up {obj}...'
 *      骑士: 'a faceless armored rider on horseback carrying {obj}...'
 *    四个构图 × 换个道具 = 16 张宫廷牌。实测 w11（权杖侍从）和 c11（圣杯侍从）
 *    出来是同一张图换了个法器：同样的居中站姿、同样的举手、同样的弯月压顶。
 *
 * 现在每一格自己有姿态、环境、以及**人和法器的关系** ——
 * 那个关系才是宫廷牌真正的区别：
 *   侍从 还在看它    骑士 带着它冲    皇后 捧着它    国王 压着它
 * 再乘上花色的性格：权杖是热和动，圣杯是水和静，宝剑是风和冷，星币是土和沉。
 *
 * 注：c11–c14 和 w11–w14 已经按旧模板出过图了。要不要按新场景重出，
 *     是拿「一致性」换「多样性」的选择，留给用户定 —— 这里先把方向写对。
 */
const COURT_SCENES: Record<string, Record<string, string>> = {
  权杖: {
    侍从: 'a young faceless figure on a cracked orange plain, driving the butt of a sprouting wand into the dry ground and leaning on it to peer up at the single green shoot at its tip',
    骑士: 'a faceless armored rider on a rearing horse, sprouting wand held aloft like a torch, the horse plumes and the rider cloak thrown backward by speed, dust kicked into orange arcs',
    皇后: 'a faceless queen seated frontally on a broad throne, one hand resting on a wand planted upright beside her and a sunflower in the other, a small black cat sitting between her feet',
    国王: 'a faceless king seated in profile leaning forward off his throne, both hands on a wand planted hard into the ground, a salamander curled at the throne base, restless rather than still',
  },
  圣杯: {
    侍从: 'a young faceless figure crouched at a shoreline, looking down into a chalice held in both hands as a small fish rises out of it, wet sand reflecting the sky',
    骑士: 'a faceless armored rider on a slowly walking horse fording a shallow stream, a cup held level in both hands so as not to spill it, the calmest of the riders',
    皇后: 'a faceless queen seated on a throne at the water edge, both hands closed around an ornate lidded cup and her head bent over it, water lapping across the base of the throne',
    国王: 'a faceless king seated on a throne that floats upright on a rough sea, cup in one hand and sceptre in the other, a fish leaping and a small ship behind, perfectly still on turbulent water',
  },
  宝剑: {
    侍从: 'a young faceless figure on a windswept ridge gripping a sword point-up in both hands, twisting to look back over one shoulder, hair and cloth streaming sideways in the gale',
    骑士: 'a faceless armored rider at full gallop, sword thrust straight forward, mane and cloak blown flat, shredded storm clouds streaking past behind, the fastest and least careful of the riders',
    皇后: 'a faceless queen seated in strict profile on a high throne above the cloud line, one sword upright in her right hand and her left hand open and extended, having already cut and now listening',
    国王: 'a faceless king seated frontally on a stone throne with sharp squared edges, sword held upright and tilted slightly off vertical, judgment held rather than swung',
  },
  星币: {
    侍从: 'a young faceless figure standing in a freshly ploughed field of orange furrows, holding a single large pentacle up at eye level in both hands and studying its face',
    骑士: 'a faceless armored rider on a heavy motionless draught horse at the edge of a ploughed field, a pentacle resting flat on an open palm, hooves planted, the only rider not moving',
    皇后: 'a faceless queen seated in a walled garden grown up to her shoulders, a pentacle cradled in her lap as though it were alive, a rabbit at her feet',
    国王: 'a faceless king seated on a throne carved with vines and bull heads, one hand laid flat on a pentacle resting on his knee, heavy grape clusters and a distant castle behind',
  },
};

const PIP_CN: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 任一牌名 → 该牌专属场景描述 */
export function sceneFor(name: string): string {
  if (MAJOR_SCENES[name]) return MAJOR_SCENES[name];
  const suit = name.slice(0, 2);
  const rest = name.slice(2);
  const court = COURT_SCENES[suit]?.[rest];
  if (court) return court;
  const pips = PIP_CN[rest];
  const scene = PIP_SCENES[suit]?.[pips];
  return scene ?? `${pips} ${SUIT_OBJECT[suit]} arranged symmetrically`;
}

/** 任一牌名 → 可直接投喂生成器的完整提示词 */
export function promptFor(name: string): string {
  return `${sceneFor(name)}. ${MASTER_STYLE}`;
}
