import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </Svg>
);

export const LockIcon = ({ open = false, ...p }: IconProps & { open?: boolean }) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path className="icon-shackle" d={open ? 'M8 10.5V7.5a4 4 0 0 1 7.6-1.7' : 'M8 10.5V7.5a4 4 0 0 1 8 0v3'} />
  </Svg>
);

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
    <path d="M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18" />
    <circle cx="15.5" cy="9.5" r="1.3" />
  </Svg>
);

export const ArrowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5" />
  </Svg>
);

export const ArrowBackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M10.5 6.5L5 12l5.5 5.5" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);

export const TicketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.2a1.8 1.8 0 0 0 0 3.6V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.2a1.8 1.8 0 0 0 0-3.6z" />
    <path d="M14.5 7.5v9" strokeDasharray="1.5 2" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M8 7.5L12 3.5l4 4M6 11v8.5h12V11" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19.5s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.2-7 9.6-7 9.6z" />
  </Svg>
);
