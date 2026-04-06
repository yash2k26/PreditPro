"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { SECTION_LABEL, SECTION_ORDER } from "../../lib/market-sections";

function CategoryNav() {
  const pathname = usePathname();
  const activeSection = pathname === "/" ? "trending" : pathname.startsWith("/category/") ? (pathname.split("/")[2] ?? null) : null;
  const [hoverCat, setHoverCat] = useState<string | null>(activeSection);

  // Sync when route changes
  useEffect(() => {
    setHoverCat(activeSection);
  }, [activeSection]);

  return (
    <div className="w-full px-4 sm:px-6 pb-3 pt-1.5">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {SECTION_ORDER.map((section, idx) => {
          const href = section === "trending" ? "/" : `/category/${section}`;
          const isTrending = section === "trending";

          return (
            <motion.div
              key={section}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + idx * 0.03, duration: 0.3 }}
              onMouseEnter={() => setHoverCat(section)}
              onMouseLeave={() => setHoverCat(activeSection ?? null)}
              whileHover={isTrending ? "hover" : undefined}
              className="relative overflow-hidden"
            >
              {hoverCat === section && hoverCat !== activeSection && (
                <motion.div
                  layoutId="cat-hover"
                  className="absolute inset-0 rounded-[10px] bg-surface-hover/60 border border-border/40"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              {activeSection === section && (
                <motion.div
                  layoutId="cat-active"
                  className="absolute inset-0 rounded-[10px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border border-border/60"
                  style={{ inset: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <Link
                href={href}
                className={`relative z-10 whitespace-nowrap px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  activeSection === section ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {isTrending && (
                  <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.8"
                    stroke="currentColor"
                    className="w-3.5 h-3.5"
                    variants={{
                      hover: {
                        x: [0, 3, -1.5, 0],
                        y: [0, -3, 1.5, 0],
                        transition: { duration: 0.8, ease: "easeInOut" as const },
                      },
                    }}
                  >
                    <motion.path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
                      initial={{ strokeDasharray: "60 60", strokeDashoffset: 0 }}
                      variants={{
                        hover: {
                          strokeDashoffset: [0, -60],
                          transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
                        },
                      }}
                    />
                  </motion.svg>
                )}
                {SECTION_LABEL[section]}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function Header() {
  type Theme = "dark" | "light";
  type ViewTransitionDoc = Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [theme, setTheme] = useState<Theme>("dark");
  const hasHydratedTheme = useRef(false);

  // Sync internal state with URL
  useEffect(() => {
    setSearch(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const systemPrefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : systemPrefersDark
          ? "dark"
          : "light";
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    hasHydratedTheme.current = true;
  }, [theme]);

  const handleSearch = (val: string) => {
    setSearch(val);
    const params = new URLSearchParams(searchParams.toString());
    if (val) params.set("q", val);
    else params.delete("q");
    params.set("offset", "0");
    router.push(`/?${params.toString()}`);
  };

  const toggleTheme = (e?: React.MouseEvent) => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    const doc = document as ViewTransitionDoc;
    const supportsViewTransition = typeof doc.startViewTransition === "function";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (supportsViewTransition && !reducedMotion) {
      // Set click origin for the spotlight animation
      const x = e?.clientX ?? window.innerWidth / 2;
      const y = e?.clientY ?? window.innerHeight / 2;
      document.documentElement.style.setProperty("--x", `${x}px`);
      document.documentElement.style.setProperty("--y", `${y}px`);
      doc.startViewTransition?.(() => {
        flushSync(() => setTheme(nextTheme));
      });
    } else {
      // Fallback: CSS transition
      const root = document.documentElement;
      root.classList.add("theme-transition");
      setTheme(nextTheme);
      window.setTimeout(() => root.classList.remove("theme-transition"), 300);
    }
  };

  return (
    <header className="border-b border-border bg-surface/95 backdrop-blur-xl sticky top-0 z-50">
      <div className="w-full flex items-center justify-between px-4 sm:px-6 py-3 gap-3 sm:gap-6">
        <div className="flex items-center gap-5 shrink-0">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
               <Image
                src={theme === "dark" ? "/Dark-logo.png" : "/Light-logo.png"}
                alt="PredictPro"
                width={22}
                height={22}
                className="w-[22px] h-[22px] object-cover"
              />
            </div>
            <span className="text-text-primary text-[17px] font-extrabold leading-none tracking-tight group-hover:text-accent transition-colors">PredictPro</span>
          </Link>
        </div>

        <div className="hidden sm:flex flex-1 max-w-[480px] relative group">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none z-10">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-muted group-focus-within:text-accent transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search trending markets..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="depth-segment w-full h-9 pl-10 pr-4 rounded-xl text-[13px] font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={(e) => toggleTheme(e)}
            className="h-9 w-9 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 transition-colors text-text-secondary hover:text-text-primary flex items-center justify-center active:scale-95"
            aria-label="Toggle theme"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0A7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <div className="hidden sm:flex items-center gap-1.5">
            <button className="h-9 px-3.5 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 transition-colors text-[13px] font-semibold text-text-secondary hover:text-text-primary active:scale-95">
              Sign in
            </button>
            <button className="h-9 px-3.5 rounded-xl border border-accent/35 bg-accent/15 hover:bg-accent/25 transition-colors text-[13px] font-semibold text-text-primary active:scale-95">
              Sign up
            </button>
          </div>
        </div>
      </div>

      {/* Mobile search row */}
      <div className="sm:hidden px-4 pb-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none z-10">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="depth-segment w-full h-9 pl-10 pr-4 rounded-xl text-[13px] font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
          />
        </div>
      </div>

      <CategoryNav />
    </header>
  );
}
