import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium transition-colors",
    "focus-visible:outline-none",
    "focus-visible:ring-[3px] focus-visible:ring-ring/30",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Mint — Brand 500
        default:
          "rounded-lg bg-[#2b2bb5] text-white hover:bg-[#1a1a8a] active:bg-[#1a1a8a]",

        destructive:
          "rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90",

        // Mint outline
        outline:
          "rounded-lg border border-[#2b2bb5] bg-white text-[#2b2bb5] shadow-none hover:bg-[#f0f0fd] hover:text-[#1a1a8a] active:bg-[#dcdcf8]",

        // Mint secondary
        secondary:
          "rounded-lg bg-[#f0f0fd] text-[#2b2bb5] shadow-none hover:bg-[#dcdcf8] hover:text-[#1a1a8a] active:bg-[#dcdcf8]",

        // Soft / neutral action
        ghost:
          "rounded-lg text-foreground hover:bg-[#f0f0fd] hover:text-[#1a1a8a] active:bg-[#dcdcf8]",

        link:
          "text-[#2b2bb5] underline-offset-4 hover:text-[#1a1a8a] hover:underline",
      },

      size: {
        // Mint MD
        default:
          "h-10 rounded-lg px-4 py-3 text-sm leading-4",

        // Mint SM
        sm:
          "h-[34px] rounded-lg px-3 py-2 text-[13px] leading-[18px]",

        // Mint LG
        lg:
          "h-12 rounded-xl px-5 py-3 text-base leading-6",

        // Icon-only
        icon:
          "h-9 w-9 rounded-lg",
      },
    },

    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className })
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }