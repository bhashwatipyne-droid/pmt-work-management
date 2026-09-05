import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        [
          "flex min-h-[80px] w-full rounded-lg",
          "border border-input bg-white",
          "px-3 py-2 text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "shadow-none",
          "transition-colors",
          "focus-visible:outline-none",
          "focus-visible:border-[#2b2bb5]",
          "focus-visible:ring-[3px]",
          "focus-visible:ring-[#2b2bb5]/20",
          "disabled:cursor-not-allowed",
          "disabled:bg-muted",
          "disabled:text-muted-foreground",
          "disabled:opacity-70",
        ].join(" "),
        className
      )}
      ref={ref}
      {...props}
    />
  )
})

Textarea.displayName = "Textarea"

export { Textarea }