/**
 * RuleEngine for ADVM and EWSV Raw Data Diagnostic Monitoring
 * Converted from ADVM_EWSV_통합_모니터링_프로그램_V3.xlsm (VBA Engine)
 */

const ADVM_TARGETS = [
  {
    "no": 1,
    "basin": "한강",
    "name": "영월군(영월대교)",
    "code": "1001590",
    "method": "ADVM",
    "memo": "실제 ADVM 대상 지점목록으로 교체"
  },
  {
    "no": 2,
    "basin": "한강",
    "name": "단양군(북벽교)",
    "code": "1003532",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 3,
    "basin": "한강",
    "name": "원주시(남한강대교)",
    "code": "1005597",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 4,
    "basin": "한강",
    "name": "원주시(지정대교)",
    "code": "1006580",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 5,
    "basin": "한강",
    "name": "여주시(남한강교)",
    "code": "1007525",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 6,
    "basin": "한강",
    "name": "여주시(여주대교)",
    "code": "1007535",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 7,
    "basin": "한강",
    "name": "여주보(하류)",
    "code": "1007541",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 8,
    "basin": "한강",
    "name": "이포보(상류)",
    "code": "1007562",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 9,
    "basin": "한강",
    "name": "양평군(양평교)",
    "code": "1007585",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 10,
    "basin": "한강",
    "name": "서울시(광진교)",
    "code": "1018540",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 11,
    "basin": "한강",
    "name": "서울시(대곡교)",
    "code": "1018555",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 12,
    "basin": "한강",
    "name": "서울시(한강대교)",
    "code": "1018583",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 13,
    "basin": "한강",
    "name": "파주시(비룡대교)",
    "code": "1023560",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 14,
    "basin": "한강",
    "name": "평택시(군문교)",
    "code": "1101535",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 15,
    "basin": "한강",
    "name": "평택시(동연교)",
    "code": "1101570",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 16,
    "basin": "한강",
    "name": "평택시(팽성대교)",
    "code": "1101580",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 17,
    "basin": "낙동강",
    "name": "예천군(신예천교)",
    "code": "2004568",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 18,
    "basin": "낙동강",
    "name": "예천군(상풍교)",
    "code": "2007560",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 19,
    "basin": "낙동강",
    "name": "상주시(강창교)",
    "code": "2007586",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 20,
    "basin": "낙동강",
    "name": "의성군(낙단교)",
    "code": "2009520",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 21,
    "basin": "낙동강",
    "name": "구미시(일선교)",
    "code": "2009570",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 22,
    "basin": "낙동강",
    "name": "구미시(구미대교)",
    "code": "2011540",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 23,
    "basin": "낙동강",
    "name": "칠곡군(호국의다리)",
    "code": "2011550",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 24,
    "basin": "낙동강",
    "name": "성주군(성주대교)",
    "code": "2011560",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 25,
    "basin": "낙동강",
    "name": "대구시(신암동)",
    "code": "2012560",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 26,
    "basin": "낙동강",
    "name": "대구시(강창교)",
    "code": "2012595",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 27,
    "basin": "낙동강",
    "name": "고령군(도진교)",
    "code": "2013590",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 28,
    "basin": "낙동강",
    "name": "고령군(고령교)",
    "code": "2014540",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 29,
    "basin": "낙동강",
    "name": "대구시(성하리)",
    "code": "2014560",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 30,
    "basin": "낙동강",
    "name": "합천군(율지교)",
    "code": "2014590",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 31,
    "basin": "낙동강",
    "name": "합천군(적포교)",
    "code": "2017520",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 32,
    "basin": "낙동강",
    "name": "산청군(묵곡교)",
    "code": "2018574",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 33,
    "basin": "낙동강",
    "name": "함안군(송도교)",
    "code": "2019520",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 34,
    "basin": "낙동강",
    "name": "의령군(정암교)",
    "code": "2019555",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 35,
    "basin": "낙동강",
    "name": "함안군(계내리)",
    "code": "2020515",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 36,
    "basin": "낙동강",
    "name": "창녕군(청암리)",
    "code": "2020550",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 37,
    "basin": "낙동강",
    "name": "밀양시(용평동)",
    "code": "2021575",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 38,
    "basin": "낙동강",
    "name": "밀양시(삼랑진교)",
    "code": "2022510",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 39,
    "basin": "낙동강",
    "name": "부산시(대동낙동강교)",
    "code": "2022578",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 40,
    "basin": "낙동강",
    "name": "부산시(구포대교)",
    "code": "2022580",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 41,
    "basin": "낙동강",
    "name": "경주시(강동대교)",
    "code": "2101575",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 42,
    "basin": "낙동강",
    "name": "포항시(형산교)",
    "code": "2101590",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 43,
    "basin": "낙동강",
    "name": "울산시(태화교)",
    "code": "2201570",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 44,
    "basin": "낙동강",
    "name": "부산시(원동교)",
    "code": "2302550",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 45,
    "basin": "낙동강",
    "name": "영덕군(영덕대교)",
    "code": "2402530",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 46,
    "basin": "금강",
    "name": "옥천군(구금강2교)",
    "code": "3006590",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 47,
    "basin": "금강",
    "name": "대전시(신구교)",
    "code": "3009593",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 48,
    "basin": "금강",
    "name": "세종시(명학리)",
    "code": "3010560",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 49,
    "basin": "금강",
    "name": "세종시(월산교)",
    "code": "3011595",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 50,
    "basin": "금강",
    "name": "세종시(햇무리교)",
    "code": "3012502",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 51,
    "basin": "금강",
    "name": "공주시(금강교)",
    "code": "3012520",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 52,
    "basin": "금강",
    "name": "청양군(신흥리)",
    "code": "3012550",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 53,
    "basin": "금강",
    "name": "청양군(백제보 상)",
    "code": "3012562",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 54,
    "basin": "금강",
    "name": "부여군(백제교)",
    "code": "3012575",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 55,
    "basin": "금강",
    "name": "논산시(동성교)",
    "code": "3012590",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 56,
    "basin": "금강",
    "name": "논산시(황산대교)",
    "code": "3014510",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 57,
    "basin": "금강",
    "name": "예산군(구만교)",
    "code": "3101545",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 58,
    "basin": "금강",
    "name": "당진시(구양교)",
    "code": "3101550",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 59,
    "basin": "금강",
    "name": "아산시(충무교)",
    "code": "3101585",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 60,
    "basin": "영산강",
    "name": "완주군(어우교)",
    "code": "3301527",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 61,
    "basin": "영산강",
    "name": "완주군(삼례교)",
    "code": "3301570",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 62,
    "basin": "영산강",
    "name": "정읍시(정우교)",
    "code": "3302530",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 63,
    "basin": "영산강",
    "name": "남원시(동림교)",
    "code": "4005570",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 64,
    "basin": "영산강",
    "name": "곡성군(예성교)",
    "code": "4006580",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 65,
    "basin": "영산강",
    "name": "구례군(구례교)",
    "code": "4009510",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 66,
    "basin": "영산강",
    "name": "광양시(고사리)",
    "code": "4009550",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 67,
    "basin": "영산강",
    "name": "하동군(읍내리)",
    "code": "4009565",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 68,
    "basin": "영산강",
    "name": "광주광역시(극락교)",
    "code": "5001580",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 69,
    "basin": "영산강",
    "name": "장성군(제2황룡교)",
    "code": "5002550",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 70,
    "basin": "영산강",
    "name": "나주시(남평교)",
    "code": "5003580",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 71,
    "basin": "영산강",
    "name": "광주광역시(승용교)",
    "code": "5004520",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 72,
    "basin": "영산강",
    "name": "나주시(나주대교)",
    "code": "5004550",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 73,
    "basin": "영산강",
    "name": "나주시(회진리)",
    "code": "5004590",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 74,
    "basin": "영산강",
    "name": "함평군(동강교)",
    "code": "5006510",
    "method": "ADVM",
    "memo": ""
  },
  {
    "no": 75,
    "basin": "영산강",
    "name": "함평군(학야교)",
    "code": "5006530",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 76,
    "basin": "영산강",
    "name": "영암군(동암교)",
    "code": "5008510",
    "method": "ADVM",
    "memo": ""
  }
];

const EWSV_TARGETS = [
  {
    "no": 1,
    "basin": "한강",
    "name": "정선군(남평대교)",
    "code": "1001529",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 2,
    "basin": "한강",
    "name": "정선군(와평교)",
    "code": "1001545",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 3,
    "basin": "한강",
    "name": "정선군(정선제1교)",
    "code": "1001555",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 4,
    "basin": "한강",
    "name": "평창군(사초교)",
    "code": "1002535",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 5,
    "basin": "한강",
    "name": "평창군(평창교)",
    "code": "1002550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 6,
    "basin": "한강",
    "name": "영월군(주천교)",
    "code": "1002585",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 7,
    "basin": "한강",
    "name": "영월군(팔괴교)",
    "code": "1002598",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 8,
    "basin": "한강",
    "name": "단양군(단양1교)",
    "code": "1003545",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 9,
    "basin": "한강",
    "name": "제천시(부수동교)",
    "code": "1003558",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 10,
    "basin": "한강",
    "name": "괴산군(목도교)",
    "code": "1004593",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 11,
    "basin": "한강",
    "name": "충주시(국원대교)",
    "code": "1004595",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 12,
    "basin": "한강",
    "name": "원주시(원주교)",
    "code": "1006565",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 13,
    "basin": "한강",
    "name": "원주시(문막교)",
    "code": "1006590",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 14,
    "basin": "한강",
    "name": "대신양수장",
    "code": "1007501",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 15,
    "basin": "한강",
    "name": "능서1양수장",
    "code": "1007502",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 16,
    "basin": "한강",
    "name": "음성군(총천교)",
    "code": "1007510",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 17,
    "basin": "한강",
    "name": "여주시(원부교)",
    "code": "1007515",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 18,
    "basin": "한강",
    "name": "여주시(율극교)",
    "code": "1007540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 19,
    "basin": "한강",
    "name": "인제군(왕성동교)",
    "code": "1012530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 20,
    "basin": "한강",
    "name": "인제군(현리교)",
    "code": "1012540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 21,
    "basin": "한강",
    "name": "가평군(가평교)",
    "code": "1013555",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 22,
    "basin": "한강",
    "name": "홍천군(홍천교)",
    "code": "1014550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 23,
    "basin": "한강",
    "name": "가평군(대보교)",
    "code": "1015520",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 24,
    "basin": "한강",
    "name": "서울시(대곡교)",
    "code": "1018555",
    "method": "ADVM/EWSV",
    "memo": "이중화 추진 중, EWSV 파일 수신 중(유속계 미설치)"
  },
  {
    "no": 25,
    "basin": "한강",
    "name": "서울시(중랑교)",
    "code": "1018575",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 26,
    "basin": "한강",
    "name": "서울시(너부대교)",
    "code": "1018595",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 27,
    "basin": "한강",
    "name": "서울시(오금교)",
    "code": "1018597",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 28,
    "basin": "한강",
    "name": "서울시(신대방1교)",
    "code": "1018598",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 29,
    "basin": "한강",
    "name": "고양시(원당교)",
    "code": "1019567",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 30,
    "basin": "한강",
    "name": "연천군(필승교)",
    "code": "1021550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 31,
    "basin": "한강",
    "name": "연천군(임진교)",
    "code": "1021580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 32,
    "basin": "한강",
    "name": "포천시(포천대교)",
    "code": "1022547",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 33,
    "basin": "한강",
    "name": "연천군(차탄교)",
    "code": "1022562",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 34,
    "basin": "한강",
    "name": "연천군(신천교)",
    "code": "1022570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 35,
    "basin": "한강",
    "name": "연천군(사랑교)",
    "code": "1022580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 36,
    "basin": "한강",
    "name": "파주시(통일대교)",
    "code": "1023570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 37,
    "basin": "한강",
    "name": "오산시(탑동대교)",
    "code": "1101545",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 38,
    "basin": "한강",
    "name": "강릉시(회산교)",
    "code": "1302548",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 39,
    "basin": "낙동강",
    "name": "태백시(문화교)",
    "code": "2001510",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 40,
    "basin": "낙동강",
    "name": "예천군(구담교)",
    "code": "2003570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 41,
    "basin": "낙동강",
    "name": "예천군(신예천교)",
    "code": "2004568",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 42,
    "basin": "낙동강",
    "name": "예천군(회룡교)",
    "code": "2004580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 43,
    "basin": "낙동강",
    "name": "예천군(산양교)",
    "code": "2004595",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 44,
    "basin": "낙동강",
    "name": "문경시(김용리)",
    "code": "2005560",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 45,
    "basin": "낙동강",
    "name": "상주시(후천교)",
    "code": "2006565",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 46,
    "basin": "낙동강",
    "name": "의성군(장송교)",
    "code": "2008533",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 47,
    "basin": "낙동강",
    "name": "군위군(무성리)",
    "code": "2008550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 48,
    "basin": "낙동강",
    "name": "김천시(김천교)",
    "code": "2010550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 49,
    "basin": "낙동강",
    "name": "구미시(양포교)",
    "code": "2011525",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 50,
    "basin": "낙동강",
    "name": "영천시(영동교)",
    "code": "2012528",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 51,
    "basin": "낙동강",
    "name": "영천시(금창교)",
    "code": "2012540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 52,
    "basin": "낙동강",
    "name": "고령군(귀원교)",
    "code": "2013540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 53,
    "basin": "낙동강",
    "name": "고령군(회천교)",
    "code": "2013550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 54,
    "basin": "낙동강",
    "name": "합천군(황강교)",
    "code": "2016580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 55,
    "basin": "낙동강",
    "name": "함양군(안의교)",
    "code": "2018509",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 56,
    "basin": "낙동강",
    "name": "함안군(서촌리)",
    "code": "2019580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 57,
    "basin": "낙동강",
    "name": "청도군(원리)",
    "code": "2021540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 58,
    "basin": "낙동강",
    "name": "밀양시(용평동)",
    "code": "2021575",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 59,
    "basin": "낙동강",
    "name": "김해시(정천교)",
    "code": "2022585",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 60,
    "basin": "낙동강",
    "name": "울산시(사연교)",
    "code": "2201530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 61,
    "basin": "낙동강",
    "name": "울산시(병영교)",
    "code": "2201590",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 62,
    "basin": "낙동강",
    "name": "울산시(덕신교)",
    "code": "2301570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 63,
    "basin": "낙동강",
    "name": "부산시(원동교)",
    "code": "2302550",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 64,
    "basin": "낙동강",
    "name": "울진군(월변교)",
    "code": "2401516",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 65,
    "basin": "낙동강",
    "name": "영덕군(영덕대교)",
    "code": "2402530",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 66,
    "basin": "낙동강",
    "name": "포항시(문덕3교)",
    "code": "2403520",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 67,
    "basin": "금강",
    "name": "장수군(운곡교)",
    "code": "3001505",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 68,
    "basin": "금강",
    "name": "무주군(취수장)",
    "code": "3003580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 69,
    "basin": "금강",
    "name": "금산군(제원대교)",
    "code": "3004540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 70,
    "basin": "금강",
    "name": "영동군(초강교)",
    "code": "3004585",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 71,
    "basin": "금강",
    "name": "영동군(양강교)",
    "code": "3004590",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 72,
    "basin": "금강",
    "name": "옥천군(구금강2교)",
    "code": "3006590",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 73,
    "basin": "금강",
    "name": "옥천군(옥각교)",
    "code": "3008530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 74,
    "basin": "금강",
    "name": "금산군(제원교)",
    "code": "3008570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 75,
    "basin": "금강",
    "name": "대전시(복수교)",
    "code": "3009530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 76,
    "basin": "금강",
    "name": "대전시(원촌교)",
    "code": "3009580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 77,
    "basin": "금강",
    "name": "청주시(흥덕교)",
    "code": "3011545",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 78,
    "basin": "금강",
    "name": "청주시(미호강교)",
    "code": "3011565",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 79,
    "basin": "금강",
    "name": "세종시(도암교)",
    "code": "3012507",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 80,
    "basin": "금강",
    "name": "공주시(오인교)",
    "code": "3012525",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 81,
    "basin": "금강",
    "name": "부여군(석동교)",
    "code": "3012580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 82,
    "basin": "금강",
    "name": "논산시(동성교)",
    "code": "3012590",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 83,
    "basin": "금강",
    "name": "논산시(풋개다리)",
    "code": "3013565",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 84,
    "basin": "금강",
    "name": "논산시(논산대교)",
    "code": "3013570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 85,
    "basin": "금강",
    "name": "예산군(구만교)",
    "code": "3101545",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 86,
    "basin": "금강",
    "name": "당진시(채운교)",
    "code": "3201590",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 87,
    "basin": "영산강",
    "name": "완주군(용봉교)",
    "code": "3301530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 88,
    "basin": "영산강",
    "name": "완주군(제2소양교)",
    "code": "3301540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 89,
    "basin": "영산강",
    "name": "전주시(세내교)",
    "code": "3301554",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 90,
    "basin": "영산강",
    "name": "전주시(서천교)",
    "code": "3301557",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 91,
    "basin": "영산강",
    "name": "전주시(미산교)",
    "code": "3301565",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 92,
    "basin": "영산강",
    "name": "정읍시(거산교)",
    "code": "3302520",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 93,
    "basin": "영산강",
    "name": "정읍시(죽림교)",
    "code": "3302545",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 94,
    "basin": "영산강",
    "name": "임실군(일중리)",
    "code": "4002540",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 95,
    "basin": "영산강",
    "name": "임실군(신기교)",
    "code": "4003550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 96,
    "basin": "영산강",
    "name": "곡성군(금곡교)",
    "code": "4004590",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 97,
    "basin": "영산강",
    "name": "남원시(월석교)",
    "code": "4005545",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 98,
    "basin": "영산강",
    "name": "곡성군(태안교)",
    "code": "4008570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 99,
    "basin": "영산강",
    "name": "구례군(구례교)",
    "code": "4009510",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 100,
    "basin": "영산강",
    "name": "구례군(송정리)",
    "code": "4009530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 101,
    "basin": "영산강",
    "name": "하동군(대석교)",
    "code": "4009570",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 102,
    "basin": "영산강",
    "name": "광양시(서산교)",
    "code": "4105530",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 103,
    "basin": "영산강",
    "name": "광주광역시(유촌교)",
    "code": "5001550",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 104,
    "basin": "영산강",
    "name": "광주광역시(풍영정천2교)",
    "code": "5001555",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 105,
    "basin": "영산강",
    "name": "장성군(제2황룡교)",
    "code": "5002550",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 106,
    "basin": "영산강",
    "name": "광주광역시(평림교)",
    "code": "5002577",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 107,
    "basin": "영산강",
    "name": "광주광역시(장록교)",
    "code": "5002590",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 108,
    "basin": "영산강",
    "name": "나주시(동곡리)",
    "code": "5004555",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 109,
    "basin": "영산강",
    "name": "함평군(원고막교)",
    "code": "5005580",
    "method": "EWSV",
    "memo": ""
  },
  {
    "no": 110,
    "basin": "영산강",
    "name": "함평군(학야교)",
    "code": "5006530",
    "method": "ADVM/EWSV",
    "memo": ""
  },
  {
    "no": 111,
    "basin": "영산강",
    "name": "장흥군(별천교)",
    "code": "5101550",
    "method": "EWSV",
    "memo": ""
  }
];

const WIND_EXCLUDED_STATIONS = new Set([
  "영월군(영월대교)", "영월군(팔괴교)", "단양군(북벽교)", "원주시(남한강대교)",
  "원주시(지정대교)", "대신양수장", "능서1양수장", "여주시(남한강교)",
  "여주시(여주대교)", "여주보(하류)", "이포보(상류)", "양평군(양평교)",
  "서울시(광진교)", "서울시(대곡교)", "서울시(한강대교)", "서울시(신대방1교)",
  "파주시(비룡대교)", "파주시(통일대교)", "평택시(군문교)", "평택시(동연교)",
  "평택시(팽성대교)", "예천군(회룡교)", "예천군(상풍교)", "상주시(강창교)",
  "의성군(낙단교)", "구미시(일선교)", "구미시(구미대교)", "칠곡군(호국의다리)",
  "성주군(성주대교)", "대구시(신암동)", "대구시(강창교)", "고령군(도진교)",
  "고령군(고령교)", "대구시(성하리)", "합천군(율지교)", "합천군(적포교)",
  "산청군(묵곡교)", "함안군(송도교)", "의령군(정암교)", "함안군(계내리)",
  "창녕군(청암리)", "밀양시(삼랑진교)", "부산시(대동낙동강교)", "부산시(구포대교)",
  "경주시(강동대교)", "포항시(형산교)", "울산시(태화교)", "무주군(취수장)",
  "대전시(신구교)", "세종시(명학리)", "세종시(월산교)", "세종시(햇무리교)",
  "공주시(금강교)", "청양군(신흥리)", "청양군(백제보 상)", "부여군(백제교)",
  "논산시(황산대교)", "당진시(구양교)", "아산시(충무교)", "완주군(어우교)",
  "완주군(삼례교)", "정읍시(정우교)", "남원시(동림교)", "곡성군(예성교)",
  "광양시(고사리)", "하동군(읍내리)", "광주광역시(극락교)", "나주시(남평교)",
  "광주광역시(승용교)", "나주시(나주대교)", "나주시(회진리)", "함평군(동강교)",
  "영암군(동암교)"
]);

const VTH_EXCLUDED_STATIONS = new Set(["능서1양수장", "대신양수장"]);

function isBlankOrZero(val) {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  if (s === "" || s === "null" || s === "undefined") return true;
  const num = Number(s);
  return !isNaN(num) && num === 0;
}

function parseCsvLine(line) {
  if (!line) return [];
  return line.split(",").map(s => s.trim());
}

/**
 * Parses ADVM ASCII file content.
 */
function parseAdvmContent(rawText) {
  if (!rawText) return null;
  const lines = rawText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = parseCsvLine(lines[0]);
  const values = parseCsvLine(lines[1]);
  if (values.length < 14) return null;

  const res = {
    stCode: values[0],
    targetDT: values[1],
    deciAll: values[2],
    deciVTH: values[3],
    ac: parseFloat(values[4]),
    dcCharge: parseFloat(values[5]),
    dcBattery: parseFloat(values[6]),
    tempSys: parseFloat(values[7]),
    hrSys: parseFloat(values[8]),
    deciWL: values[9],
    waterDepth: parseFloat(values[10]),
    waterLevel: parseFloat(values[11]),
    wlOffset: parseFloat(values[12]),
    salinity: parseFloat(values[13]),
    advmSensors: [],
    rawValues: values
  };

  let idx = 14;
  let sensorSeq = 1;
  while (idx <= values.length - 12) {
    const wn = parseInt(values[idx + 6], 10) || 0;
    const advm = {
      sensorSeq: sensorSeq++,
      noAdvm: values[idx],
      deciAdvm: values[idx + 1],
      tempWater: parseFloat(values[idx + 2]),
      depthAdvm: parseFloat(values[idx + 3]),
      pitch: parseFloat(values[idx + 4]),
      roll: parseFloat(values[idx + 5]),
      wn: wn,
      ws: parseFloat(values[idx + 7]),
      wp: parseFloat(values[idx + 8]),
      wf: parseFloat(values[idx + 9]),
      dis1: parseFloat(values[idx + 10]),
      dis2: parseFloat(values[idx + 11]),
      cells: []
    };

    let cellStart = idx + 12;
    for (let c = 0; c < wn; c++) {
      const cIdx = cellStart + c * 5;
      if (cIdx + 4 < values.length) {
        advm.cells.push({
          noCell: parseInt(values[cIdx], 10) || (c + 1),
          vEW: parseFloat(values[cIdx + 1]),
          vNS: parseFloat(values[cIdx + 2]),
          e1: parseFloat(values[cIdx + 3]),
          e2: parseFloat(values[cIdx + 4])
        });
      }
    }

    res.advmSensors.push(advm);
    idx = cellStart + wn * 5;
  }

  return res;
}

/**
 * Parses EWSV ASCII file content.
 */
function parseEwsvContent(rawText) {
  if (!rawText) return null;
  const lines = rawText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = parseCsvLine(lines[0]);
  const values = parseCsvLine(lines[1]);
  if (values.length < 28) return null;

  const res = {
    stCode: values[0],
    targetDT: values[1],
    deciAll: values[2],
    deciVTH: values[3],
    ac: parseFloat(values[4]),
    dcCharge: parseFloat(values[5]),
    dcBattery: parseFloat(values[6]),
    tempSys: parseFloat(values[7]),
    hrSys: parseFloat(values[8]),
    deciWL: values[9],
    waterLevel: parseFloat(values[10]),
    waterDepth: parseFloat(values[11]),
    wlOffset: parseFloat(values[12]),
    salinity: parseFloat(values[13]),
    deciWind: values[14],
    windDegree: parseFloat(values[15]),
    wind: parseFloat(values[16]),
    windTemp: parseFloat(values[17]),
    windH: parseFloat(values[18]),
    windAtmos: parseFloat(values[19]),
    deciEwsv: values[20],
    ewsvKind: values[21],
    ewsvLvAvg: parseFloat(values[22]),
    ewsvVAvg: parseFloat(values[23]),
    ewsvLqTotal: parseFloat(values[24]),
    ewsvQTotal: parseFloat(values[25]),
    ewsvCnt: parseInt(values[26], 10) || 0,
    ewsvFlag: values[27],
    sensors: [],
    rawValues: values
  };

  const sensorFieldCount = 8;
  let sensorSeq = 1;
  for (let i = 28; i <= values.length - sensorFieldCount; i += sensorFieldCount) {
    res.sensors.push({
      sensorSeq: sensorSeq++,
      ewsvNo: values[i],
      ewsvLv: parseFloat(values[i + 1]),
      ewsvV: parseFloat(values[i + 2]),
      ewsvLq: parseFloat(values[i + 3]),
      ewsvQ: parseFloat(values[i + 4]),
      ewsvDeg: parseFloat(values[i + 5]),
      ewsvSnr: parseFloat(values[i + 6]),
      ewsvCheck: values[i + 7]
    });
  }

  return res;
}

class RuleEngine {
  constructor() {
    this.advmTargets = ADVM_TARGETS;
    this.ewsvTargets = EWSV_TARGETS;
    this.allTargets = [...ADVM_TARGETS, ...EWSV_TARGETS];
  }

  getTargetStations() {
    return this.allTargets;
  }

  /**
   * Evaluates all target stations against SFTP raw files and updates continuous issue counts.
   */
  evaluateAll(targetDT, advmFileMap = {}, ewsvFileMap = {}, prevIssueStateMap = {}) {
    const issues = [];
    const stationIssuesMap = {};
    const latestMetricsMap = {};
    const nextIssueStateMap = {};

    let receivedCount = 0;
    const totalTarget = this.allTargets.length;

    // 1. Evaluate ADVM Stations
    for (const target of this.advmTargets) {
      const code = target.code;
      const fileEntry = advmFileMap[code];
      const parsed = fileEntry ? parseAdvmContent(fileEntry.content) : null;

      if (parsed) {
        receivedCount++;
        latestMetricsMap[code] = {
          waterLevel: parsed.waterLevel,
          waterDepth: parsed.waterDepth,
          velocity: parsed.advmSensors?.[0]?.cells?.[0]?.vEW ?? 0,
          snr: parsed.advmSensors?.[0]?.cells?.[0]?.e1 ?? 0,
          ac: parsed.ac,
          dcCharge: parsed.dcCharge,
          dcBattery: parsed.dcBattery,
          tempSys: parsed.tempSys,
          hrSys: parsed.hrSys,
          pitch: parsed.advmSensors?.[0]?.pitch ?? 0,
          roll: parsed.advmSensors?.[0]?.roll ?? 0,
          timestamp: parsed.targetDT || targetDT
        };
      }

      const stIssues = this.evaluateAdvmStation(target, parsed, targetDT);
      for (const iss of stIssues) {
        const issueKey = `${iss.stCode}_${iss.sensorNo}_${iss.ruleId}`;
        const prev = prevIssueStateMap[issueKey];

        if (prev) {
          iss.statusType = "ongoing";
          iss.statusLabel = "지속";
          iss.continuousCount = (prev.continuousCount || 1) + 1;
        } else {
          iss.statusType = "new";
          iss.statusLabel = "신규";
          iss.continuousCount = 1;
        }

        nextIssueStateMap[issueKey] = {
          continuousCount: iss.continuousCount,
          lastSeenTargetDT: targetDT
        };

        issues.push(iss);
        if (!stationIssuesMap[code]) stationIssuesMap[code] = [];
        stationIssuesMap[code].push(iss);
      }
    }

    // 2. Evaluate EWSV Stations
    for (const target of this.ewsvTargets) {
      const code = target.code;
      const fileEntry = ewsvFileMap[code];
      const parsed = fileEntry ? parseEwsvContent(fileEntry.content) : null;

      if (parsed) {
        receivedCount++;
        latestMetricsMap[code] = {
          waterLevel: parsed.waterLevel,
          waterDepth: parsed.waterDepth,
          velocity: parsed.ewsvVAvg ?? 0,
          snr: parsed.sensors?.[0]?.ewsvSnr ?? 0,
          windSpeed: parsed.wind ?? 0,
          windDegree: parsed.windDegree ?? 0,
          ac: parsed.ac,
          dcCharge: parsed.dcCharge,
          dcBattery: parsed.dcBattery,
          tempSys: parsed.tempSys,
          hrSys: parsed.hrSys,
          timestamp: parsed.targetDT || targetDT
        };
      }

      const stIssues = this.evaluateEwsvStation(target, parsed, targetDT);
      for (const iss of stIssues) {
        const issueKey = `${iss.stCode}_${iss.sensorNo}_${iss.ruleId}`;
        const prev = prevIssueStateMap[issueKey];

        if (prev) {
          iss.statusType = "ongoing";
          iss.statusLabel = "지속";
          iss.continuousCount = (prev.continuousCount || 1) + 1;
        } else {
          iss.statusType = "new";
          iss.statusLabel = "신규";
          iss.continuousCount = 1;
        }

        nextIssueStateMap[issueKey] = {
          continuousCount: iss.continuousCount,
          lastSeenTargetDT: targetDT
        };

        issues.push(iss);
        if (!stationIssuesMap[code]) stationIssuesMap[code] = [];
        stationIssuesMap[code].push(iss);
      }
    }

    // 3. Count summary statistics
    let newCount = 0;
    let ongoingCount = 0;
    for (const iss of issues) {
      if (iss.statusType === "new") newCount++;
      else if (iss.statusType === "ongoing") ongoingCount++;
    }

    const actionRequiredStations = Object.keys(stationIssuesMap).length;
    const normalStations = Math.max(0, totalTarget - actionRequiredStations);
    const rxRate = totalTarget > 0 ? Number(((receivedCount / totalTarget) * 100).toFixed(1)) : 0;

    const summary = {
      totalTarget,
      received: receivedCount,
      newCount,
      ongoingCount,
      reopenedCount: 0,
      resolvedCount: 0,
      actionRequired: actionRequiredStations,
      actionRequiredStations,
      totalIssuesCount: issues.length,
      normalStations,
      rxRate
    };

    return {
      targetDT,
      summary,
      issues,
      stationIssuesMap,
      latestMetricsMap,
      nextIssueStateMap
    };
  }

  evaluateAdvmStation(target, p, targetDT) {
    const list = [];
    const { code, name, basin, method } = target;

    // Rule 1: 미수신
    if (!p) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R01", problem: "자료 미수신",
        detail: "대상일시의 원시자료가 SFTP 서버에서 수신되지 않았습니다."
      });
      return list;
    }

    // Rule 2: VTH 결측
    const vthAllZero = isBlankOrZero(p.ac) && isBlankOrZero(p.dcCharge) && isBlankOrZero(p.dcBattery) &&
                       isBlankOrZero(p.tempSys) && isBlankOrZero(p.hrSys);
    if (vthAllZero) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R02", problem: "VTH 결측",
        detail: "AC~Hr_Sys 전원/환경 수치가 공란 또는 모두 0입니다."
      });
    }

    // Rule 3: 수위자료 결측
    const wlAllZero = isBlankOrZero(p.waterDepth) && isBlankOrZero(p.waterLevel) &&
                      isBlankOrZero(p.wlOffset) && isBlankOrZero(p.salinity);
    if (wlAllZero) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R03", problem: "수위자료 결측",
        detail: "WaterDepth~Salinity 수위 수치가 공란 또는 모두 0입니다."
      });
    }

    // Rule 14: 수위계 결측 (WaterLevel === WL_Offset)
    if (!isNaN(p.waterLevel) && !isNaN(p.wlOffset) && p.waterLevel === p.wlOffset && p.waterLevel !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R14", problem: "수위계 결측",
        detail: `WaterLevel과 WL_Offset 값이 동일합니다. (수위=${p.waterLevel}m)`
      });
    }

    // Rule 4: ADVM 자료 결측
    if (!p.advmSensors || p.advmSensors.length === 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R04", problem: "ADVM 자료 결측",
        detail: "ADVM 유속계 자료 블록이 없습니다."
      });
    }

    // Power & Env Range checks (Rules 8~13)
    if (!isNaN(p.ac) && (p.ac < 209 || p.ac > 231) && p.ac !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R08", problem: "AC 전원 범위 이상",
        detail: `AC 입력전압이 정상범위(209~231V)를 벗어남: ${p.ac}V`
      });
    }
    if (!isNaN(p.dcCharge) && (p.dcCharge < 11.5 || p.dcCharge > 14.5) && p.dcCharge !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R09", problem: "DC 충전전압 범위 이상",
        detail: `DC 충전전압이 정상범위(11.5~14.5V)를 벗어남: ${p.dcCharge}V`
      });
    }
    if (!isNaN(p.dcBattery) && (p.dcBattery < 11.5 || p.dcBattery > 14.5) && p.dcBattery !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R10", problem: "DC 배터리전압 범위 이상",
        detail: `DC 배터리전압이 정상범위(11.5~14.5V)를 벗어남: ${p.dcBattery}V`
      });
    }
    if (!isNaN(p.tempSys) && (p.tempSys < -20 || p.tempSys > 80)) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R11", problem: "시스템 온도 범위 이상",
        detail: `시스템 온도가 정상범위(-20~80℃)를 벗어남: ${p.tempSys}℃`
      });
    }
    if (!isNaN(p.hrSys) && (p.hrSys < 10 || p.hrSys > 90) && p.hrSys !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R12", problem: "시스템 습도 범위 이상",
        detail: `시스템 습도가 정상범위(10~90%)를 벗어남: ${p.hrSys}%`
      });
    }
    if (!isNaN(p.salinity) && (p.salinity < 0 || p.salinity > 35) && p.salinity !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "ADVM-R13", problem: "염도 범위 이상",
        detail: `염도가 정상범위(0~35ppt)를 벗어남: ${p.salinity}ppt`
      });
    }

    // Per ADVM Sensor checks (Rules 6, 15~19)
    if (p.advmSensors) {
      for (const adv of p.advmSensors) {
        const sNo = adv.noAdvm || String(adv.sensorSeq);

        if (isNaN(adv.pitch) || isNaN(adv.roll)) {
          list.push({
            method, basin, stationName: name, stCode: code, sensorNo: sNo,
            ruleId: "ADVM-R06", problem: "Pitch/Roll 결측",
            detail: `유속계(${sNo})의 Pitch 또는 Roll 값이 공란입니다.`
          });
        }
        if (!isNaN(adv.tempWater) && adv.tempWater >= 40) {
          list.push({
            method, basin, stationName: name, stCode: code, sensorNo: sNo,
            ruleId: "ADVM-R15", problem: "수온센서 이상",
            detail: `유속계(${sNo}) 수온 센서 측정값 과다: ${adv.tempWater}℃`
          });
        }
        if (!isNaN(adv.pitch) && Math.abs(adv.pitch) >= 5) {
          list.push({
            method, basin, stationName: name, stCode: code, sensorNo: sNo,
            ruleId: "ADVM-R16", problem: "Pitch 이상 의심",
            detail: `유속계(${sNo}) 피치 각도 기울어짐: ${adv.pitch}° (기준: |Pitch| < 5°)`
          });
        }
        if (!isNaN(adv.roll) && Math.abs(adv.roll) >= 5) {
          list.push({
            method, basin, stationName: name, stCode: code, sensorNo: sNo,
            ruleId: "ADVM-R17", problem: "Roll 이상 의심",
            detail: `유속계(${sNo}) 롤 각도 기울어짐: ${adv.roll}° (기준: |Roll| < 5°)`
          });
        }

        // Cell 1 Check (Rules 18 & 19)
        const cell1 = adv.cells?.[0];
        if (cell1) {
          if ((!isNaN(cell1.vEW) && Math.abs(cell1.vEW) > 9999) || (!isNaN(cell1.vNS) && Math.abs(cell1.vNS) > 9999)) {
            list.push({
              method, basin, stationName: name, stCode: code, sensorNo: sNo,
              ruleId: "ADVM-R18", problem: "ADVM 유속계 오측",
              detail: `유속계(${sNo}) 1번 셀 유속 이상치: V_EW=${cell1.vEW}, V_NS=${cell1.vNS}`
            });
          }
          if ((!isNaN(cell1.e1) && cell1.e1 < 70 && cell1.e1 !== 0) || (!isNaN(cell1.e2) && cell1.e2 < 70 && cell1.e2 !== 0)) {
            list.push({
              method, basin, stationName: name, stCode: code, sensorNo: sNo,
              ruleId: "ADVM-R19", problem: "ADVM 유속계 오측(신호강도 저하)",
              detail: `유속계(${sNo}) 1번 셀 초음파 신호강도 저하: E1=${cell1.e1}, E2=${cell1.e2} (기준 >= 70)`
            });
          }
        }
      }
    }

    return list;
  }

  evaluateEwsvStation(target, p, targetDT) {
    const list = [];
    const { code, name, basin, method } = target;

    // Rule 1: 미수신
    if (!p) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R01", problem: "데이터 미수신",
        detail: "대상일시의 원시자료가 SFTP 서버에서 수신되지 않았습니다."
      });
      return list;
    }

    // Rule 2: VTH 결측 (제외지점 제외)
    if (!VTH_EXCLUDED_STATIONS.has(name)) {
      const vthAllZero = isBlankOrZero(p.ac) && isBlankOrZero(p.dcCharge) && isBlankOrZero(p.dcBattery) &&
                         isBlankOrZero(p.tempSys) && isBlankOrZero(p.hrSys);
      if (vthAllZero) {
        list.push({
          method, basin, stationName: name, stCode: code, sensorNo: "-",
          ruleId: "EWSV-R02", problem: "VTH 결측",
          detail: "AC~Hr_Sys 자료가 모두 결측 또는 0입니다."
        });
      }
    }

    // Rule 3: 수위계 결측
    const wlAllZero = isBlankOrZero(p.waterLevel) && isBlankOrZero(p.waterDepth) &&
                      isBlankOrZero(p.wlOffset) && isBlankOrZero(p.salinity);
    if (wlAllZero) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R03", problem: "수위계 결측",
        detail: "WaterLevel~Salinity 수위 자료가 모두 결측 또는 0입니다."
      });
    }

    // Rule 4: 풍향풍속계 결측 (제외지점 제외)
    if (!WIND_EXCLUDED_STATIONS.has(name)) {
      const windAllZero = isBlankOrZero(p.windDegree) && isBlankOrZero(p.wind) &&
                          isBlankOrZero(p.windTemp) && isBlankOrZero(p.windH) && isBlankOrZero(p.windAtmos);
      if (windAllZero) {
        list.push({
          method, basin, stationName: name, stCode: code, sensorNo: "-",
          ruleId: "EWSV-R04", problem: "풍향풍속계 결측",
          detail: "WindDegree~WindAtmos 기상 자료가 모두 결측 또는 0입니다."
        });
      }
    }

    // Rule 5: 유속계 결측 (EWSV_Flag === 0 or blank)
    if (isBlankOrZero(p.ewsvFlag) || p.ewsvFlag === "0") {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R05", problem: "유속계 결측",
        detail: "EWSV_Flag 값이 결측 또는 0입니다."
      });
    }

    // Rule 6: 일부 유속계 결측 (EWSV_Cnt !== sensors.length)
    if (p.ewsvCnt > 0 && p.sensors && p.sensors.length !== p.ewsvCnt) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R06", problem: "일부 유속계 결측",
        detail: `설정 센서수(EWSV_Cnt=${p.ewsvCnt})와 실제 수신 센서수(${p.sensors.length})가 불일치합니다.`
      });
    }

    // Power & Env Range checks (Rules 8~12)
    if (!isNaN(p.ac) && (p.ac < 209 || p.ac > 231) && p.ac !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R08", problem: "AC 전압 이상",
        detail: `AC 전압이 정상범위(209~231V)를 벗어남: ${p.ac}V`
      });
    }
    if (!isNaN(p.dcCharge) && (p.dcCharge < 11.5 || p.dcCharge > 14.5) && p.dcCharge !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R09", problem: "DC 충전 전압 이상",
        detail: `DC 충전전압이 정상범위(11.5~14.5V)를 벗어남: ${p.dcCharge}V`
      });
    }
    if (!isNaN(p.dcBattery) && (p.dcBattery < 11.5 || p.dcBattery > 14.5) && p.dcBattery !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R10", problem: "배터리 전압 이상",
        detail: `배터리 전압이 정상범위(11.5~14.5V)를 벗어남: ${p.dcBattery}V`
      });
    }
    if (!isNaN(p.tempSys) && (p.tempSys < 0 || p.tempSys > 80)) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R11", problem: "제어시스템 온도 이상",
        detail: `제어시스템 온도가 정상범위(0~80℃)를 벗어남: ${p.tempSys}℃`
      });
    }
    if (!isNaN(p.hrSys) && (p.hrSys < 10 || p.hrSys > 90) && p.hrSys !== 0) {
      list.push({
        method, basin, stationName: name, stCode: code, sensorNo: "-",
        ruleId: "EWSV-R12", problem: "제어시스템 습도 이상",
        detail: `제어시스템 습도가 정상범위(10~90%)를 벗어남: ${p.hrSys}%`
      });
    }

    // Per Sensor Checks (Rules 7, 13)
    if (p.sensors) {
      for (const s of p.sensors) {
        const sNo = s.ewsvNo || String(s.sensorSeq);

        if (isBlankOrZero(s.ewsvDeg) && isBlankOrZero(s.ewsvSnr)) {
          list.push({
            method, basin, stationName: name, stCode: code, sensorNo: sNo,
            ruleId: "EWSV-R07", problem: "유속계 Deg/SNR 결측",
            detail: `유속계(${sNo}) 각도(Deg) 및 SNR 신호강도가 모두 0 또는 결측입니다.`
          });
        }

        if (!isNaN(s.ewsvDeg) && (s.ewsvDeg < 0 || s.ewsvDeg > 90)) {
          list.push({
            method, basin, stationName: name, stCode: code, sensorNo: sNo,
            ruleId: "EWSV-R13", problem: "유속계 설치각도 이상",
            detail: `유속계(${sNo}) 설치각도가 정상범위(0~90°)를 벗어남: ${s.ewsvDeg}°`
          });
        }
      }
    }

    return list;
  }
}

module.exports = new RuleEngine();
