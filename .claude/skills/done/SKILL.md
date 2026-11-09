---
name: done
description: 사진 일기장(하루 한 장) 하루 작업 마무리. git 커밋 → GitHub push → 개발일지(Claude Docs) 추가를 한 번에 한다.
disable-model-invocation: true
---

# 작업 마무리 (하루 한 장)

사용자가 `/done` 또는 "늘 마지막에 하는 거 다 해 줘"라고 하면 아래 순서로 한다. 중간에 묻지 말고, 결과는 마지막에 짧게 한 번에 알린다.

## 1. git 커밋
- 폴더: `바탕 화면\new\photo-diary`
- `git status`로 바뀐 파일을 보고, 앱과 관계없는 임시 파일이 섞였는지 확인한다.
- 바뀐 게 있으면 `sw.js`의 `CACHE` 버전 숫자를 1 올린다 (아이폰이 새 버전을 받도록).
- `git add -A` 후 커밋. 메시지는 한국어로, 오늘 한 일을 쉼표로 이어 한 줄. 끝에 시스템이 정한 Co-Authored-By 줄을 붙인다.
- 바뀐 게 없으면 커밋은 건너뛴다.

## 2. GitHub push
- `git push` (origin = https://github.com/siu1221/photo-diary, main). push하면 1~2분 뒤 https://siu1221.github.io/photo-diary/ 에 반영된다.
- 실패하면 오류를 쉬운 말로 알리고, 나머지 단계는 계속한다.
- 이 저장소는 공개(GitHub Pages 무료 조건)라는 점을 기억: 비밀번호·개인 정보는 절대 커밋하지 않는다.

## 3. 개발일지 (Claude Docs)
- 문서: "하루 한 장 개발일지" — https://claude.ai/artifact/NDU6d49FaC7qz4B65TW6Ue
  (문서 id `abcd8942-9fc3-46af-b2a2-482346bcfddf`, 본문 노드 id `50dc27a1-9fff`)
- docs 스킬을 먼저 불러온 뒤, 문서를 **먼저 읽고** 마지막 일차를 확인한다.
- 오늘 날짜 일차가 이미 있으면 새로 만들지 말고 그 항목 목록 끝에 불릿을 덧붙인다.
  없으면 문서 끝에 `## N일차 — M월 D일 (요일)` + 한 줄 요약 + 불릿으로 새 항목을 추가한다.
- 앱 기능·디자인·고친 문제 위주로 쓴다. 테스트 도구, 설치 오류, 자동화 설정 같은 작업 기록은 뺀다.

## 끝 보고 (예)
```
- 커밋: "사진 여러 장 편집, …" (push 완료)
- 개발일지: 3일차 추가
```
