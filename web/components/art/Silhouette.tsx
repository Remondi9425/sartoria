/** The body outline shown while filming — a stand-in for the live camera when
 *  it is unavailable, and the target the framing guides refer to. */
export function Silhouette({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 400" className={className} aria-hidden="true">
      <g fill="currentColor">
        <circle cx="80" cy="44" r="27" />
        <path d="M 80 78
                 C 104 78, 116 92, 118 116
                 L 122 196 C 123 206, 116 210, 112 200
                 L 104 150 L 104 214
                 C 104 224, 101 236, 99 252
                 L 94 372 C 93 382, 79 382, 78 372
                 L 74 262 L 70 372 C 69 382, 55 382, 54 372
                 L 49 252 C 47 236, 44 224, 44 214
                 L 44 150 L 36 200 C 32 210, 25 206, 26 196
                 L 30 116 C 32 92, 56 78, 80 78 Z" />
      </g>
    </svg>
  );
}
