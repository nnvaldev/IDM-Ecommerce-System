// Iconos SVG ligeros — evita una dependencia extra.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (children: React.ReactNode) =>
  function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="20"
        height="20"
        {...props}
      >
        {children}
      </svg>
    );
  };

export const HomeIcon = base(
  <>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v10h14V10" />
  </>
);

export const PackageIcon = base(
  <>
    <path d="m21 8-9-5-9 5 9 5 9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="m12 13 9-5" />
    <path d="m12 13-9-5" />
    <path d="M12 13v8" />
  </>
);

export const CartIcon = base(
  <>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
    <path d="M3 4h2l2.5 12h12L22 7H6" />
  </>
);

export const TruckIcon = base(
  <>
    <path d="M3 7h11v9H3z" />
    <path d="M14 10h4l3 3v3h-7z" />
    <circle cx="7" cy="18" r="1.5" />
    <circle cx="17" cy="18" r="1.5" />
  </>
);

export const ReceiptIcon = base(
  <>
    <path d="M5 3v18l3-2 3 2 3-2 3 2 3-2V3z" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </>
);

export const UsersIcon = base(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    <circle cx="17" cy="6" r="2.8" />
    <path d="M14 13.5c4.2-.8 8 1.4 8 5.5" />
  </>
);

export const ChartIcon = base(
  <>
    <path d="M3 3v18h18" />
    <path d="M7 14l3-3 4 4 5-7" />
  </>
);

export const SettingsIcon = base(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>
);

export const QrIcon = base(
  <>
    <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" />
    <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 19h2M19 14h2" />
  </>
);

export const PlusIcon = base(<path d="M12 5v14M5 12h14" />);
export const EditIcon = base(
  <>
    <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
    <path d="M18.5 2.5a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4z" />
  </>
);
export const TagIcon = base(
  <>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </>
);
export const TrashIcon = base(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M9 6V4h6v2M10 11v6M14 11v6" />
  </>
);
export const SearchIcon = base(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
export const LogoutIcon = base(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>
);
export const CheckIcon = base(<path d="m5 12 5 5 9-12" />);
export const XIcon = base(<path d="M6 6l12 12M6 18 18 6" />);
export const AlertIcon = base(
  <>
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.4 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0z" />
  </>
);
