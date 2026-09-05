import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center",
    "whitespace-nowrap",
    "rounded-md",
    "border",
    "px-2 py-0.5",
    "text-xs font-medium",
    "transition-colors",
    "focus:outline-none",
    "focus:ring-2 focus:ring-[#2b2bb5]/20",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#2b2bb5] text-white",

        secondary:
          "border-transparent bg-[#f0f0fd] text-[#1a1a8a]",

        outline:
          "border-[#dcdcf8] bg-white text-[#2b2bb5]",

        success:
          "border-transparent bg-green-50 text-green-700",

        warning:
          "border-transparent bg-amber-50 text-amber-700",

        destructive:
          "border-transparent bg-red-50 text-red-700",

        info:
          "border-transparent bg-blue-50 text-blue-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div
      className={cn(
        badgeVariants({ variant }),
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }