(() => {
  const page = new URL(window.location.href);
  const choice = page.searchParams.get("lang");
  let saved;

  try {
    if (choice === "en" || choice === "ko") {
      localStorage.setItem("dune-language", choice);
    }
    saved = localStorage.getItem("dune-language");
  } catch {
    // 언어는 URL의 lang 값으로도 전달된다.
  }

  const lang = choice === "en" || choice === "ko"
    ? choice
    : saved === "en" || saved === "ko"
      ? saved
      : "en"; // 처음 들어오면 영어. KR 을 고르면 그 선택을 기억한다

  const korean = lang === "ko";

  const directoryForGuide = new URL(".", page);
  const legacyTeachingPage = new URL("teaching.html", directoryForGuide);
  const legacyKoreanDirectory = directoryForGuide.pathname.endsWith("/ko/");
  const guidePath = legacyKoreanDirectory ? "study-guide.html" : korean ? "ko/study-guide.html" : "study-guide.html";

  function linkToStudyGuide() {
    document.querySelectorAll("a[href]").forEach(link => {
      const target = new URL(link.href);
      if (target.origin !== legacyTeachingPage.origin || target.pathname !== legacyTeachingPage.pathname) return;

      const guide = new URL(guidePath, directoryForGuide);
      guide.search = target.search;
      guide.hash = target.hash;
      guide.searchParams.set("lang", legacyKoreanDirectory && choice !== "en" ? "ko" : lang);
      link.href = guide.href;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", linkToStudyGuide, { once: true });
  } else {
    linkToStudyGuide();
  }
  document.documentElement.lang = korean ? "ko" : "en-GB";

  const translations = {
    "› Lunar Landing Site Navigator": "› 달 착륙지 탐색기",
    "Left: Earth just above the lunar horizon. Right: the Sun coming out from behind the Moon. Both seen by the Artemis II crew, April 2026": "왼쪽은 달 지평선 바로 위의 지구, 오른쪽은 달 뒤에서 나타나는 태양. 2026년 4월 아르테미스 II 승무원 촬영",
    "Low sunlight along the line between lunar day and night, Artemis II, April 2026": "달의 낮과 밤 경계에 비치는 낮은 각도의 햇빛. 2026년 4월 아르테미스 II 촬영",
    "The lunar south pole, where the Sun never rises far above the horizon": "태양이 지평선 위로 높이 뜨지 않는 달 남극",
    "Earth rising over the Moon, photographed from Apollo 11, July 1969": "달 지평선 위로 떠오르는 지구. 1969년 7월 아폴로 11호 촬영",
    "The Apollo 11 landing site seen from orbit by the Lunar Reconnaissance Orbiter, 2009": "아폴로 11호 착륙지. 2009년 달 정찰 궤도선 촬영",
    "Surveyor 3, photographed by the Apollo 12 crew at its landing site, November 1969": "서베이어 3호 착륙선. 1969년 11월 아폴로 12호 승무원 촬영",
    "The Apollo 14 landing site at Fra Mauro seen by the Lunar Reconnaissance Orbiter, 2009": "프라 마우로의 아폴로 14호 착륙지. 2009년 달 정찰 궤도선 촬영",
    "Hadley Delta, seen from the Apollo 15 lunar module just after landing, July 1971": "착륙 직후 아폴로 15호 달 착륙선에서 바라본 해들리 델타. 1971년 7월",
    "The Apollo 17 landing site in the Taurus-Littrow valley, December 1972": "타우루스-리트로 계곡의 아폴로 17호 착륙지. 1972년 12월",
    "Compare landing sites and dates by sunlight and the view of Earth": "일조와 지구 가시성을 기준으로 착륙 후보지와 날짜를 비교해 보세요",
    "The lunar south pole. Photograph: NASA.": "달 남극. 사진 제공 NASA.",
    "Some craters near the Moon's south pole have not seen sunlight for billions of years. Water ice is thought to be trapped inside them, and that is why many future missions plan to land nearby.": "달 남극 근처에는 수십억 년 동안 햇빛이 닿지 않은 분화구가 있습니다. 그 안에 물 얼음이 남아 있을 가능성이 있어 많은 후속 임무가 인근 착륙을 계획하고 있습니다.",
    "The same place is hard to land at. Near the pole the Sun never climbs far above the horizon, so shadows are long and a small hill can block the light. Earth also sits low in the sky, and from some spots a crater rim hides it completely. A lander there needs sunlight for power and a view of Earth to send data home.": "달 남극은 착륙하기 까다로운 곳이기도 합니다. 태양이 지평선 가까이에 머물러 그림자가 길고, 작은 언덕도 햇빛을 가릴 수 있습니다. 지구도 낮게 보여 어떤 곳에서는 분화구 가장자리에 완전히 가려집니다. 착륙선은 전력을 얻으려면 햇빛이, 지구에 데이터를 보내려면 지구가 보이는 시야가 필요합니다.",
    "Moving a landing site a few kilometres, or the date by a few days, can change both. This project is building a tool that shows those changes clearly.": "착륙 지점을 몇 km 옮기거나 날짜를 며칠 바꾸면 두 조건 모두 달라질 수 있습니다. 이 프로젝트는 그 차이를 쉽게 확인할 수 있는 도구를 개발하고 있습니다.",
    "Compare sites and dates side by side: Sun elevation, hours of sunlight, and when Earth is in view.": "태양 고도, 일조 시간, 지구가 보이는 시간대를 기준으로 착륙 후보지와 날짜를 나란히 비교해 보세요.",
    "A study guide to how the Sun and Earth move in the lunar sky, for learning on your own or teaching in class.": "달 하늘에서 태양과 지구가 어떻게 움직이는지 알아보는 학습 가이드입니다. 자율 학습과 수업에 활용할 수 있습니다.",
    "NASA sets out its Moon Base plans": "NASA, 달 기지 계획 공개",
    "7 Nov 2026": "2026년 11월 7일",
    "New contracts and mission plans for a base near the south pole, including PROMISE, a rover that will look for ice.": "얼음을 찾는 탐사차 PROMISE 등 달 남극 인근 기지를 위한 신규 계약과 임무 계획을 공개했습니다.",
    "China details its crewed Moon landing plan": "중국, 유인 달 착륙 계획 구체화",
    "1 Nov 2026": "2026년 11월 1일",
    "China aims to land astronauts by 2030 and, like NASA, wants a base near the south pole.": "중국은 2030년까지 우주비행사를 달에 착륙시키고, NASA와 마찬가지로 달 남극 인근에 기지를 세우는 것을 목표로 합니다.",
    "Griffin-1 lander getting ready to launch": "그리핀 1호 착륙선, 발사 준비",
    "Late 2026": "2026년 말",
    "Astrobotic's Griffin-1 plans to launch late this year, carrying the largest commercial payload yet sent to the Moon's surface.": "애스트로보틱의 그리핀 1호는 달 표면으로 보내는 상업용 탑재체 중 역대 최대 규모를 싣고 올해 말 발사할 계획입니다.",
    "Chang'e 7 delayed to 2027": "창어 7호, 2027년으로 연기",
    "24 Aug 2026": "2026년 8월 24일",
    "China's lander will aim for the rim of Shackleton crater, closer to the pole than any spacecraft has landed.": "중국 착륙선은 기존의 어떤 착륙 지점보다 남극에 가까운 섀클턴 분화구 가장자리를 목표로 합니다.",
    "Checked 15 November 2026.": "2026년 11월 15일 확인.",
    "Team DU:NE": "DU:NE 팀",
    "NASA Space Apps Challenge 2026, Seoul": "NASA 스페이스 앱스 챌린지 2026 서울",
    "› Learning resources": "› 학습 자료",
    "For both learners and educators: how the Sun and Earth move in the lunar sky, and why that matters for anyone trying to land there.": "달 하늘에서 태양과 지구가 어떻게 움직이는지, 그리고 이것이 달 착륙에 왜 중요한지 알아봅니다. 학습자와 교육자 모두 활용할 수 있습니다.",
    "Study guide": "학습 가이드",
    "Landing on the Moon's South Pole: Light, Shadow and Line of Sight": "달 남극 착륙: 햇빛과 그림자, 그리고 시야",
    ". A six-chapter study guide with figures, worked examples, review questions and a classroom activity.": ". 그림, 풀이 예제, 복습 문제, 수업 활동을 담은 6장 분량의 학습 가이드입니다.",
    "› Sources & Checks": "› 출처 및 검증",
    "Pictures: the same stretch of the lunar south pole drawn by the team from NASA data. Left card: LOLA heights, LROC WAC images and NASA Goddard's PGDA69 sunlight map. Right card: PGDA69 sunlight beside our own calculation.": "두 그림 모두 같은 달 남극 지역을 NASA data로 우리가 직접 그린 것입니다. 왼쪽: LOLA 고도, LROC WAC 사진, NASA Goddard PGDA69 일조 지도. 오른쪽: PGDA69 일조 지도와 우리 계산을 나란히 놓은 것입니다.",
    "› Sources": "› 참고 자료",
    "This list is a working draft. The team will add, remove and update entries after discussion. Last updated 14 November 2026.": "이 목록은 초안이며 팀 논의를 거쳐 항목을 추가·삭제·수정합니다. 최종 업데이트는 2026년 11월 14일입니다.",
    "The challenge": "챌린지 안내",
    "NASA Space Apps Challenge 2026: Lunar Landing Site Navigator": "NASA 스페이스 앱스 챌린지 2026: 달 착륙지 탐색기",
    "The challenge brief. Our main source for what the tool should do and who it is for.": "도구의 목표와 대상 사용자를 정의할 때 참고한 챌린지 안내문입니다.",
    "Tools named in the challenge": "챌린지가 소개한 도구",
    "Web map of Lunar Reconnaissance Orbiter data. Useful for looking at sites and data layers by eye.": "달 정찰 궤도선의 데이터를 보여 주는 웹 지도입니다. 후보지와 데이터 레이어를 직접 살펴볼 수 있습니다.",
    "NASA's online lunar mapping portal, with terrain and image layers.": "지형과 영상 레이어를 제공하는 NASA의 온라인 달 지도입니다.",
    "Online service that gives the Sun's and Earth's positions for a chosen place and time. We use it to check our own calculations.": "선택한 장소와 시간의 태양·지구 위치를 제공하는 온라인 서비스입니다. 자체 계산값을 확인하는 데 사용합니다.",
    "Canadian Space Agency: Moon exploration": "캐나다 우주청: 달 탐사",
    "Background reading on lunar exploration.": "달 탐사에 대한 배경 자료입니다.",
    "The Lunar Reconnaissance Orbiter": "달 정찰 궤도선",
    "NASA: Lunar Reconnaissance Orbiter": "NASA: 달 정찰 궤도선",
    "Overview of the spacecraft whose measurements most lunar south pole data comes from.": "달 남극 자료 대부분을 관측한 우주선의 개요입니다.",
    "NASA: LRO science and data": "NASA: LRO 과학과 데이터",
    "What LRO measures and where its data products are kept, including LOLA heights.": "LRO의 관측 항목과 LOLA 고도 자료 등 데이터 제품의 보관 위치를 소개합니다.",
    "Terrain and sunlight data": "지형 및 일조 데이터",
    "PDS Geosciences Node: LRO LOLA archive": "PDS 지구과학 노드: LRO LOLA 자료 아카이브",
    "The official archive for LOLA data. Its product documents explain how to read each file.": "LOLA 데이터 공식 아카이브입니다. 제품 문서에서 각 파일을 읽는 방법을 확인할 수 있습니다.",
    "NASA PGDA product 78: high-resolution topography of south pole sites": "NASA PGDA 제품 78: 달 남극 후보지 고해상도 지형",
    "Elevation and slope maps with 5 m pixels around named candidate sites, such as the Shackleton rim and Malapert Massif.": "섀클턴 분화구 가장자리, 말라퍼트 산괴 등 지정된 후보지 주변을 5 m 픽셀로 나타낸 고도·경사 지도입니다.",
    "NASA PGDA product 81: south pole elevation mosaic": "NASA PGDA 제품 81: 달 남극 고도 모자이크",
    "A single 5 m elevation map of the region around the pole. The full file is large.": "달 남극 주변을 5 m 해상도로 나타낸 단일 고도 지도입니다. 전체 파일 용량이 큽니다.",
    "NASA PGDA product 69: lunar polar illumination": "NASA PGDA 제품 69: 달 극지 일조",
    "Maps of how much of the time each spot is sunlit, averaged over many years. Good for choosing a region, not for a specific date.": "여러 해에 걸쳐 각 지점에 햇빛이 드는 시간 비율을 평균한 지도입니다. 후보 지역을 고르는 데 활용할 수 있으며 특정 날짜의 일조는 별도 계산이 필요합니다.",
    "LOLA GDRVIS product notes": "LOLA GDRVIS 제품 설명",
    "Explains maps of average sunlight and average Earth visibility over an 18.6-year cycle.": "18.6년 주기에 걸친 평균 일조율과 지구 가시율을 나타내는 지도를 설명합니다.",
    "LOLA GDRSKY product notes": "LOLA GDRSKY 제품 설명",
    "Explains maps of how much of the sky can be seen from each spot.": "각 지점에서 하늘이 얼마나 보이는지 나타내는 지도를 설명합니다.",
    "NASA Lunar Surface Data Book": "NASA 달 표면 데이터북",
    "NASA's reference on lunar sunlight, Earth visibility and permanent shadow products, and the limits of each.": "달의 일조, 지구 가시성, 영구 음영 자료와 각각의 한계를 설명하는 NASA 참고 문서입니다.",
    "Lunar Orbital Data Explorer": "달 궤도 데이터 탐색기",
    "Search, map and download tool for lunar mission data.": "달 탐사 데이터를 검색하고 지도에서 확인하고 내려받는 도구입니다.",
    "Positions and time": "위치와 시간",
    "JPL NAIF: generic SPICE kernels": "JPL NAIF: 범용 SPICE 커널",
    "The data files SPICE uses for positions, body shapes and time.": "SPICE가 천체의 위치와 형상, 시간 계산에 사용하는 데이터 파일입니다.",
    "JPL NAIF: SPICE kernel guide": "JPL NAIF: SPICE 커널 가이드",
    "Explains what each type of kernel file does.": "커널 파일 유형별 역할을 설명합니다.",
    "The SPICE routine that gives azimuth and elevation as seen from a point on the surface.": "표면의 한 지점에서 본 방위각과 고도각을 계산하는 SPICE 함수입니다.",
    "The SPICE routine for the point directly below the Sun. Background only.": "태양이 천정에 있는 지표 지점을 계산하는 SPICE 함수입니다. 배경 자료로 참고했습니다.",
    "Conditions at the south pole": "달 남극 환경",
    "NASA: Shadows near the Moon's south pole": "NASA: 달 남극 부근의 그림자",
    "Visualisation of how a low Sun casts long shadows over the polar terrain.": "낮은 각도의 햇빛이 달 극지 지형에 긴 그림자를 만드는 모습을 보여 줍니다.",
    "NASA: Lunar surface propagation": "NASA: 달 표면과 전파 전파 특성",
    "How terrain affects radio signals between the lunar surface and Earth.": "달 표면과 지구 사이의 무선 신호에 지형이 미치는 영향을 설명합니다.",
    "NASA: Moon base environment": "NASA: 달 기지 주변 환경",
    "Lighting, shadow and temperature conditions at the lunar south pole.": "달 남극의 일조, 그림자, 온도 조건을 설명합니다.",
    "Pictures on this website": "사이트에 사용된 사진",
    "NASA Image and Video Library": "NASA 이미지·동영상 라이브러리",
    "Source of the photographs on these pages: art002e015231, art002e009575 and art002e014055 (Artemis II, April 2026), PIA13523 (the lunar south pole), AS11-44-6552 (Apollo 11), AS16-113-18289 (Apollo 16), PIA12909 and PIA12897 (Lunar Reconnaissance Orbiter views of the Apollo 11 and 14 sites), AS12-48-7121 (Apollo 12), AS15-87-11748 (Apollo 15) and AS17-134-20435 (Apollo 17).": "사이트 사진 출처: art002e015231, art002e009575, art002e014055(아르테미스 II, 2026년 4월), PIA13523(달 남극), AS11-44-6552(아폴로 11호), AS16-113-18289(아폴로 16호), PIA12909 및 PIA12897(달 정찰 궤도선이 촬영한 아폴로 11호·14호 착륙지), AS12-48-7121(아폴로 12호), AS15-87-11748(아폴로 15호), AS17-134-20435(아폴로 17호).",
    "How we use sources": "출처 활용 원칙",
    "Cite the product's own documentation or the scientific paper, not only an archive's front page.": "아카이브 첫 페이지와 함께 데이터 제품의 문서나 관련 논문을 인용합니다.",
    "For every data file we download, record its product name, version, file name, date downloaded, map projection, reference frame, units and resolution.": "내려받은 데이터마다 제품명, 버전, 파일명, 다운로드 날짜, 지도 투영법, 기준 좌표계, 단위, 해상도를 기록합니다.",
    "Keep measured data, modelled products and made-up demonstration values clearly apart.": "관측 데이터, 모델 산출물, 시연용 가상 값을 명확히 구분합니다.",
    "Do not put large mission data files in the repository; link to where they can be downloaded.": "용량이 큰 임무 데이터는 다운로드 링크로 제공합니다.",
    "› Checks": "› 검증",
    "The tool's answers are built from five kinds of data. For each one, this page asks two questions: is our copy of the data the same as NASA's original, and are the tool's answers built from it right?": "도구의 계산은 다섯 종류의 자료를 사용합니다. 각 자료가 NASA 원본과 일치하는지, 그리고 그 자료를 사용한 도구의 계산값이 맞는지 확인합니다.",
    "Version 1, 15 November 2026.": "버전 1 · 2026년 11월 15일",
    "Most checks so far answer the first question. Checks of the tool's own answers come next, and their pass rules will be written down here before they are run.": "현재까지는 주로 원본과의 일치 여부를 확인했습니다. 다음 단계로 도구 자체의 계산값을 점검하며, 각 검증의 통과 기준을 실행 전에 이 페이지에 공개합니다.",
    "Data": "데이터",
    "Used for": "용도",
    "Copy matches original": "원본 일치 여부",
    "Tool's answers checked": "도구 계산값 검증",
    "LOLA terrain": "LOLA 지형",
    "Height and slope of the ground, and the skyline": "표면 고도, 경사, 지형 지평선",
    "Match": "일치",
    "Not done": "미실시",
    "LROC images": "LROC 영상",
    "Real photographs to compare with predicted shadows": "예측한 그림자와 비교할 실제 사진",
    "Images not yet downloaded": "영상 다운로드 전",
    "Diviner temperature": "Diviner 온도",
    "Surface temperature, for background": "참고용 표면 온도",
    "Not used yet": "아직 미사용",
    "Illumination maps": "일조 지도",
    "Long-term average sunlight, Earth in view and permanent shadow": "장기간 평균 일조와 지구 가시성, 영구 음영",
    "Ephemeris": "천체 위치표",
    "Where the Sun and Earth are in the lunar sky": "달 하늘에서 본 태양과 지구의 위치",
    "Measured": "차이 측정",
    "Measured, no pass rule yet": "차이 측정 · 통과 기준 미설정",
    "How to read the labels": "상태 표시 읽는 법",
    "The two things compared are identical, or agree to the last stored digit.": "비교한 두 자료가 동일하거나 기록된 마지막 자리까지 일치합니다.",
    "We measured the difference, but no pass rule was set before the test, so we do not call it a pass or a fail.": "차이를 측정했습니다. 통과 기준을 사전에 정하지 않아 통과 여부는 판정하지 않았습니다.",
    "Planned but not run yet.": "예정된 검증이며 아직 시행하지 않았습니다.",
    "Each check also says what kind it is. A": "검증은 세 가지로 구분합니다.",
    "copy check": "원본 대조",
    "compares our file with NASA's original. A": "는 사용한 파일을 NASA 원본과 비교합니다.",
    "consistency check": "일관성 확인",
    "compares two results that share a source, so agreement shows the working is right but not that the source itself is right. A": "은 출처가 같은 결과 두 개를 비교해 계산 과정의 일치 여부를 확인합니다.",
    "validation": "독립 검증",
    "compares the tool with an independent outside source.": "은 도구의 결과를 독립적인 외부 자료와 비교합니다.",
    "1. LOLA terrain": "1. LOLA 지형",
    "Height maps from the Lunar Orbiter Laser Altimeter on NASA's Lunar Reconnaissance Orbiter: 5 m maps of the Site01 area and wider 80 m and 240 m maps of the south pole.": "NASA 달 정찰 궤도선의 레이저 고도계가 구축한 고도 지도입니다. Site01의 5 m 지도와 달 남극 전역을 넓게 보여 주는 80 m·240 m 지도를 사용합니다.",
    "Check": "검증 항목",
    "Compared with": "비교 기준",
    "Result": "결과",
    "Status": "상태",
    "Wide 80 m and 240 m height maps and their 4 label files": "넓은 범위의 80 m·240 m 고도 지도와 라벨 파일 4개",
    "Copy check": "원본 대조",
    "MD5 checksums in NASA's PDS Registry": "NASA PDS 레지스트리의 MD5 체크섬",
    "Every file matches byte for byte.": "모든 파일이 바이트 단위까지 일치합니다.",
    "Site01 5 m maps: height, slope, laser-shot count and two error maps": "Site01 5 m 지도: 고도, 경사, 레이저 관측 횟수, 오차 지도 2종",
    "The same window cut from NASA Goddard's original files (PGDA product 78)": "NASA 고더드 원본(PGDA 제품 78)에서 잘라 낸 동일 영역",
    "Every value and every missing-data cell matches. No cell was resampled.": "모든 값과 결측 셀이 일치합니다. 셀 재표본화는 없었습니다.",
    "How much of the Site01 map is measured": "Site01 지도에서 실제 관측된 범위",
    "Measurement": "측정",
    "The laser-shot count map": "레이저 관측 횟수 지도",
    "21,600 of 230,400 cells (9.4%) contain at least one laser shot. The rest are filled in by NASA. Height error 0.07–2.70 m, slope error 0.77–14.44°.": "230,400개 셀 중 21,600개(9.4%)에 레이저 관측이 1회 이상 있습니다. 나머지 셀은 NASA가 보완한 값입니다. 고도 오차는 0.07–2.70 m, 경사 오차는 0.77–14.44°입니다.",
    "Tool's slope and skyline at a site": "특정 지점에서 도구가 산출한 경사와 지형 지평선",
    "Validation": "독립 검증",
    "NASA Goddard's published slope maps": "NASA 고더드가 공개한 경사 지도",
    "Source files: Catalogs/COLLECTION_REPORT.md, Reference_Tables/existing_validation.json": "출처 파일: Catalogs/COLLECTION_REPORT.md, Reference_Tables/existing_validation.json",
    "2. LROC images": "2. LROC 영상",
    "Photographs from the Lunar Reconnaissance Orbiter Camera. The close-up Narrow Angle Camera (NAC) shows shadows at metre scale, which makes it the best real-world test of predicted sunlight.": "달 정찰 궤도선 카메라가 촬영한 사진입니다. 협각 카메라(NAC)는 미터 규모의 그림자를 보여 주므로 일조 예측을 실제 관측과 비교하는 데 적합합니다.",
    "Which NAC images cover Site01": "Site01을 포함하는 NAC 영상 확인",
    "NASA's Lunar Orbital Data Explorer (ODE)": "NASA 달 궤도 데이터 탐색기(ODE)",
    "216 NAC images cover the area. Product ID, time and label address saved for 3 samples.": "해당 지역을 포함하는 NAC 영상은 216개입니다. 표본 3개의 제품 ID, 시각, 라벨 주소를 기록했습니다.",
    "Tool's predicted shadows against real NAC photos": "도구가 예측한 그림자와 실제 NAC 사진 비교",
    "NAC photographs at the same time and place": "같은 시간과 장소를 촬영한 NAC 사진",
    "Source files: Catalogs/regional_observation_context.json, Validation_Images/PILOT_LROC_NAC/": "출처 파일: Catalogs/regional_observation_context.json, Validation_Images/PILOT_LROC_NAC/",
    "3. Diviner temperature": "3. Diviner 온도",
    "Surface temperature from the Diviner Lunar Radiometer on the Lunar Reconnaissance Orbiter, as seasonal averages in 240 m cells.": "달 정찰 궤도선의 Diviner 복사계로 얻은 표면 온도입니다. 240 m 셀별 계절 평균값을 사용합니다.",
    "Extracted Site01 temperatures": "Site01에서 추출한 온도",
    "Latitude, longitude and temperature in the original Diviner table": "Diviner 원본 표의 위도, 경도, 온도",
    "Every output cell matches its source row.": "산출물의 모든 셀이 원본 표의 해당 행과 일치합니다.",
    "Coverage of Site01": "Site01 데이터 범위",
    "99 of 100 cells have a value, 1 is missing. Valid values 55.80–206.66 K.": "100개 셀 중 99개에 값이 있고 1개는 결측입니다. 유효 범위는 55.80–206.66 K입니다.",
    "Diviner is not used to test the tool's answers yet. Its label does not state which lunar reference frame it uses, so it is only used for regional comparison.": "Diviner 자료는 현재 지역 간 비교에만 사용합니다. 제품 라벨에 사용한 달 기준 좌표계가 명시되어 있지 않아 도구의 계산 결과 검증에는 아직 사용하지 않았습니다.",
    "Source files: Catalogs/COLLECTION_REPORT.md, Catalogs/diviner_provenance.json": "출처 파일: Catalogs/COLLECTION_REPORT.md, Catalogs/diviner_provenance.json",
    "4. Illumination maps": "4. 일조 지도",
    "NASA Goddard's maps of how much of the time each spot sees the Sun and Earth, averaged over about 18.6 years (PGDA product 69), at 60 m. They are modelled from LOLA terrain, not measured directly.": "NASA 고더드가 달 각 지점의 일조율과 지구 가시율을 약 18.6년 동안 평균한 60 m 해상도 지도(PGDA 제품 69)입니다. LOLA 지형을 바탕으로 모델링한 값입니다.",
    "Site01 sunlight and Earth-in-view maps": "Site01의 일조 및 지구 가시성 지도",
    "The original cells and missing-data mask": "원본 셀 값과 결측 영역 마스크",
    "Every cell matches. Sunlight 0–0.884 of the time, Earth in view 0–0.582.": "모든 셀이 일치합니다. 일조 비율은 0–0.884, 지구 가시 비율은 0–0.582입니다.",
    "Permanent-shadow map against the sunlight map": "영구 음영 지도와 일조 지도 비교",
    "Consistency check": "일관성 확인",
    "Cells with zero sunlight": "일조 비율이 0인 셀",
    "The 41 permanent-shadow cells are exactly the 41 zero-sunlight cells.": "영구 음영 셀 41개가 일조 비율 0인 셀 41개와 정확히 일치합니다.",
    "Tool's sunlight and Earth-in-view percentages": "도구가 산출한 일조율과 지구 가시율",
    "These maps at the same points": "이 지도에서 동일 지점의 값",
    "Problem found: the Earth map's label gives a minimum latitude with the wrong sign for a south pole map. We confirmed the direction from the map projection and recorded the mismatch.": "지구 가시성 지도 라벨에 달 남극 최저 위도의 부호가 잘못 표기돼 있었습니다. 지도 투영법으로 방향을 확인하고 불일치를 기록했습니다.",
    "Source files: Catalogs/COLLECTION_REPORT.md, Catalogs/light_provenance.json": "출처 파일: Catalogs/COLLECTION_REPORT.md, Catalogs/light_provenance.json",
    "5. Ephemeris": "5. 천체 위치표",
    "Tables of where the Sun and Earth sit in the sky, as seen from a point on the Moon, every hour. Two independent routes: JPL's Horizons service, and our own calculation with JPL's SPICE toolkit.": "달의 특정 지점에서 본 태양과 지구의 위치를 시간 간격 1시간으로 정리한 표입니다. JPL Horizons 서비스와 JPL SPICE를 이용한 자체 계산, 두 경로로 값을 얻었습니다.",
    "SPICE tables at 3 sites, 1,131 shared times": "세 지점에서 동일 시각 1,131개에 대한 SPICE 표",
    "Horizons tables for the same places and times": "동일 장소와 시각의 Horizons 표",
    "Largest gap 0.000001° at the connecting ridge (south pole, 2026) and the Chandrayaan-3 site (2023). 0.0003° at the Apollo 11 site (1969), partly from coordinate rounding.": "최대 차이는 남극 연결 능선(2026년)과 찬드라얀 3호 착륙지(2023년)에서 0.000001°, 아폴로 11호 착륙지(1969년)에서 0.0003°입니다. 아폴로 11호 차이의 일부는 좌표 반올림에서 비롯됩니다.",
    "Our stored Horizons table": "저장한 Horizons 표",
    "A fresh request to JPL Horizons: 8 Sun and Earth angles at the connecting ridge": "연결 능선의 태양·지구 각도 8개를 JPL Horizons에 다시 요청",
    "Largest gap 0.00000036°.": "최대 차이 0.00000036°.",
    "Web app's Sun and Earth angles": "웹 앱이 계산한 태양과 지구의 각도",
    "The SPICE and Horizons tables": "SPICE 및 Horizons 표",
    "Largest gap 0.006° with the Horizons-table method, 0.004° with astronomy-engine.": "최대 차이는 Horizons 표를 이용한 방식에서 0.006°, astronomy-engine에서 0.004°입니다.",
    "Horizons and SPICE use the same family of JPL position data, so their agreement shows our working is right, not that the JPL data itself is right. Near the pole the Sun stays close to the horizon, where a gap of 0.01° can change whether a spot counts as sunlit. The pass rule for the web app should be set with that in mind.": "Horizons와 SPICE는 같은 계열의 JPL 위치 자료를 사용합니다. 두 결과의 일치는 계산 과정의 일관성을 보여 줍니다. 극지에서는 태양이 지평선 가까이에 머물러 0.01° 차이로도 일조 판정이 달라질 수 있으므로 웹 앱의 통과 기준에 이를 고려해야 합니다.",
    "Source files: Reference_Tables/existing_validation.json, Reference_Tables/SPICE_기준표_사용법.md, Reference_Tables/horizons_*.csv, Reference_Tables/spice_*.csv": "출처 파일: Reference_Tables/existing_validation.json, Reference_Tables/SPICE_기준표_사용법.md, Reference_Tables/horizons_*.csv, Reference_Tables/spice_*.csv",
    "Not established yet": "아직 확인할 사항",
    "No pass rules have been set for the tool's own answers.": "도구의 자체 계산 결과에 대한 통과 기준을 아직 정하지 않았습니다.",
    "Landing-site coordinates in our catalogue have not yet been checked against their published sources.": "목록의 착륙지 좌표를 공개 출처와 아직 대조하지 않았습니다.",
    "The ephemeris tables treat the ground as flat and the Sun and Earth as points. Hills and the size of the Sun's disc are handled separately by the tool.": "천체 위치표는 지표를 평평하게, 태양과 지구는 점으로 가정합니다. 도구는 주변 지형과 태양 원반의 크기를 별도로 반영합니다.",
    "No check of the tool against real mission events (for example, when a lander's sunset came) has been run.": "착륙선의 실제 일몰 시각 등 임무 중 관측된 사건과 도구의 예측을 아직 비교하지 않았습니다.",
    "Summary": "검증 요약",
    "› Teaching resources": "› 교육 자료",
    "For teachers who want to use the Moon in class: how the Sun and Earth move in the lunar sky, and why that matters for anyone trying to land there.": "달을 수업에 활용할 교육자를 위한 자료입니다. 달 하늘에서 태양과 지구가 어떻게 움직이고 달 착륙에 어떤 영향을 주는지 다룹니다.",
    "The tool is still being built. This page shows what it will cover.": "도구는 개발 중입니다. 이 페이지에서 다룰 내용을 소개합니다.",
    "Planned material": "준비 중인 수업 자료",
    "A short explanation of why the Sun stays close to the horizon at the lunar poles.": "달 극지에서 태양이 지평선 가까이에 머무는 이유를 짧게 설명합니다.",
    "Why Earth hardly moves in the Moon's sky, and why it can still drop out of sight behind a crater rim.": "달 하늘에서 지구가 거의 움직이지 않는 이유와 분화구 가장자리에 지구가 가려지는 상황을 살펴봅니다.",
    "A classroom activity: pick two landing sites and decide which one a solar-powered lander should use.": "수업 활동: 두 후보지를 골라 태양광을 쓰는 착륙선에 더 적합한 곳을 판단합니다.",
    "Pictures and diagrams that can be used in slides.": "발표 자료에 사용할 수 있는 사진과 도해",
    "A study guide about light, shadow and line of sight at the Moon's south pole.": "달 남극의 햇빛, 그림자, 시야를 다루는 학습 가이드입니다.",
    "Open the study guide →": "학습 가이드 열기 →",
    "Sources": "참고 자료",
    "See all sources": "전체 참고 자료 보기",
    "Language": "언어",
    "Main": "주 메뉴",
    "Sources and checks": "참고 자료 및 검증",
    "Pictures": "사진",
    "Space Apps Challenge 2026": "스페이스 앱스 챌린지 2026",
    "Day and night on the Moon": "달의 낮과 밤",
    "A thin crescent Earth just above the Moon's horizon": "달 지평선 바로 위에 보이는 가느다란 초승 지구",
    "The Sun appearing from behind the Moon at the end of an eclipse, with the Orion spacecraft in front": "식이 끝날 때 달 뒤에서 나타나는 태양과 앞쪽의 오리온 우주선",
    "Craters along the line between lunar day and night, with long shadows": "달의 낮과 밤 경계를 따라 길게 그림자가 진 분화구",
    "The region around the Moon's south pole seen from orbit": "궤도에서 본 달 남극 주변",
    "Earth rising over the lunar horizon, photographed from Apollo 11": "아폴로 11호에서 촬영한 달 지평선 위의 지구",
    "The Apollo 11 landing site photographed from orbit, with the lunar module descent stage labelled": "궤도에서 본 아폴로 11호 착륙지와 표시된 달 착륙선 하강단",
    "The Surveyor 3 lander standing in a shallow crater": "얕은 분화구 안의 서베이어 3호 착륙선",
    "The Apollo 14 landing site and Cone crater photographed from orbit": "궤도에서 본 아폴로 14호 착륙지와 콘 분화구",
    "A large lunar mountain, Hadley Delta, rising behind a flat plain": "평원 뒤에 솟은 달의 해들리 델타 산",
    "A wide view of the Apollo 17 landing site with the lunar module and rover in the distance": "멀리 달 착륙선과 탐사차가 보이는 아폴로 17호 착륙지 전경",
    "Picture 1": "사진 1",
    "Picture 2": "사진 2",
    "Picture 3": "사진 3",
    "Picture 4": "사진 4",
    "Picture 5": "사진 5",
    "Picture 6": "사진 6",
    "Picture 7": "사진 7",
    "Picture 8": "사진 8",
    "Picture 9": "사진 9",
    "Lunar Landing Site Navigator": "달 착륙지 탐색기",
    "Space Apps 2026, Seoul": "스페이스 앱스 2026 서울",
    "Home": "홈",
    "Learning resources": "학습 자료",
    "Teaching resources": "교육 자료",
    "Team": "팀 소개",
    "Plan a landing": "착륙 계획 세우기",
    "Why the south pole?": "왜 달 남극일까?",
    "Latest news": "최신 소식",
    "Sources & Checks": "출처 및 검증",
    "Sources the project used": "프로젝트 참고 자료",
    "Checks": "검증",
    "Source code": "소스 코드",
    "On this page": "이 페이지에서",
    "See also": "함께 보기",
    "Study guide references": "학습 가이드 참고 문헌",
    "See the checks": "검증 페이지 보기",
    "Search": "검색",
    "Search this site": "사이트 검색",
    "Contact": "연락처",
    "This project": "이 프로젝트",
    "Pictures and data": "사진 및 데이터",
    "Photographs: NASA. Data: NASA Planetary Data System.":
      "사진은 NASA, 데이터는 NASA Planetary Data System에서 제공했습니다.",
    "Not affiliated with or endorsed by NASA.":
      "이 프로젝트는 NASA 소속이 아니며 NASA의 공식 승인을 받지 않았습니다.",
    "Where the tool's numbers come from, and how we test that they are right.":
      "도구가 사용하는 데이터의 출처와 계산 결과를 검증하는 방법을 소개합니다.",
    "The data, tools and documents the project is built on.":
      "프로젝트에 사용한 데이터, 도구 및 문서입니다.",
    "Terrain maps from NASA's LOLA archive, Sun and Earth positions from JPL's SPICE files, the challenge brief itself and more, each with a short note on what we use it for.":
      "NASA LOLA의 지형 지도, JPL SPICE의 태양·지구 위치 데이터, 챌린지 안내문 등 각 자료의 용도를 설명합니다.",
    "Tests that compare the tool's numbers with outside sources.":
      "도구의 계산값을 외부 자료와 비교하는 검증입니다.",
    "Every check of the tool's numbers against outside sources, with the result and the file it comes from. Sun and Earth directions pass in all 16 cases; long-term sunlight matches NASA Goddard's maps to RMSE 0.06. Open problems and bugs are listed too.":
      "도구의 계산값을 외부 자료와 비교한 결과와 그 file을 모두 정리했습니다. 태양·지구 방향은 16개 모두 통과했고, 장기 평균 일조율은 NASA Goddard 지도와 RMSE 0.06으로 맞습니다. 남은 문제와 고친 bug도 함께 적었습니다.",
    "How we test that the tool's numbers are right. Each check will compare the tool with an outside source and name that source next to the result.":
      "도구의 계산값을 어떻게 검증하는지 설명합니다. 각 검증에서는 외부 자료와 계산값을 비교하고 결과 옆에 비교 자료의 출처를 표시합니다.",
    "In progress.": "개발 중입니다.",
    "The tool is still being built, so no checks have been run yet. Results will appear here as each check is done.":
      "도구는 개발 중이며 아직 검증을 수행하지 않았습니다. 검증이 완료되는 대로 이 페이지에 결과를 공개합니다.",
    "The sources this project uses, grouped by what they are used for, with a short note on each.":
      "프로젝트에서 사용한 자료를 용도별로 정리하고 각 자료에 대한 설명을 덧붙였습니다."
  };

  document.querySelectorAll("[data-language]").forEach(link => {
    const selected = link.dataset.language;
    const target = new URL(page);
    target.searchParams.set("lang", selected);
    link.href = target.href;
    link.classList.toggle("on", selected === lang);
    if (selected === lang) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });

  const directory = new URL(".", page);
  document.querySelectorAll("a[href]:not([data-language])").forEach(link => {
    const raw = link.getAttribute("href");
    if (!raw || raw.startsWith("#")) return;

    const target = new URL(link.href);
    if (target.protocol !== directory.protocol || target.host !== directory.host) return;
    if (!target.pathname.startsWith(directory.pathname)) return;

    const filename = target.pathname.slice(directory.pathname.length);
    if (!/^[^/]+\.html$/.test(filename)) return;

    target.searchParams.set("lang", lang);
    link.href = target.href;
  });

  document.querySelectorAll('form[action="search.html"]').forEach(form => {
    let input = form.querySelector('input[name="lang"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "lang";
      form.append(input);
    }
    input.value = lang;
  });

  if (!korean) return;

  if (!document.body) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest("script, style, code, pre, svg, [data-ko], .name a.event")) continue;
    const original = node.nodeValue.trim();
    if (Object.hasOwn(translations, original)) {
      node.nodeValue = node.nodeValue.replace(original, translations[original]);
    }
  }

  document.querySelectorAll("[data-ko]").forEach(element => {
    if (element.childElementCount === 0) element.textContent = element.dataset.ko;
  });

  document.querySelectorAll("[placeholder], [aria-label], [alt], [title]").forEach(element => {
    for (const name of ["placeholder", "aria-label", "alt", "title"]) {
      const value = element.getAttribute(name);
      if (Object.hasOwn(translations, value)) {
        element.setAttribute(name, translations[value]);
      }
    }
  });

  document.title = document.title.split(" - ")
    .map(part => translations[part] ?? part)
    .join(" - ");
})();
