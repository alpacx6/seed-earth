// dialogue.js
export const SPEAKERS = {
  "로봇": { role:"UNIT", color:"#65ffb6" },
  "??":   { role:"GUIDE", color:"#9a7bff" },
};

export const INTRO_DIALOGUE = [
  { name:"??", text:"20XX년. 지구는 오염으로 붕괴했고, 인류는 다른 행성으로 떠났다." },
  { name:"??", text:"남은 건… 버려진 로봇과 자재, 그리고 꺼져가던 복구 시스템." },
  { name:"??", text:"…신호 확인. 복구 유닛을 재가동한다." },
  { name:"로봇", text:"…부팅 완료. 주변 환경: 생존 부적합. 목표를 지시하라." },
  { name:"??", text:"좋아. 튜토리얼을 진행할게. 이동(←/→), 점프(Space)." },
  { name:"??", text:"씨앗을 얻고(E로 심기), F로 물을 주면 산소를 회복할 수 있어." },
  { name:"??", text:"산소는 시간이 지나면 줄어들어. 식물로 회복하면서 전진해." },
  { name:"로봇", text:"…임무 수락. 지구 재생 프로토콜을 실행한다." },
];

export function stageEnterDialogue(stageName, ruleText){
  return [
    { name:"??", text:`${stageName} 진입.` },
    { name:"??", text:`주의: ${ruleText}` },
    { name:"로봇", text:"확인. 임무를 계속한다." },
  ];
}

export const END_DIALOGUE = [
  { name:"??", text:"…마지막 구간 정화 완료." },
  { name:"??", text:"아직 멀었지만, 지금 이 순간은 분명히 '희망'이야." },
  { name:"로봇", text:"감지: 미약한 생체 반응… 새싹." },
  { name:"??", text:"좋아. 이제부터가 진짜 시작이겠지." },
];
