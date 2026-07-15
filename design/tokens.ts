/**
 * Apex-arena — 디자인 토큰 (Phase D 산출물, style-tile.html 기준 확정 2026-07-14)
 * 단일 소스. UI 크롬은 라이트/다크로 반응, 게임 월드는 재질 기반 고정색.
 * 컨셉: "레이스 텔레메트리 × 지형도".
 */

/** UI 크롬 — 테마 반응 (블루-그래파이트 뉴트럴 + 액센트) */
export const ui = {
  light: {
    ground: '#EAEEF3', surface: '#FFFFFF', surface2: '#F4F7FA',
    ink: '#101720', inkMuted: '#586372', inkFaint: '#8B94A2',
    hairline: '#DBE1E9', hairlineStrong: '#C4CCD7',
    signal: '#0FB9AA', signalStrong: '#0A8C80',   // 온로드 / 브랜드
    ember: '#F5622A', emberStrong: '#CB4315',      // 오프로드
    gold: '#B98A2E', goldBright: '#E7B24C',        // 레이싱라인 / 메달
    good: '#249B63', warn: '#C9902A', crit: '#CF4436',
  },
  dark: {
    ground: '#0A0D12', surface: '#12171F', surface2: '#171E27',
    ink: '#E7EDF4', inkMuted: '#98A2B2', inkFaint: '#606D7D',
    hairline: '#222A35', hairlineStrong: '#2F3946',
    signal: '#1FDDC9', signalStrong: '#63EFDD',
    ember: '#FF7A45', emberStrong: '#FFB089',
    gold: '#E7B24C', goldBright: '#F4CD7F',
    good: '#3FCE85', warn: '#E6B13F', crit: '#E46052',
  },
} as const;

/** 게임 월드 — 재질 기반 고정색 (테마와 무관) */
export const world = {
  road: {
    skyTop: '#1B2A35', skyBot: '#0E1922',
    asphalt: '#2B3742', asphaltHi: '#41505D', asphaltLo: '#1F2831',
    verge: '#243541', contour: 'rgba(120,220,210,.16)',
    car: '#1FDDC9', racingLine: '#E7B24C',
    curbA: '#D0443B', curbB: '#E6E9EC',
  },
  dirt: {
    skyTop: '#3A2C1E', skyBot: '#241A11',
    track: '#6E5236', trackHi: '#8B6942', trackLo: '#4C3927',
    terrain: '#3D2E1F', contour: 'rgba(240,190,120,.18)',
    car: '#FF7A45', racingLine: '#E7B24C', dust: '#E7CFA4',
  },
} as const;

/** 도메인 액센트 매핑 */
export const domainAccent = { road: 'signal', dirt: 'ember' } as const;

export const radius = { r1: 4, r2: 8, r3: 14 } as const;
export const space = [4, 8, 12, 20, 32] as const;

export const font = {
  display:
    '"SF Pro Display","Segoe UI Variable","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif',
  mono:
    'ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code","Roboto Mono",Menlo,Consolas,monospace',
} as const;

/** 메달 티어 색 */
export const medal = {
  bronze: { disc: '#B5763C', ink: '#A5622E' },
  silver: { disc: '#C7D0DB', ink: '#8B95A3' },
  gold: { disc: '#E7B24C', ink: '#B98A2E' },
  dev: { disc: '#1FDDC9', ink: '#0A8C80' },
} as const;

export type ThemeName = keyof typeof ui;
export type DomainName = keyof typeof world;
