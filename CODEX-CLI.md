# 베에르으바아 Codex CLI 포크

- 포크 버전 `0.6.113-cli.1`
- 변경일 2026-11-13
- 원본 [foreverharibo-boop/veereubaa](https://github.com/foreverharibo-boop/veereubaa), 커밋 `61efe4f`
- 공용 서버 기반 [vatip13-spec/verba_cli](https://github.com/vatip13-spec/verba_cli/tree/f6ede57f26ad1293d8a55a50d1245402cd3fb324). 공용 서버의 원본은 담은의 [베르바](https://github.com/foreverharibo-boop/verba)입니다.
- 라이선스 AGPL-3.0-only. 원작자 및 출처는 [NOTICE](NOTICE)를 참고하세요.

## 설치

1. SillyTavern이 실행되는 환경에서 Codex CLI를 설치하고 같은 계정으로 `codex login`을 완료합니다.
2. SillyTavern을 종료합니다. 기존 베에르으바아 확장과 Verba 서버 플러그인이 설치되어 있으면, 백업 폴더를 SillyTavern이 읽는 확장·플러그인 경로 밖에 둡니다.
3. ZIP의 `veereubaa_cli` 폴더를 SillyTavern의 `data/default-user/extensions/` 안에 복사합니다. 다른 사용자 계정이나 데이터 경로를 사용하면 해당 계정의 확장 폴더를 사용하세요.
4. ZIP의 `veereubaa_cli/server-plugin` 폴더를 SillyTavern의 `plugins/verba-server`로 복사합니다. 최종 경로는 `plugins/verba-server/index.cjs`입니다. 베르바 CLI와 베에르으바아 CLI를 함께 설치할 때도 이 공용 서버 플러그인 한 사본을 사용합니다.
5. `config.yaml`의 `enableServerPlugins`를 `true`로 설정하고 SillyTavern을 재시작합니다.

이 포크의 공용 서버는 ZIP에서 수동으로 설치하세요. 원본의 `install-server.sh`는 원본 베르바 서버를 내려받습니다. 서버에서 CLI를 찾지 못하면 `VERBA_CODEX_EXECUTABLE` 환경 변수로 실행 파일 경로를 지정할 수 있습니다.

## 사용

1. **베에르으바아 설정 → 번역 엔진·연결 프로필 → Codex CLI 사용**을 체크합니다.
2. **GPT 모델**과 **리즈닝 강도**를 고릅니다.
3. **현재 AI 연결 테스트**를 눌러 선택한 CLI 모델의 번역 응답을 확인합니다.
4. 평소 쓰던 번역 버튼을 사용합니다. 체크를 끄면 이전에 선택한 번역 엔진과 연결 프로필로 돌아갑니다.
