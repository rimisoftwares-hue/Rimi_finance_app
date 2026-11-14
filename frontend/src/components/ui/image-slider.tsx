import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/utils";

export interface ImageSlideItem {
  url: string;
  title?: string;
  subtitle?: string;
}

export interface ImageSliderProps extends React.HTMLAttributes<HTMLDivElement> {
  images: (string | ImageSlideItem)[];
  interval?: number;
  overlayContent?: React.ReactNode;
}

const FALLBACK_GRADIENTS = [
  "from-slate-900 via-blue-950 to-indigo-950",
  "from-slate-950 via-indigo-950 to-emerald-950",
  "from-zinc-900 via-slate-900 to-blue-950",
  "from-slate-950 via-violet-950 to-slate-900",
];

const ImageSlider = React.forwardRef<HTMLDivElement, ImageSliderProps>(
  ({ images, interval = 5000, overlayContent, className, ...props }, ref) => {
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [failedIndices, setFailedIndices] = React.useState<Record<number, boolean>>({});

    const slides = React.useMemo<ImageSlideItem[]>(
      () =>
        images.map((item) =>
          typeof item === "string" ? { url: item } : item
        ),
      [images]
    );

    React.useEffect(() => {
      if (slides.length <= 1) return undefined;

      const timer = window.setInterval(() => {
        setCurrentIndex((prevIndex) =>
          prevIndex >= slides.length - 1 ? 0 : prevIndex + 1
        );
      }, interval);

      return () => window.clearInterval(timer);
    }, [slides.length, interval]);

    React.useEffect(() => {
      if (currentIndex >= slides.length && slides.length > 0) {
        setCurrentIndex(0);
      }
    }, [currentIndex, slides.length]);

    const activeSlide = slides[currentIndex];
    const fallbackGradient =
      FALLBACK_GRADIENTS[currentIndex % FALLBACK_GRADIENTS.length];
    const showFallback = !activeSlide?.url || Boolean(failedIndices[currentIndex]);

    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full h-full overflow-hidden bg-slate-950 select-none",
          className
        )}
        {...props}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 48, scale: 1.03 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -48, scale: 1.01 }}
            transition={{ duration: 0.75, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full"
          >
            {showFallback ? (
              <div
                className={cn(
                  "w-full h-full bg-gradient-to-br relative",
                  fallbackGradient
                )}
              >
                <div
                  className="absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 25% 25%, rgba(59,130,246,0.45) 0, transparent 50%), radial-gradient(circle at 80% 75%, rgba(99,102,241,0.35) 0, transparent 50%)",
                  }}
                />
              </div>
            ) : (
              <img
                src={activeSlide.url}
                alt={activeSlide.title || `AutoFinex showcase ${currentIndex + 1}`}
                onError={() =>
                  setFailedIndices((prev) => ({ ...prev, [currentIndex]: true }))
                }
                className="w-full h-full object-cover"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Readability dark gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-slate-950/35" />

        {/* Optional branding & caption overlay */}
        <div className="relative z-10 flex flex-col justify-between h-full p-8 text-white pointer-events-none">
          <div>{overlayContent}</div>

          <div className="space-y-5">
            {(activeSlide?.title || activeSlide?.subtitle) && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`caption-${currentIndex}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="space-y-1.5 max-w-sm"
                >
                  {activeSlide.title && (
                    <h2 className="text-xl font-semibold tracking-tight text-white leading-snug">
                      {activeSlide.title}
                    </h2>
                  )}
                  {activeSlide.subtitle && (
                    <p className="text-sm text-white/75 leading-relaxed">
                      {activeSlide.subtitle}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {slides.length > 1 && (
              <div className="flex items-center gap-2 pointer-events-auto">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      "h-2 rounded-full transition-all duration-300 cursor-pointer",
                      currentIndex === index
                        ? "w-6 bg-white"
                        : "w-2 bg-white/45 hover:bg-white/80"
                    )}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ImageSlider.displayName = "ImageSlider";

export { ImageSlider };

