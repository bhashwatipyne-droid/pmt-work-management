"use client"
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close
const DialogOverlay = React.forwardRef(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      className={cn(
        [
          "fixed inset-0 z-50",
          "bg-slate-900/40",
          "backdrop-blur-[2px]",
          "data-[state=open]:animate-in",
          "data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0",
          "data-[state=open]:fade-in-0",
        ].join(" "),
        className
      )}
      {...props}
      ref={ref}
    />
  )
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName
const DialogContent = React.forwardRef(
  ({ className, children, showClose = true, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          [
            "fixed left-[50%] top-[50%] z-50",
            "grid w-full max-w-lg",
            "translate-x-[-50%] translate-y-[-50%]",
            "gap-4",
            "rounded-xl",
            "border border-border",
            "bg-white",
            "p-6",
            "text-foreground",
            "shadow-xl",
            "duration-200",
            "data-[state=open]:animate-in",
            "data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0",
            "data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95",
            "data-[state=open]:zoom-in-95",
            "focus:outline-none",
          ].join(" "),
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className={[
              "absolute right-4 top-4",
              "rounded-lg p-1.5",
              "text-muted-foreground",
              "transition-colors",
              "hover:bg-[#f0f0fd]",
              "hover:text-[#1a1a8a]",
              "focus:outline-none",
              "focus:ring-[3px]",
              "focus:ring-[#2b2bb5]/20",
              "disabled:pointer-events-none",
            ].join(" ")}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName
const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"
const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"
const DialogTitle = React.forwardRef(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "text-base font-semibold leading-6 text-foreground",
        className
      )}
      {...props}
    />
  )
)
DialogTitle.displayName = DialogPrimitive.Title.displayName
const DialogDescription = React.forwardRef(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(
        "text-sm leading-5 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
DialogDescription.displayName =
  DialogPrimitive.Description.displayName
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}