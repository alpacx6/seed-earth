// dialogue.js
export const SPEAKERS = {
  SYSTEM: { name: "SYSTEM", role: "SIGNAL", avatar: "./avatars/unknown_avatar.png" },
  ROBOT:  { name: "로봇", role: "G-01", avatar: "./avatars/robot_avatar.png" },
};


export const INTRO_DIALOGUE = [
  { speaker: "ROBOT", text: "...삐빗." },
  { speaker: "SYSTEM", text: "다행이다! 일어났구나." },
  { speaker: "ROBOT", text: "...?" },
  { speaker: "SYSTEM", text: "난 너에게 탑재된 AI야." },
  { speaker: "SYSTEM", text: "...일단. 방금 깨어나서 네가 맡은 임무가 기억이 잘 안 날텐데.." },
  { speaker: "ROBOT", text: "곳곳에 남겨진 씨앗을 얻고, 심는다." },
  { speaker: "SYSTEM", text: "오! 맞아. 잘 기억하고 있구나." },
  { speaker: "SYSTEM", text: "하지만 이 상태로 가다간 금방 쓰러질지도 몰라." },
  { speaker: "SYSTEM", text: "그래서 특별히 '특수 카드' 기능을 넣어두었어!" },
  { speaker: "SYSTEM", text: "임무가 시작되면 세 장의 카드가 나타날거야. 그 중 하나를 선택하면 돼!" },
  { speaker: "ROBOT", text: "...확인. + 산소(O₂)가 떨어지면 생존이 위험합니다." },
  { speaker: "SYSTEM", text: "좋아...그럼 가볼까?" },
];

export function stageEnterDialogue(stageIndex, stageName, ruleText){
  const s = stageIndex + 1;
  return [
    { speaker: "SYSTEM", text: `스테이지 ${s} 진입: ${stageName}!` },
    { speaker: "SYSTEM", text: `RULE: ${ruleText}` },
    { speaker: "ROBOT", text: "임무를 시작합니다." },
  ];
}

export const END_DIALOGUE = [
  { speaker: "SYSTEM", text: "Stage 7 CLEAR." },
  { speaker: "SYSTEM", text: "정말 해냈다… 지구가 다시 숨 쉬기 시작했어!" },
  { speaker: "ROBOT", text: "생태 복원 신호 확인. 미션 종료 절차로 이동합니다." },
];
