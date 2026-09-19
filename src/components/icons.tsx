// Small monochrome line icons for the toolbar. Plain emoji were used before,
// but emoji render in their own fixed native colors regardless of CSS
// `color`, so they clashed with the app's palette — these use `currentColor`
// and inherit whatever color their containing button sets.

const common = { width: 15, height: 15, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor" };

export function FocusIcon() {
  return (
    <svg {...common} strokeWidth={1.6} strokeLinecap="round">
      <path d="M6 3H4a1 1 0 0 0-1 1v2" />
      <path d="M14 3h2a1 1 0 0 1 1 1v2" />
      <path d="M6 17H4a1 1 0 0 1-1-1v-2" />
      <path d="M14 17h2a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg {...common} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...common} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16V10" />
      <path d="M10 16V4" />
      <path d="M16 16v-7" />
    </svg>
  );
}

export function LayersIcon() {
  return (
    <svg {...common} strokeWidth={1.6} strokeLinejoin="round">
      <path d="M10 3 3 7l7 4 7-4-7-4Z" />
      <path d="m3 10 7 4 7-4" />
      <path d="m3 13 7 4 7-4" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg {...common} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h4l.5 5.5L15 10.5V12H5v-1.5l2.5-2z" />
      <path d="M10 12v5" />
    </svg>
  );
}
