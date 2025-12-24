// dialogue.js
export const SPEAKERS = {
  SYSTEM: { name: "SYSTEM", role: "SIGNAL", avatar: "./avatars/unknown_avatar.png" },
  ROBOT:  { name: "로봇", role: "UNIT-01", avatar: "./avatars/robot_avatar.png" },
  R1:     { name: "연구원1", role: "LAB-01", avatar: "./avatars/researcher1.png" },
  R2:     { name: "연구원2", role: "LAB-02", avatar: "./avatars/researcher2.png" },
};

export const INTRO_DIALOGUE = [
  { speaker: "R1", text: "접속 확인했어! 프로젝트 'Plant Back Earth' 준비 완료~" },
  { speaker: "SYSTEM", text: "목표: 씨앗을 심고 물을 줘서 식물을 성장시키고, 스테이지를 정화하세요." },
  { speaker: "ROBOT", text: "분석 완료. 산소(O₂)가 떨어지면 생존이 위험합니다." },
  { speaker: "R2", text: "각 스테이지 시작에 카드가 떠! 잘 고르면 훨씬 쉬워져." },
];

export function stageEnterDialogue(stageIndex, stageName, ruleText){
  const s = stageIndex + 1;
  return [
    { speaker: "SYSTEM", text: `스테이지 ${s} 진입: ${stageName}` },
    { speaker: "SYSTEM", text: `RULE: ${ruleText}` },
    { speaker: "ROBOT", text: "씨앗을 심고(E) 물을 주면(F) 성장합니다." },
  ];
}

export const END_DIALOGUE = [
  { speaker: "SYSTEM", text: "Stage 7 CLEAR." },
  { speaker: "R1", text: "정말 해냈다… 지구가 다시 숨 쉬기 시작했어!" },
  { speaker: "ROBOT", text: "생태 복원 신호 확인. 미션 종료 절차로 이동합니다." },
];
