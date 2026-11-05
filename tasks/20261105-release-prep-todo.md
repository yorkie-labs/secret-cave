# 2026-11-05 · 출시 준비 (Release prep)

요청: "scary-island의 구성요소들을 체크하고 출시를 위해서 필요한 요소들을 점검해줘"
점검 원문: scratchpad/release/release-audit.md (읽기 전용 점검, Scary Island 출시 기록을 기준으로)

## 지금 상태
- 첫 커밋 `e942c8a` → `yorkie-labs/secret-cave` (비공개). Pages 배포 실패: 조직이 무료 요금제라 비공개 저장소는 Pages 불가.
- 이미 괜찮음: 빌드에 Polyfork GLB 없음(CDN 97개 모두 CORS 허용), 상대 경로, 깨끗한 로드에 콘솔 에러 없음, WebGL 없음 안내,
  저장 버전·손상 저장 처리, 제목·설명·파비콘, 플레이어에게 보이는 TODO 없음, 의존성 라이선스 모두 허용형, 추적 파일에 개인 경로 없음.

## Must
- [x] 호스팅 결정 (사용자): **A 공개 저장소 + Pages** (https://yorkie-labs.github.io/secret-cave/). 공개 전환·Pages 켜기·배포는 메인 세션이 검토 뒤에
- [x] 첫 로딩: 모델 87개(~16 MB) 첫 로드 95 s, 7번 중 5번 120 s 넘게 멈춤. 시간 제한·재시도·"느린 네트워크" 안내, 입구 모델 먼저, 실패 하나가 부팅 전체를 막지 않게 (`src/world/models.js`)
  - 받는 줄(16개씩, 8 s 멈춤이면 끊고 다시 ×3, 안 오면 소품은 빼고 동물은 대역), `FIRST_REGION`으로 1지역(47개 ~7 MB)만 기다림, 나머지는 뒤에서(앞 줄이 끝난 뒤), 주인공 지역 먼저. `whenReady`·`whenLoaded`·늦은 동물(`G.mergeScope`)·얼음 곰. 진행 막대 + 8 s 뒤 "인터넷이 조금 느린가 봐요…". 테스트 `test/models.test.js`
- [x] 저장소(localStorage) 막히면 부팅 실패 ("문제가 생겼어요: denied") — `src/core/state.js` 기본 인자가 try 밖
  - `src/core/storage.js`(한 번 시험, 막히면 메모리) → state·sound·main(sessionStorage). 제목에 "🔒 이 브라우저가 저장을 막고 있어요…". 단위 테스트 + 헤드리스(저장 막고 새 게임 → 플레이)
- [x] `?start=`·`?world=test`가 실제 저장을 덮어씀 → 개발 서버에서만
  - 프로덕션에서는 `?start=`·`?seed=`·`?world=`가 있으면, 또는 바깥에서 `window.G`를 만지면 시험용 칸(`secret-cave-sandbox-save-v1`)에 저장. 개발 서버는 그대로. 시나리오는 `G.saveKey`로 저장을 읽고, e2e는 시작 저장을 두 칸에 넣음
- [x] 프로덕션 빌드로 full.js + w5-mobile 완주 (결과는 Review)
- [ ] 지유 확인: 플레이 테스트, 주인공 이름, 도감 문구, 크레딧

## Should
- [x] README: 플레이 링크, 작업 기록 정리(→ `tasks/20261105-readme-status-log.md`). 저장소 설명·홈페이지(`gh repo edit`)는 메인 세션이 공개 때
- [x] 링크 미리보기(OG) 태그 + 1200×630 이미지 (`public/og.jpg`, 84 KB, 캠프 장면 + 제목)
- [x] 게임 크레딧에 postprocessing·N8AO (+ 라이선스 전문 링크)
- [x] 서드파티 라이선스 파일 배포 (`vite.config.js`가 `dist/THIRD_PARTY_LICENSES.txt`를 만듦)
- [x] 휴대폰 기본 `?q=low` (터치 + 짧은 변 ≤ 820 px), 메뉴 "화질: 높음/낮음"(바로 바뀌고 남음), 주소 `?q=`가 우선
- [x] LICENSE 파일 결정(없음 = all rights reserved, Scary Island와 같음, README에 적음) / `docs/polyfork-survey.md`는 우리가 쓰는 id와 이유만(55 → 9 KB). 추적 파일에 개인 경로 없음(`cozy-look-todo.md`의 /private/tmp 경로 지움)

## After
- [x] CI 액션 Node 20 → 최신 (checkout@v7, setup-node@v7, upload-pages-artifact@v5, deploy-pages@v5; 빌드는 Node 22 그대로)
- [ ] 긴 세션 메모리, 저장 v2 마이그레이션 계획, 콘셉트 아트

## Review

### 결과 (2026-11-06, 하위 에이전트; 커밋·공개·배포는 메인 세션)

**첫 로딩** (프로덕션 빌드 `vite preview`, 새 브라우저 컨텍스트 = 빈 캐시, 제목 = 로딩 끝, 플레이 = 새 게임 → 인트로 건너뛰기 → 입구). 이날 CDN은 빨랐다(95 s 날과 다름): 그래서 대역 제한과 멈춤을 만들어 같은 조건으로 쟀다(`scratchpad/release/cold2.mjs`).

| 조건 | 전: 제목 / 플레이 | 후: 제목 / 플레이 / 모든 모델 |
|---|---|---|
| 보통 회선 | 2.7 s / 3.7 s | 2.6–2.9 s / 3.8–3.9 s / 3.9–4.9 s |
| 9 Mbps(4G) | 18.3 s / 19.3 s | **9.9 s / 10.9 s** / 18.9 s |
| 요청 6개 중 1개가 영영 답 없음 | **끝나지 않음**(180 s, "73/87"에서 멈춤) | 11.5 s / 12.5 s / 22.5 s |
| 9 Mbps + 멈춤 | (끝나지 않음) | 16.1 s / 17.1 s / 31.1 s, 8 s부터 "인터넷이 조금 느린가 봐요…" |

제목 전에 받는 것: 87개 16 MB → 47개 7.2 MB(1지역). 빠진 모델 0, 콘솔 오류 0.

**확인**
- `npm test` 274개 통과(새 `test/models.test.js` 9개: 지역 표 ↔ 세계 데이터, 줄 순서·멈춤 재시도·HTTP 오류 재시도·자리표시·대역; `game-state.test.js` 저장 막힘·시험용 칸 4개), `npm run build` 통과(`dist/THIRD_PARTY_LICENSES.txt`, `og.jpg`, .glb 없음)
- 프로덕션 빌드(5193): `full.js`(`?seed=4`, 시험용 칸) **82 통과 0 실패**(13.7분 게임 시간, 884 s), `w5-mobile.js` 세로 22/22·가로 22/22
- 개발 서버(5192) 시나리오 전부: 아래 표
- 헤드리스 확인(`scratchpad/release/release-check.mjs`): 저장 막힘 → 제목 안내 + 새 게임 → 플레이 / 실제 저장(별 2)이 있는 상태에서 `?start=heart&seed=4` → 실제 저장 그대로, 시험용 칸에만 보스 셋 / `window.G`로 점프·저장 → 시험용 칸 / 휴대폰 기본 낮음 → 메뉴에서 높음 → 새로 고침 뒤 높음 → `?q=low`가 우선 / 데스크톱 높음 ⇄ 낮음 바로 바뀜 / 엔딩 크레딧에 postprocessing·N8AO·라이선스 링크
- 스크린샷: `scratchpad/shots/release/` (loading-slow, storage-blocked-title, menu-quality-*, credits, og.jpg)

**개발 서버(5192) 시나리오 전부** — 모두 실패 0, 콘솔 오류 0, 빠진 모델 0:

| 시나리오 | 통과 | 실패 | 시간 |
|---|---|---|---|
| w0-terrain | 28 | 0 | 97s |
| w1-valley | 34 | 0 | 174s |
| w1-chief | 32 | 0 | 125s |
| w1-shots | 1 | 0 | 57s |
| w2-forest | 27 | 0 | 88s |
| w2-queen | 18 | 0 | 96s |
| w2-shots | 7 | 0 | 89s |
| m6a-enemies | 40 | 0 | 47s |
| m6a-shop | 22 | 0 | 15s |
| m6a-boss | 23 | 0 | 55s |
| w3-lake | 24 | 0 | 119s |
| w3-icebear | 19 | 0 | 93s |
| w3-shots | 5 | 0 | 57s |
| w4-heart | 26 | 0 | 131s |
| w4-king | 28 | 0 | 314s |
| w4-shots | 4 | 0 | 88s |
| w5-altar | 21 | 0 | 30s |
| w5-codex | 19 | 0 | 12s |
| w5-secrets | 38 | 0 | 55s |
| w5-mobile-MOBILE-1 | 22 | 0 | 320s |
| w5-mobile-MOBILE-landscape | 22 | 0 | 46s |
| w6-descent | 9 | 0 | 96s |
| w6-pick | 9 | 0 | 124s |
| w7-combat | 38 | 0 | 46s |
| w7-items | 43 | 0 | 56s |
| w7-rabbit | 18 | 0 | 14s |
| w8-intro | 22 | 0 | 16s |
| w8-intro-MOBILE-1 | 9 | 0 | 7s |
| k1-look | 0 | 0 | 52s |
| m1-gallery | 0 | 0 | 12s |
| full | 83 | 0 | 858s |

(k1-look·m1-gallery는 확인 항목 없이 성능·그림만: 오류 없이 끝남)

**지유 확인이 남은 것**: 플레이 테스트, 주인공 이름(GDD §14 #1), 도감 문구(`src/data/codex.js`), 엔딩 크레딧 문구(`src/ui/story.js` `CREDITS`).
**메인 세션이 할 것**: 커밋, 저장소 공개 + Pages 켜기(`build_type=workflow`) + 배포, 저장소 설명·홈페이지, 배포된 주소에서 첫 로딩 다시 재기.
**참고**: n8ao는 package.json이 ISC인데 함께 오는 LICENSE 파일은 CC0 1.0(둘 다 허용형; 라이선스 파일에는 둘 다 적힘).
