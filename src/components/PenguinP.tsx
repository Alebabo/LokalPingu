import penguinP from "../assets/penguin-p.png";

/** Original LocalPingu penguin-P logo artwork, embedded 1:1. */
export function PenguinP({ className = "" }: { className?: string }) {
  return <img src={penguinP} alt="" aria-hidden="true" className={className} draggable={false} />;
}
