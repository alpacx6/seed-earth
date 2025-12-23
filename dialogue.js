export const SPEAKERS = {
  "로봇": { role: "UNIT",   color: "#72ffb7", avatar: "avatars/robot_avatar.png" },
  "??":   { role: "SIGNAL", color: "#9db6ff", avatar: "avatars/unknown_avatar.png" },
};

export const INTRO_DIALOGUE = [
  { name:"??", text:"…신호 수신. 복구 시스템 온라인." },
  { name:"??", text:"유닛을 깨운다." },
  { name:"로봇", text:"…기동. 정화 임무를 시작한다." },
];

export const END_DIALOGUE = [
  { name:"??", text:"모든 구역 정화 완료." },
  { name:"로봇", text:"지구 재생 프로토콜을 종료한다." },
];

export function stageEnterDialogue(stageName, ruleText){
  const lines = [
    { name:"??", text:`${stageName} 진입.` },
  ];
  if (ruleText && ruleText.trim() && ruleText !== "추가 규칙 없음"){
    lines.push({ name:"??", text:`규칙: ${ruleText}` });
  } else {
    lines.push({ name:"??", text:"규칙: 추가 규칙 없음" });
  }
  lines.push({ name:"로봇", text:"정화 작업을 시작한다." });
  return lines;
}
