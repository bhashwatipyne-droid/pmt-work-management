import { useEffect, useState } from "react";

// Matches Tailwind's `md` breakpoint: phones are anything narrower than 768px.
const QUERY = "(max-width: 767px)";

const read = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;

// For the few places that swap a whole component (a spreadsheet for a card
// list) rather than just restyle it - plain CSS covers everything else.
export function useIsMobile() {
  const [mobile, setMobile] = useState(read);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
