import logoWhite from "./assets/logo-white.svg";
import logoBlack from "./assets/logo-black.svg";

// Brand wordmark follows the theme: white ink on dark, black ink on light.
export function brandLogo(theme) {
  return theme === "light" ? logoBlack : logoWhite;
}

export { logoBlack, logoWhite };
