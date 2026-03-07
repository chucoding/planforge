# Installation

## 1. 다른 프로젝트에서 전역으로 쓰기 (권장)

PlanForge 레포에서 한 번만 실행:

```bash
cd path/to/planforge
pnpm run install:global
```

또는 직접:

```bash
cd path/to/planforge
pnpm run build:cli
npm install -g ./packages/cli-js
```

이후 **어떤 폴더**에서든:

```bash
planforge init
planforge doctor
planforge plan design auth system
```

코드를 수정한 뒤에는 다시 `pnpm run install:global` 한 번 실행하면 됩니다.

---

## 2. 레포 안에서만 테스트

PlanForge 폴더 안에서:

```bash
# 방법 A: 스크립트로 실행
pnpm run planforge -- init
pnpm run planforge -- doctor

# 방법 B: Windows에서 .cmd 사용 (빌드 후)
pnpm run build:cli
planforge.cmd init
planforge.cmd doctor
```

---

## 3. npm 공개 배포 후 (나중에)

```bash
npm install -g planforge
```

---

## Initialize

프로젝트 루트에서:

```bash
planforge init
```

---

## Python (선택)

```bash
pip install -e ./packages/cli-py
planforge init
```
