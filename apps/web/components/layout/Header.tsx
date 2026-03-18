"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  const isMarketPage = pathname.startsWith("/market/");

  return (
    <header className="border-b border-border bg-surface sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-8 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src="/og-image.jpg"
              alt="PredictPro"
              width={28}
              height={28}
              className="w-7 h-7 rounded-lg object-cover"
            />
            <span className="text-white text-sm font-bold tracking-tight">PredictPro</span>
          </Link>
          {isMarketPage && (
            <Link
              href="/"
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              &larr; Markets
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-bid animate-pulse" />
            Live
          </div>
          <span className="text-border">|</span>
          <span>Polymarket + Kalshi</span>
        </div>
      </div>
    </header>
  );
}
