import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary";
};

export function Button({
  className,
  variant = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-amber-600 text-white hover:bg-amber-700 shadow-sm",
        variant === "outline" &&
          "border border-stone-300 bg-white/80 text-stone-700 hover:bg-stone-50",
        variant === "secondary" &&
          "bg-stone-900 text-stone-100 hover:bg-stone-800",
        className,
      )}
      {...props}
    />
  );
}
