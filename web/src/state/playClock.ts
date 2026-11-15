// 재생 중 3D 화면용 시계: 화면은 매 프레임 부드럽게 움직이고, 계산(현장 뷰·점수 등)은 지금처럼 일정 간격으로만 갱신한다.
// core 가 아니라 화면 쪽 상태다 (Date.now·performance 사용 가능).
export const playClock = { t: 0, playing: false };
