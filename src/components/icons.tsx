import type { CSSProperties, SVGProps } from 'react';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

type SvgIcon = (props: IconProps) => JSX.Element;

function makeIcon(children: SVGProps<SVGSVGElement>['children']): SvgIcon {
  return function Icon({ size = 22, color = 'currentColor', strokeWidth = 1.7, style }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
        aria-hidden
      >
        {children}
      </svg>
    );
  };
}

export const HomeIcon: SvgIcon = makeIcon(
  <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9z" />,
);
export const ScanIcon: SvgIcon = makeIcon(
  <>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M4 12h16" />
  </>,
);
export const LayersIcon: SvgIcon = makeIcon(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </>,
);
export const BookIcon: SvgIcon = makeIcon(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h13v17H6a2 2 0 0 0-2 2V5z" />
    <path d="M4 19h15" />
  </>,
);
export const UserIcon: SvgIcon = makeIcon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </>,
);
export const BellIcon: SvgIcon = makeIcon(
  <>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </>,
);
export const SearchIcon: SvgIcon = makeIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const FilterIcon: SvgIcon = makeIcon(<path d="M4 6h16M7 12h10M10 18h4" />);
export const CloseIcon: SvgIcon = makeIcon(<path d="M6 6l12 12M18 6 6 18" />);
export const BackIcon: SvgIcon = makeIcon(<path d="M15 6l-6 6 6 6" />);
export const ShareIcon: SvgIcon = makeIcon(
  <>
    <path d="M12 4v12M7 9l5-5 5 5" />
    <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </>,
);
export const MoreIcon: SvgIcon = makeIcon(
  <>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" />
  </>,
);
export const PlusIcon: SvgIcon = makeIcon(<path d="M12 5v14M5 12h14" />);
export const MinusIcon: SvgIcon = makeIcon(<path d="M5 12h14" />);
export const CheckIcon: SvgIcon = makeIcon(<path d="m5 12 5 5 9-11" />);
export const ChevronIcon: SvgIcon = makeIcon(<path d="m9 6 6 6-6 6" />);
export const ChevronDownIcon: SvgIcon = makeIcon(<path d="m6 9 6 6 6-6" />);
export const HeartIcon: SvgIcon = makeIcon(
  <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
);
export const HeartFilledIcon: SvgIcon = ({ size = 22, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    style={style}
    aria-hidden
  >
    <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
  </svg>
);
export const BookmarkIcon: SvgIcon = makeIcon(<path d="M6 4h12v17l-6-4-6 4V4z" />);
export const BanIcon: SvgIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </>,
);
export const GalleryIcon: SvgIcon = makeIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m3 17 5-5 4 4 3-3 6 6" />
  </>,
);
export const FlashIcon: SvgIcon = makeIcon(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />);
export const GridIcon: SvgIcon = makeIcon(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </>,
);
export const ListIcon: SvgIcon = makeIcon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const SortIcon: SvgIcon = makeIcon(
  <>
    <path d="M7 4v16M7 4l-3 3M7 4l3 3" />
    <path d="M17 20V4M17 20l-3-3M17 20l3-3" />
  </>,
);
export const InfoIcon: SvgIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v5h1" />
  </>,
);
export const TrashIcon: SvgIcon = makeIcon(
  <>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
  </>,
);
export const DownloadIcon: SvgIcon = makeIcon(
  <>
    <path d="M12 4v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 20h14" />
  </>,
);
export const UploadIcon: SvgIcon = makeIcon(
  <>
    <path d="M12 20V8" />
    <path d="m7 13 5-5 5 5" />
    <path d="M5 4h14" />
  </>,
);
export const StarIcon: SvgIcon = makeIcon(
  <path d="m12 3 2.9 6 6.6.9-4.8 4.7 1.1 6.5L12 18l-5.8 3.1L7.3 14.6 2.5 9.9l6.6-.9L12 3z" />,
);
export const DecksIcon: SvgIcon = makeIcon(
  <>
    <rect x="2" y="6" width="16" height="14" rx="2" />
    <path d="M22 18V4a2 2 0 0 0-2-2H6" />
  </>,
);
