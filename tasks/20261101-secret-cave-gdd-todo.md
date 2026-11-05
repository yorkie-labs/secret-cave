# 2026-11-01 · Secret Cave 기획서 정리 (docs/GDD.md)

요청: ChatGPT에서 만든 기획서 docx가 만료돼 받을 수 없음 → 대화 내용(v1 스토리, v2 3D 명세,
docx 요약)을 바탕으로 이미지가 들어가는 기획서를 `docs/`에 Markdown으로 다시 작성.

## 결정 (사용자)
- 조작: Scary Island의 디아블로식 (WASD·3인칭 백뷰·Godot 안 씀)
- 형식: `docs/GDD.md` + `docs/images/`

## Todo
- [x] ChatGPT 대화 전체 읽기, docx 다운로드 시도 (실패: 파일 만료)
- [x] Scary Island README·CLAUDE.md·tasks 확인 (조작, HUD, 소스 구조)
- [x] v1·v2의 어긋난 부분을 `[call]`로 정리 (아이템 개수·자리, 갑옷, 약점, 목걸이, 체력 단위)
- [x] `docs/GDD.md` 작성 (15개 장)
- [x] `docs/images/README.md` — 이미지 목록과 생성 프롬프트
- [ ] 콘셉트 아트 13장 넣기 (사용자)
- [ ] 딸과 `[call]` 15개 검토 (GDD §14)

## Review
- 2026-11-01: 문서 작성 완료. 이미지 파일은 아직 없어 GDD의 이미지 자리에는 대체 텍스트만 보인다.
  기술 섹션은 Island 실제 소스 구조(`src/player/isoCamera.js`, `systems/pointer.js`·`nav.js`,
  `world/cave.js`, `ui/hud.js` 등)에 맞춰 썼다.
