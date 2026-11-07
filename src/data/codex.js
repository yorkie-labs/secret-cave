// W5: the codex book (GDD §8.4 도감): its pages and what each entry says.
// Short, kid-friendly words (a good place for the director's own lines).
// Animals show their weakness item; bosses how to beat them. The secret
// pages open with the secret pockets (world/secrets.js) and the purple
// shard after the ending. `core/growth.js codexMilestones` gives a star for
// half of it and for all of it.
import { ENEMIES } from './enemies.js';
import { ITEMS } from './items.js';
import { BOSSES } from './bosses.js';

const A = (id, desc, where) => ({ id, name: ENEMIES[id].name, icon: ENEMIES[id].icon, weak: ENEMIES[id].weakTo, hint: ENEMIES[id].hint, desc, where });
const B = (id, desc, where) => ({ id, name: BOSSES[id].name, icon: BOSSES[id].icon, desc, hint: BOSSES[id].hint, where });
const I = (id, desc) => ({ id, name: ITEMS[id].name, icon: ITEMS[id].icon, desc });

export const SECRET_PAGES = {
  secret1: { name: '토끼굴 비밀 굴', icon: '🌿', where: '이끼 계곡 · 토끼굴 초원', desc: '토끼굴 초원 뒤 이끼 낀 바위 틈. 벽에 옛 글자: "망치를 든 작은 용사가 이 길을 지나갔다."' },
  secret2: { name: '버섯 그늘 비밀 굴', icon: '🍄', where: '버섯 숲', desc: '버섯 숲 구석의 보랏빛 굴. 벽에 옛 글자: "물은 숨은 것을 드러낸다."' },
  secret3: { name: '고드름 비밀 굴', icon: '❄️', where: '얼음 호수 · 고드름 고개', desc: '고드름 고개 옆에 숨은 얼음 굴. 전설의 갑옷이 잠들어 있어요. 벽에 옛 글자: "차가운 곳에도 따뜻한 마음이 있다."' },
  secret4: { name: '유적 너머 비밀 굴', icon: '🏛️', where: '수정의 심장', desc: '옛 유적 뒤의 방. 벽에 옛 글자: "심장의 빛이 꺼지면, 보라 조각이 길을 알려 주리라."' },
  purpleShard: { name: '다음 모험…', icon: '💜', where: '심장의 단', desc: '크리스탈 킹이 잠든 뒤 나타난 작은 보라색 조각. 따뜻하게 빛나며 어딘가를 가리켜요. 다음 모험은 어디일까요?' },
};

export const CODEX_PAGES = [
  {
    id: 'animals', title: '동물', icon: '🐾', entries: [
      A('wolf', '무리 지어 다니는 늑대. 빨간 부채꼴이 보이면 물어요.', '이끼 계곡'),
      A('rabbit', '거리를 두다가 빨간 길을 따라 깡충 돌진해요.', '이끼 계곡'),
      A('fox', '버섯 그늘에 숨어 있다가 가까이 오면 튀어나와요.', '버섯 숲'),
      A('mole', '땅속 흙더미로 다가와서 빨간 원에서 튀어나와요.', '버섯 숲'),
      A('deer', '뿔을 낮추고 길게 돌진해요. 방패로 막으면 뿔이 박혀요!', '얼음 호수'),
      A('bear', '느리지만 힘센 곰. 앞에 빨간 원이 생기면 내려쳐요.', '얼음 호수'),
      A('hare', '하얀 겨울털 눈토끼. 토끼처럼 깡충 돌진해요.', '얼음 호수'),
    ],
  },
  {
    id: 'bosses', title: '대장', icon: '👑', entries: [
      B('rabbitChief', '토끼굴 초원을 지키는 거대한 토끼. 내려찍기·귀 바람·3연속 돌진.', '토끼굴 초원'),
      B('mushroomQueen', '버섯 고리의 여왕. 독 포자와 독구름, 버섯을 불러요.', '버섯 고리'),
      B('iceBear', '얼음 호수의 하얀 곰. 얼음 주먹·떨어지는 얼음·눈보라.', '얼음 곰의 빙판'),
      B('crystalKing', '수정의 심장을 지키는 왕. 레이저를 쓸고, 수정 가시와 동물을 불러요.', '심장의 단'),
    ],
  },
  {
    id: 'items', title: '물건', icon: '🎒', entries: [
      I('hammer', '늘 들고 있는 나무 망치. 세 번 연속으로 맞히면 땅이 울려요.'),
      I('waterGun', '물을 쏴서 밀어내요. 독구름도 씻어 내요.'),
      I('vine', '던지면 동물을 꽁꽁 묶어요. 젖은 동물은 더 오래!'),
      I('mask', '동물인 척! 동물들이 잘 알아채지 못해요.'),
      I('shield', '앞에서 오는 공격을 막아요. 사슴 뿔이 박혀요.'),
      I('herb', '하트 2칸을 채워 줘요. [[4를|🌱 약초 버튼을]] 두 번 누르면 두 개를 한꺼번에!'),
      I('armor', '파란 하트가 빨간 하트보다 먼저 닳아요.'),
      I('necklace', '동굴 입구에서 찾은 황금 목걸이. 수정 문 앞에서 빛나요.'),
    ],
  },
  {
    id: 'secrets', title: '비밀', icon: '✨', entries: Object.entries(SECRET_PAGES).map(([id, p]) => ({ id, ...p })),
  },
];

// every codex entry there is to find (W4: the result screen's 도감 n / N)
export const CODEX_IDS = CODEX_PAGES.flatMap((p) => p.entries.map((e) => e.id));
export const CODEX_ENTRY = Object.fromEntries(CODEX_PAGES.flatMap((p) => p.entries.map((e) => [e.id, { ...e, page: p.id }])));
