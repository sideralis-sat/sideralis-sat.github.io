const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const SearchIcon = () => <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
export const CloseIcon = () => <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const ChevronIcon = () => <svg {...base} width={12} height={12}><path d="m6 9 6 6 6-6" /></svg>
export const PlusIcon = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
export const MinusIcon = () => <svg {...base}><path d="M5 12h14" /></svg>
export const HomeIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></svg>
export const TiltIcon = () => <svg {...base}><path d="M3 18h18M6 18l4-10h4l4 10" /></svg>
export const TargetIcon = () => <svg {...base}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
export const FollowIcon = () => <svg {...base}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3.5" /></svg>
export const CopyIcon = () => <svg {...base}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
export const CheckIcon = () => <svg {...base} width={11} height={11} strokeWidth={3}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
export const PlayIcon = () => <svg {...base} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
export const PauseIcon = () => <svg {...base} fill="currentColor" stroke="none"><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></svg>
export const ReverseIcon = () => <svg {...base}><path d="M10 7 5 12l5 5M5 12h14" /></svg>
export const BookIcon = () => <svg {...base}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></svg>
export const GlobeIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></svg>
/** Cúpula celeste con el punto del cénit */
export const ZenithIcon = () => <svg {...base}><path d="M3 18a9 9 0 0 1 18 0M2 18h20" /><circle cx="12" cy="6.5" r="1.6" fill="currentColor" /></svg>
export const ShareIcon = () => <svg {...base}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>
export const CompareIcon = () => <svg {...base}><path d="M8 4v16M16 4v16M4 8h4M16 16h4" /></svg>
export const ChartIcon = () => <svg {...base}><path d="M4 20V4M4 20h16" /><circle cx="9" cy="14" r="1.2" fill="currentColor" /><circle cx="13" cy="10" r="1.2" fill="currentColor" /><circle cx="17" cy="7" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /></svg>
export const RocketIcon = () => <svg {...base}><path d="M12 3c3 2.2 4.5 5.4 4.5 9.2V16h-9v-3.8C7.5 8.4 9 5.2 12 3Z" /><path d="M7.5 13 5 16v3l2.5-1.5M16.5 13 19 16v3l-2.5-1.5M10 19.5c.5 1 1.2 1.5 2 1.5s1.5-.5 2-1.5" /><circle cx="12" cy="9.5" r="1.4" /></svg>
export const HelpIcon = () => <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg>
export const UpIcon = () => <svg {...base}><path d="m6 15 6-6 6 6" /></svg>
export const DownIcon = () => <svg {...base}><path d="m6 9 6 6 6-6" /></svg>
