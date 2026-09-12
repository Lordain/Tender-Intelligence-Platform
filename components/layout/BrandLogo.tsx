import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  variant?: "dark" | "light";
  priority?: boolean;
};

/**
 * WebP, and 320px square rather than the 1254px original (2026-09-06):
 * the mark renders at size-10 (40 CSS px), so the source was 31x
 * oversampled and cost 660 KB/546 KB per variant in the repo and through
 * the image optimizer. 320px still covers a 2x render of the largest
 * declared size below.
 */
export function BrandLogo({
  className = "size-10",
  variant = "dark",
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src={variant === "dark" ? "/brand/logo-dark-ui.webp" : "/brand/logo-light-ui.webp"}
      alt=""
      width={160}
      height={160}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
      aria-hidden="true"
    />
  );
}
