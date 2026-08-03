/**
 * Hang so dung chung cho admin control-plane.
 * Tach ra khoi admin-panel.tsx de bang mau va boot log khong bi chon
 * giua hon nghin dong JSX.
 */
import { APP_VERSION_LABEL } from "../../lib/version";

/** Bang mau cua control-plane. Doi o day la doi toan bo panel. */
export const ADMIN_COLORS = {
  green: "#00FF9C",
  blue: "#00D4FF",
  amber: "#F59E0B",
  red: "#F43F5E",
  purple: "#A855F7",
} as const;

export const consoleBoot = [
  `[sys] mindgem-db admin control-plane ${APP_VERSION_LABEL}`,
  "[auth] super_admin session verified :: Hữu Mạnh",
  "[pg] connection pool established (max=100)",
  "[rls] row-level-security policies loaded",
];
