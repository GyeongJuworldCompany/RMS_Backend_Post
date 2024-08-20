const mainMsg = ""; // 신고제목 또는 내용
const RFSeq = ""; // 순번(Key value)
const recvHp = ""; // 받을사람 전화번호
const recvName = ""; // 받을사람 이름

const managerHp1 = "070-7113-6349(파트장)";
const managerHp2 = "070-7113-6357(담당)";

const succsubject = "업무 배정 알림(위험성평가관리)";
const succcontent = 
`[경주월드 업무 알림]
위험성 평가 관리 담당자로 지정되었습니다.

아래 진행 순서를 읽은 뒤 '위험요인 확인 및 개선' 버튼을 누르고 절차에 따라 원내 위험요인 개선에 힘써주시기 바랍니다.

업무에 협조해주셔서
대단히 감사합니다.

* 신고내용
${mainMsg}

* 진행 순서
1. 신고자, 관리자가 등록한 내용 확인
2. 개선 계획을 수립하고 개선 예정일 등록
3. 감소 대책 등록 및 진행
4. 완료 후 완료일, 비용, 관련자료(사진/비디오)를 추가하고 페이지 하단의 버튼을 눌러서 최종 완료

* 문의전화 [안전보건실]
- ${managerHp1}
- ${managerHp2}
`;

const formData = new FormData();
formData.append("apikey", "4wqbyu1ntoq5v99k69vbcpu6zni10bbz");
formData.append("userid", "gjwaligo");
formData.append("senderkey", "cd7965755d0b0cb28462a68606a7d59afee4a5b7");
formData.append("tpl_code", "TS_6233");
formData.append("sender", "1544-8765");
//formData.append('senddate', '20240503153900'); 예약발송
formData.append("receiver_1", recvHp);
formData.append("recvname_1", recvName);
formData.append("subject_1", succsubject);
formData.append("message_1", succcontent);
formData.append(
  "button_1",
  JSON.stringify({
    button: [
      {
        name: "위험 요인 확인 및 개선",
        linkType: "WL", // AC, DS, WL, AL, BK, MD 중에서 1개
        linkTypeName: "웹링크", // 채널 추가, 배송조회, 웹링크, 앱링크, 봇키워드, 메시지전달 중에서 1개
        linkMo:
          "https://smart.gjw.co.kr/common/riskFactor001.do?RFSeq=" + RFSeq,
        linkPc:
          "https://smart.gjw.co.kr/common/riskFactor001.do?RFSeq=" + RFSeq,
        //linkIos: '설정한 IOS Scheme',
        //linkAnd: '설정한 Android Scheme'
      },
    ],
  })
);
formData.append("failover", "Y");

const failsubject = `[경주월드 업무 알림]`;
const failcontent = `위험성 평가 관리 담당자로 지정되었습니다.

아래 진행 순서를 읽은 뒤 '위험요인 확인 및 개선' 버튼을 누르고 절차에 따라 원내 위험요인 개선에 힘써주시기 바랍니다.

업무에 협조해주셔서
대단히 감사합니다.

* 신고내용
${mainMsg}

* 진행 순서
1. 신고자, 관리자가 등록한 내용 확인
2. 개선 계획을 수립하고 개선 예정일 등록
3. 감소 대책 등록 및 진행
4. 완료 후 완료일, 비용, 관련자료(사진/비디오)를 추가하고 페이지 하단의 버튼을 눌러서 최종 완료

* 관리 페이지 URL
https://smart.gjw.co.kr/common/riskFactor001.do?RFSeq=${RFSeq}

* 문의전화 [안전보건실]
- ${managerHp1}
- ${managerHp2}
`;

formData.append("fsubject_1", failsubject);
formData.append("fmessage_1", failcontent);

axios
  .post("https://kakaoapi.aligo.in/akv10/alimtalk/send/", formData)
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error(error);
  });
