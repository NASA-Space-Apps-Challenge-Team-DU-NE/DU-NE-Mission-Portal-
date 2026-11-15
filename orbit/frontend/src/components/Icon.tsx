export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, JSX.Element> = {
    orbit: <><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-36 12 12)"/><circle cx="12" cy="12" r="3"/><path d="M19.2 5.1h.1" strokeWidth="4"/></>,
    play: <path d="m8 5 11 7-11 7Z"/>, pause: <><path d="M8 5v14M16 5v14" strokeWidth="3"/></>,
    reset: <><path d="M4 11a8 8 0 1 1 2 6M4 5v6h6"/></>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></>,
    moon: <><circle cx="12" cy="12" r="9"/><path d="M16 4c-5 3-5 13 0 16"/><path d="M4 8h2M7 14h2M13 9h1"/></>,
    layers: <><path d="m3 8 9-5 9 5-9 5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    down: <><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/></>,
    chevron: <path d="m8 5 7 7-7 7"/>,
    fuel: <><path d="M5 21V4h10v17M3 21h14M5 10h10m1-6 4 4v9a2 2 0 0 1-4 0v-3h-1"/></>,
    arrowdown: <path d="M12 3v18m-6-6 6 6 6-6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.orbit}</svg>;
}
