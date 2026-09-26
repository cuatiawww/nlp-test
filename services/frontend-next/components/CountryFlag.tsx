"use client";

import React from "react";

export type FlagShape = "circle" | "rounded" | "square";
export type FlagSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface CountryFlagProps {
  countryCode?: string | null;
  countryName?: string | null;
  shape?: FlagShape;
  size?: FlagSize | number;
  className?: string;
  title?: string;
}

const sizeClasses: Record<FlagSize, string> = {
  xs: "w-3.5 h-3.5 min-w-[14px] max-w-[14px] max-h-[14px]",
  sm: "w-4 h-4 min-w-[16px] max-w-[16px] max-h-[16px]",
  md: "w-5 h-5 min-w-[20px] max-w-[20px] max-h-[20px]",
  lg: "w-6 h-6 min-w-[24px] max-w-[24px] max-h-[24px]",
  xl: "w-8 h-8 min-w-[32px] max-w-[32px] max-h-[32px]",
};

const pixelSizeMap: Record<FlagSize, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

const COUNTRY_NAME_ISO: Record<string, string> = {
  "democratic republic of the congo": "CD",
  "dr congo": "CD",
  "rd congo": "CD",
  "rd kongo": "CD",
  "dr kongo": "CD",
  "drc": "CD",
  "rdc": "CD",
  "cod": "CD",
  "cd": "CD",
  "republik demokratik kongo": "CD",
  uganda: "UG",
  nigeria: "NG",
  kenya: "KE",
  rwanda: "RW",
  ethiopia: "ET",
  ghana: "GH",
  sudan: "SD",
  "south sudan": "SS",
  "united kingdom": "GB",
  germany: "DE",
  france: "FR",
  netherlands: "NL",
  brazil: "BR",
  "south africa": "ZA",
  tanzania: "TZ",
};

function isoFromLabel(value?: string | null): string | null {
  const key = (value || "").trim().toLowerCase();
  return key ? COUNTRY_NAME_ISO[key] || null : null;
}

function normalizeCode(code?: string | null, name?: string | null): string {
  const named = isoFromLabel(name) || isoFromLabel(code);
  if (named) return named;
  if (code) {
    const c = code.trim().toUpperCase();
    if (["ID", "INA", "INDONESIA"].includes(c)) return "ID";
    if (["MY", "MYS", "MALAYSIA"].includes(c)) return "MY";
    if (["SG", "SGP", "SINGAPORE"].includes(c)) return "SG";
    if (["TH", "THA", "THAILAND"].includes(c)) return "TH";
    if (["PH", "PHL", "PHILIPPINES"].includes(c)) return "PH";
    if (["VN", "VNM", "VIETNAM", "VIET NAM"].includes(c)) return "VN";
    if (["BN", "BRN", "BRUNEI"].includes(c)) return "BN";
    if (["KH", "KHM", "CAMBODIA"].includes(c)) return "KH";
    if (["LA", "LAO", "LAOS"].includes(c)) return "LA";
    if (["MM", "MMR", "MYANMAR", "BURMA"].includes(c)) return "MM";
    if (["TL", "TLS", "TIMOR-LESTE", "TIMOR LESTE", "TIMOR"].includes(c)) return "TL";
    if (["CN", "CHN", "CHINA"].includes(c)) return "CN";
    if (["JP", "JPN", "JAPAN"].includes(c)) return "JP";
    if (["KR", "KOR", "KOREA"].includes(c)) return "KR";
    if (["IN", "IND", "INDIA"].includes(c)) return "IN";
    if (["AU", "AUS", "AUSTRALIA"].includes(c)) return "AU";
    if (["US", "USA", "UNITED STATES"].includes(c)) return "US";
    if (["GB", "GBR", "UK", "UNITED KINGDOM"].includes(c)) return "GB";
    if (["OUTSIDE_ASEAN", "OUTSIDE ASEAN", "GLOBAL", "WORLD"].includes(c)) return "GLOBAL";
    if (["ASEAN"].includes(c)) return "ASEAN";
  }
  if (name) {
    const n = name.trim().toLowerCase();
    if (n.includes("outside")) return "GLOBAL";
    if (n.includes("indonesia")) return "ID";
    if (n.includes("malaysia")) return "MY";
    if (n.includes("singapore")) return "SG";
    if (n.includes("thailand")) return "TH";
    if (n.includes("philippine")) return "PH";
    if (n.includes("vietnam") || n.includes("viet nam")) return "VN";
    if (n.includes("brunei")) return "BN";
    if (n.includes("cambodia") || n.includes("kampuchea")) return "KH";
    if (n.includes("laos") || n.includes("lao")) return "LA";
    if (n.includes("myanmar") || n.includes("burma")) return "MM";
    if (n.includes("timor")) return "TL";
    if (n.includes("china")) return "CN";
    if (n.includes("japan")) return "JP";
    if (n.includes("korea")) return "KR";
    if (n.includes("india")) return "IN";
    if (n.includes("australia")) return "AU";
    if (n.includes("asean")) return "ASEAN";
  }
  return "GLOBAL";
}

/* Vector Flag Renderers (viewBox 0 0 640 480) */
function SvgFlag({ code }: { code: string }) {
  switch (code) {
    case "ID":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#E70011" d="M0 0h640v240H0z" />
          <path fill="#FFFFFF" d="M0 240h640v240H0z" />
        </svg>
      );
    case "VN":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#DA251D" d="M0 0h640v480H0z" />
          <polygon
            fill="#FFFF00"
            points="320,105 358,222 481,222 381,294 419,411 320,339 221,411 259,294 159,222 282,222"
          />
        </svg>
      );
    case "TL":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#DC241F" d="M0 0h640v480H0z" />
          <polygon fill="#FFC72C" points="0,0 340,240 0,480" />
          <polygon fill="#000000" points="0,0 230,240 0,480" />
          <g transform="translate(75, 240) rotate(-30)">
            <polygon
              fill="#FFFFFF"
              points="0,-36 10,-10 37,-10 15,6 23,32 0,17 -23,32 -15,6 -37,-10 -10,-10"
            />
          </g>
        </svg>
      );
    case "TH":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#A51931" d="M0 0h640v480H0z" />
          <path fill="#F4F5F8" d="M0 80h640v320H0z" />
          <path fill="#2D2A4A" d="M0 160h640v160H0z" />
        </svg>
      );
    case "MY":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#CC0000" d="M0 0h640v480H0z" />
          <path stroke="#FFF" strokeWidth="34.28" d="M0 51.4h640M0 120h640M0 188.5h640M0 257.1h640M0 325.7h640M0 394.3h640M0 462.8h640" />
          <path fill="#000066" d="M0 0h330v274.3H0z" />
          <circle cx="140" cy="137" r="82" fill="#FFCC00" />
          <circle cx="162" cy="137" r="72" fill="#000066" />
          <polygon
            fill="#FFCC00"
            points="200,137 187,143 194,156 180,155 182,169 170,163 166,176 158,165 149,174 147,160 134,165 138,151 125,150 134,139 125,128 138,127 134,113 147,118 149,104 158,113 166,102 170,115 182,109 180,123 194,122 187,135"
          />
        </svg>
      );
    case "SG":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#ED2939" d="M0 0h640v240H0z" />
          <path fill="#FFFFFF" d="M0 240h640v240H0z" />
          <circle cx="115" cy="120" r="72" fill="#FFFFFF" />
          <circle cx="138" cy="120" r="64" fill="#ED2939" />
          <g fill="#FFFFFF">
            <polygon points="148,72 151,80 159,80 153,85 155,93 148,88 141,93 143,85 137,80 145,80" />
            <polygon points="172,95 175,103 183,103 177,108 179,116 172,111 165,116 167,108 161,103 169,103" />
            <polygon points="124,95 127,103 135,103 129,108 131,116 124,111 117,116 119,108 113,103 121,103" />
            <polygon points="135,135 138,143 146,143 140,148 142,156 135,151 128,156 130,148 124,143 132,143" />
            <polygon points="161,135 164,143 172,143 166,148 168,156 161,151 154,156 156,148 150,143 158,143" />
          </g>
        </svg>
      );
    case "PH":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#0038A8" d="M0 0h640v240H0z" />
          <path fill="#CE1126" d="M0 240h640v240H0z" />
          <polygon fill="#FFFFFF" points="0,0 350,240 0,480" />
          <circle cx="115" cy="240" r="32" fill="#FCD116" />
          <g fill="#FCD116">
            <polygon points="115,188 119,206 115,202 111,206" />
            <polygon points="115,292 119,274 115,278 111,274" />
            <polygon points="63,240 81,236 77,240 81,244" />
            <polygon points="167,240 149,236 153,240 149,244" />
            <polygon points="78,203 93,214 91,211 96,208" />
            <polygon points="152,277 137,266 139,269 134,272" />
            <polygon points="78,277 96,272 91,269 93,266" />
            <polygon points="152,203 134,208 139,211 137,214" />
            <polygon points="40,65 43,73 51,73 45,78 47,86 40,81 33,86 35,78 29,73 37,73" />
            <polygon points="40,415 43,423 51,423 45,428 47,436 40,431 33,436 35,428 29,423 37,423" />
            <polygon points="265,240 268,248 276,248 270,253 272,261 265,256 258,261 260,253 254,248 262,248" />
          </g>
        </svg>
      );
    case "LA":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#CE1126" d="M0 0h640v480H0z" />
          <path fill="#002868" d="M0 120h640v240H0z" />
          <circle cx="320" cy="240" r="95" fill="#FFFFFF" />
        </svg>
      );
    case "KH":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#032EA6" d="M0 0h640v480H0z" />
          <path fill="#E00025" d="M0 120h640v240H0z" />
          <g fill="#FFFFFF" transform="translate(200, 145) scale(0.5)">
            <path d="M240 40 L265 105 L290 105 L290 280 L190 280 L190 105 L215 105 Z" />
            <path d="M120 115 L140 160 L160 160 L160 280 L80 280 L80 160 L100 160 Z" />
            <path d="M360 115 L380 160 L400 160 L400 280 L320 280 L320 160 L340 160 Z" />
            <rect x="50" y="280" width="380" height="35" rx="3" />
            <rect x="30" y="320" width="420" height="25" rx="2" />
            <rect x="10" y="350" width="460" height="20" rx="2" />
          </g>
        </svg>
      );
    case "MM":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#FECB00" d="M0 0h640v160H0z" />
          <path fill="#34B233" d="M0 160h640v160H0z" />
          <path fill="#EA2839" d="M0 320h640v160H0z" />
          <polygon
            fill="#FFFFFF"
            points="320,60 365,195 505,195 392,277 435,410 320,326 205,410 248,277 135,195 275,195"
          />
        </svg>
      );
    case "BN":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#F7E017" d="M0 0h640v480H0z" />
          <polygon fill="#FFFFFF" points="0,0 640,320 640,400 0,80" />
          <polygon fill="#000000" points="0,80 640,400 640,480 0,160" />
          <g fill="#CC0000" transform="translate(250, 155) scale(0.75)">
            <circle cx="95" cy="110" r="55" fill="#CC0000" />
            <circle cx="95" cy="98" r="46" fill="#F7E017" />
            <rect x="86" y="25" width="18" height="120" fill="#CC0000" />
            <path d="M55 45 Q95 8 135 45 Q95 30 55 45" fill="#CC0000" />
            <path d="M30 110 Q50 160 95 168 Q140 160 160 110 Q95 145 30 110" fill="#CC0000" />
          </g>
        </svg>
      );
    case "CN":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#EE1C25" d="M0 0h640v480H0z" />
          <polygon fill="#FFFF00" points="160,80 178,136 237,136 189,171 207,227 160,192 113,227 131,171 83,136 142,136" />
          <polygon fill="#FFFF00" points="267,48 271,60 283,60 273,67 277,79 267,72 257,79 261,67 251,60 263,60" />
          <polygon fill="#FFFF00" points="320,96 324,108 336,108 326,115 330,127 320,120 310,127 314,115 304,108 316,108" />
          <polygon fill="#FFFF00" points="320,176 324,188 336,188 326,195 330,207 320,200 310,207 314,195 304,188 316,188" />
          <polygon fill="#FFFF00" points="267,224 271,236 283,236 273,243 277,255 267,248 257,255 261,243 251,236 263,236" />
        </svg>
      );
    case "JP":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#FFFFFF" d="M0 0h640v480H0z" />
          <circle cx="320" cy="240" r="144" fill="#BC002D" />
        </svg>
      );
    case "KR":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#FFFFFF" d="M0 0h640v480H0z" />
          <g transform="translate(320,240) rotate(-34)">
            <path d="M0,-120 A120,120 0 0,0 0,120 A60,60 0 0,0 0,0 A60,60 0 0,1 0,-120" fill="#CD2E3A" />
            <path d="M0,120 A120,120 0 0,0 0,-120 A60,60 0 0,0 0,0 A60,60 0 0,1 0,120" fill="#0047A0" />
          </g>
        </svg>
      );
    case "IN":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#FF9933" d="M0 0h640v160H0z" />
          <path fill="#FFFFFF" d="M0 160h640v160H0z" />
          <path fill="#128807" d="M0 320h640v160H0z" />
          <circle cx="320" cy="240" r="60" fill="none" stroke="#000080" strokeWidth="6" />
          <circle cx="320" cy="240" r="10" fill="#000080" />
        </svg>
      );
    case "AU":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#00008B" d="M0 0h640v480H0z" />
          <g transform="scale(0.5)">
            <path fill="#012169" d="M0 0h640v480H0z" />
            <path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-179L0 64V0h75z" />
            <path fill="#C8102E" d="m424 288 216 159v33h-44L366 317l58-29zM640 0v10L446 155l51 32L640 48V0zM0 480v-10l194-145-51-32L0 432v48zm0-480v10l194 145-51 32L0 48V0z" />
            <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
            <path fill="#C8102E" d="M272 0v480h96V0h-96zM0 192v96h640v-96H0z" />
          </g>
          <g fill="#FFFFFF">
            <polygon points="160,320 165,340 185,340 170,352 175,372 160,360 145,372 150,352 135,340 155,340" />
            <polygon points="480,100 483,110 493,110 485,116 488,126 480,120 472,126 475,116 467,110 477,110" />
            <polygon points="560,200 563,210 573,210 565,216 568,226 560,220 552,226 555,216 547,210 557,210" />
            <polygon points="480,380 483,390 493,390 485,396 488,406 480,400 472,406 475,396 467,390 477,390" />
            <polygon points="410,220 413,230 423,230 415,236 418,246 410,240 402,246 405,236 397,230 407,230" />
          </g>
        </svg>
      );
    case "GB":
    case "UK":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#012169" d="M0 0h640v480H0z" />
          <path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-179L0 64V0h75z" />
          <path fill="#C8102E" d="m424 288 216 159v33h-44L366 317l58-29zM640 0v10L446 155l51 32L640 48V0zM0 480v-10l194-145-51-32L0 432v48zm0-480v10l194 145-51 32L0 48V0z" />
          <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
          <path fill="#C8102E" d="M272 0v480h96V0h-96zM0 192v96h640v-96H0z" />
        </svg>
      );
    case "US":
    case "USA":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#B22234" d="M0 0h640v480H0z" />
          <path stroke="#FFF" strokeWidth="36.9" d="M0 55.4h640M0 129.2h640M0 203.1h640M0 276.9h640M0 350.8h640M0 424.6h640" />
          <path fill="#3C3B6E" d="M0 0h280v258.5H0z" />
          <g fill="#FFFFFF">
            <circle cx="60" cy="50" r="10" />
            <circle cx="140" cy="50" r="10" />
            <circle cx="220" cy="50" r="10" />
            <circle cx="100" cy="100" r="10" />
            <circle cx="180" cy="100" r="10" />
            <circle cx="60" cy="150" r="10" />
            <circle cx="140" cy="150" r="10" />
            <circle cx="220" cy="150" r="10" />
            <circle cx="100" cy="200" r="10" />
            <circle cx="180" cy="200" r="10" />
          </g>
        </svg>
      );
    case "CD":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#007FFF" d="M0 0h640v480H0z" />
          <path fill="#F7D618" d="M0 80 520 480h80L80 0H0z" />
          <path fill="#CE1021" d="M0 140 460 480h70L70 0H0z" />
          <polygon fill="#F7D618" points="95,55 108,95 150,95 116,120 129,160 95,135 61,160 74,120 40,95 82,95" />
        </svg>
      );
    case "OUTSIDE_ASEAN":
    case "GLOBAL":
    case "WORLD":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full p-0.5 bg-slate-100">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      );
    case "ASEAN":
      return (
        <svg viewBox="0 0 640 480" className="h-full w-full object-cover">
          <path fill="#003399" d="M0 0h640v480H0z" />
          <circle cx="320" cy="240" r="170" fill="#FFFFFF" />
          <circle cx="320" cy="240" r="154" fill="#EE1C25" />
          <g fill="#FFDF00" transform="translate(262, 130) scale(0.8)">
            <rect x="36" y="30" width="12" height="180" rx="4" />
            <rect x="52" y="18" width="12" height="204" rx="4" />
            <rect x="68" y="10" width="12" height="220" rx="4" />
            <rect x="84" y="18" width="12" height="204" rx="4" />
            <rect x="100" y="30" width="12" height="180" rx="4" />
            <ellipse cx="74" cy="130" rx="48" ry="16" fill="#003399" />
          </g>
        </svg>
      );
    default: {
      if (/^[A-Z]{2}$/.test(code)) {
        const emoji = Array.from(code).map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
        return <span className="flex h-full w-full items-center justify-center text-[11px] leading-none">{emoji}</span>;
      }
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full p-0.5 bg-slate-100">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      );
    }
  }
}

export default function CountryFlag({
  countryCode,
  countryName,
  shape = "circle",
  size = "sm",
  className = "",
  title,
}: CountryFlagProps) {
  const code = normalizeCode(countryCode, countryName);
  const displayTitle = title || countryName || countryCode || "Country Flag";

  const shapeClass =
    shape === "circle"
      ? "rounded-full aspect-square"
      : shape === "rounded"
        ? "rounded-[3px] aspect-[4/3]"
        : "rounded-none aspect-[4/3]";

  const sizeClass = typeof size === "string" ? sizeClasses[size] : "";
  const px = typeof size === "number" ? size : (pixelSizeMap[size] ?? 16);
  const isCircle = shape === "circle";
  const heightPx = isCircle ? px : Math.round(px * 0.75);

  const inlineStyle: React.CSSProperties = {
    width: px,
    height: heightPx,
    minWidth: px,
    minHeight: heightPx,
    maxWidth: px,
    maxHeight: heightPx,
    display: "inline-flex",
    flexShrink: 0,
    verticalAlign: "middle",
  };

  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 " +
        shapeClass +
        " " +
        sizeClass +
        " " +
        className
      }
      style={inlineStyle}
      title={displayTitle}
      aria-label={displayTitle}
    >
      <SvgFlag code={code} />
    </span>
  );
}

