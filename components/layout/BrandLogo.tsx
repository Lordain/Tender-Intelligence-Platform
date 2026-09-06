import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  variant?: "dark" | "light";
  priority?: boolean;
};

export function BrandLogo({
  className = "size-10",
  variant = "dark",
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src={variant === "dark" ? "/brand/logo-dark-ui.png" : "/brand/logo-light-ui.png"}
      alt=""
      width={160}
      height={160}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
      aria-hidden="true"
    />
  );
}
