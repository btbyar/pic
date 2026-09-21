import type { ReactNode, SVGProps } from 'react';

/** Жижиг шугаман дүрс тэмдгүүд (emoji утас бүрт өөр харагддаг тул). Өнгө нь currentColor. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function icon(paths: ReactNode) {
  return function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const CalendarIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </>,
);

export const PinIcon = icon(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>,
);

export const ImagesIcon = icon(
  <>
    <rect x="7" y="3" width="14" height="14" rx="2" />
    <path d="M3 7v12a2 2 0 0 0 2 2h12" />
    <path d="m7 13 3.5-3.5a1.5 1.5 0 0 1 2 0L17 14" />
  </>,
);

export const CameraIcon = icon(
  <>
    <path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5Z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
);

export const ApertureIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m14.3 8 5.7 9.9M9.7 8h11.5M7.4 12l5.7-9.9M9.7 16 4 6.1M14.3 16H2.8M16.6 12l-5.7 9.9" />
  </>,
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

export const ScanFaceIcon = icon(
  <>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </>,
);

export const DownloadIcon = icon(
  <>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);

export const LockIcon = icon(
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>,
);

export const ArrowRightIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />);

export const ArrowLeftIcon = icon(<path d="M19 12H5M11 6l-6 6 6 6" />);

export const TagIcon = icon(
  <>
    <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
  </>,
);

export const XIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);

export const CheckIcon = icon(<path d="m5 12 5 5L20 7" />);

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

export const ChevronLeftIcon = icon(<path d="m15 18-6-6 6-6" />);

export const ChevronRightIcon = icon(<path d="m9 18 6-6-6-6" />);

export const ExternalLinkIcon = icon(<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />);

export const UserIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);

export const PrinterIcon = icon(
  <>
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M6 14h12v7H6z" />
  </>,
);

export const QrIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
  </>,
);

export const ShareIcon = icon(
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </>,
);

export const LinkIcon = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </>,
);

export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);

export const CartIcon = icon(
  <>
    <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
    <circle cx="9" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </>,
);

export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
  </>,
);

export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);

export const HomeIcon = icon(<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />);

export const WalletIcon = icon(
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M16 12.5h2M3 9.5h18" />
  </>,
);

export const UploadIcon = icon(<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" />);

export const AlertIcon = icon(
  <>
    <path d="M12 3 22 21H2z" />
    <path d="M12 10v5M12 18v.5" />
  </>,
);

export const RefreshIcon = icon(<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />);
