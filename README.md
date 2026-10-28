# blog

https://blog.nulleekh.com 의 소스. `posts/`의 Markdown을 직접 짠 Node 빌더로 정적 HTML로 만들고, GitHub Actions로 GitHub Pages에 배포합니다.

```bash
pnpm install       # Node 24+
pnpm dev           # http://127.0.0.1:8080, 초안 포함
pnpm test
pnpm build         # dist/, 초안 제외
pnpm new my-post   # 템플릿으로 새 초안 (--folder: 그림을 옆에 두는 폴더 글)
```

## 글

| 형태 | 파일 | 주소 |
|---|---|---|
| 파일 하나 | `posts/2026-10-03-hello-world.md` | `/posts/hello-world/` |
| 폴더 | `posts/2026-11-01-build-log/index.md` + 그림 | `/posts/build-log/` |

파일 이름의 날짜가 게시일, 뒤쪽이 slug(영어 소문자, 숫자, `-`)입니다.

```yaml
---
title: 제목                 # 필수
description: 한 줄 요약     # 선택
category: 개발              # 선택, 하나
tags: [태그, 태그]          # 선택
updated: 2026-10-05         # 선택
draft: true                 # 선택, 배포에서 제외
---
```

쓸 수 있는 문법(코드 블록 옵션, 수식, Mermaid, 알림 등)은 `templates/0000-00-00-title.md`에 예시로 모여 있습니다. 형식이 틀리면 빌드가 파일 경로와 함께 멈춥니다.

## 커밋

`<종류>: <내용>`, commitlint가 검사합니다.

| 종류 | 언제 |
|---|---|
| `post` | 새 글 공개 |
| `edit` | 공개된 글 수정 |
| `draft` | 초안 저장 |
| `site` | 디자인, 코드, 설정 |

## 배포

`main`에 push하면 배포됩니다(`.github/workflows/deploy.yml`). 사이트 설정(주소, 댓글, 검색엔진 확인 코드)은 `build.mjs` 맨 위 `site`에 있습니다. 댓글은 [giscus](https://giscus.app)로 `nulLeeKH/blog-comments`의 Discussions에 저장됩니다.

## 라이선스

- 글: © nulLeeKH
- 폰트: [D2Coding](https://github.com/naver/d2codingfont) 1.3.3, SIL Open Font License 1.1 (`static/fonts/OFL.txt`). 원본을 WOFF2로 압축만 했습니다.
- 그 밖의 의존성은 각자의 라이선스를 따릅니다.

Built by [BURGESS1977™](https://studio.nulleekh.com)
