import React from "react";

type Props = {
  platform?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | number;
  className?: string;
};

const pixelSizes: Record<string, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
};

export default function SocialMediaIcon({ platform, size = "sm", className = "" }: Props) {
  const px = typeof size === "number" ? size : pixelSizes[size] || 16;
  const lower = (platform || "").toLowerCase();

  const containerStyle: React.CSSProperties = {
    width: px,
    height: px,
    minWidth: px,
    minHeight: px,
    maxWidth: px,
    maxHeight: px,
  };

  // TikTok
  if (lower.includes("tiktok")) {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-black shadow-sm overflow-hidden ${className}`}
        title="TikTok"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-[75%] w-[75%]">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.8.1V9.01a6.31 6.31 0 0 0-.8-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.78a8.21 8.21 0 0 0 3.77.92V6.69Z" />
        </svg>
      </span>
    );
  }

  // Instagram
  if (lower.includes("instagram")) {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shadow-sm overflow-hidden ${className}`}
        title="Instagram"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[70%] w-[70%]">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" strokeWidth="2.5" />
        </svg>
      </span>
    );
  }

  // Facebook
  if (lower.includes("facebook") || lower.includes("fb")) {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#1877F2] shadow-sm overflow-hidden ${className}`}
        title="Facebook"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-[80%] w-[80%]">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </span>
    );
  }

  // X / Twitter
  if (lower.includes("twitter") || lower.includes("x (") || lower === "x") {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-black shadow-sm overflow-hidden ${className}`}
        title="X (Twitter)"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-[65%] w-[65%]">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </span>
    );
  }

  // Reddit
  if (lower.includes("reddit")) {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#FF4500] shadow-sm overflow-hidden ${className}`}
        title="Reddit"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-[75%] w-[75%]">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-4.766 4.31a.343.343 0 0 0-.12.474c.489.824 1.368 1.24 2.136 1.24.768 0 1.647-.416 2.136-1.24a.343.343 0 0 0-.59-.35c-.347.585-.972.87-1.546.87-.574 0-1.199-.285-1.546-.87a.343.343 0 0 0-.47-.124z" />
        </svg>
      </span>
    );
  }

  // YouTube
  if (lower.includes("youtube")) {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#FF0000] shadow-sm overflow-hidden ${className}`}
        title="YouTube"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-[75%] w-[75%]">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      </span>
    );
  }

  // Telegram
  if (lower.includes("telegram")) {
    return (
      <span
        style={containerStyle}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#24A1DE] shadow-sm overflow-hidden ${className}`}
        title="Telegram"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-[75%] w-[75%]">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.871-1.02 4.887-1.455 7.213-.184.985-.548 1.314-.897 1.346-.763.07-1.341-.504-2.08-1.002-1.157-.779-1.811-1.264-2.935-2.025-1.298-.879-.456-1.362.284-2.152.193-.207 3.553-3.35 3.618-3.633.008-.035.015-.167-.061-.237-.076-.07-.189-.046-.27-.028-.115.026-1.954 1.275-5.518 3.753-.522.37-1.006.55-1.442.541-.482-.01-1.41-.281-2.1-.506-.848-.276-1.521-.422-1.463-.892.03-.245.36-.496.99-.753 3.882-1.74 6.471-2.888 7.766-3.444 3.697-1.584 4.464-1.86 4.965-1.869.11-.002.355.027.514.161.134.113.171.266.189.374-.001.08-.009.289-.026.438z" />
        </svg>
      </span>
    );
  }

  // Fallback Social Icon (Purple sphere with share icon)
  return (
    <span
      style={containerStyle}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-purple-600 text-white shadow-sm overflow-hidden ${className}`}
      title={platform || "Social Media"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[60%] w-[60%]">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
        <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
      </svg>
    </span>
  );
}
