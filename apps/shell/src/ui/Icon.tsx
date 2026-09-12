const paths = {
  search: 'M21 21l-5-5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  moon: 'M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z',
  reset: 'M3 10a9 9 0 1 1 1 7M3 3v7h7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  focus: 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'm5 15 7-7 7 7',
  close: 'm6 6 12 12M6 18 18 6',
  folder: 'M3 6h7l2 3h9v11H3V6Z',
  link: 'm10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  chevron: 'm6 9 6 6 6-6',
  check: 'm5 12 4 4L19 6',
} as const;

export interface IconProps { name: keyof typeof paths; size?: number }

export function Icon({ name, size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}
