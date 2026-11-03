import { useEffect, useState, type ReactNode } from "react";

export const frameMode = () =>
  new URLSearchParams(location.search).get("frame") === "iphone";

/** ?frame=iphone: render children in a 390x844 phone on desktop (safe areas via --sat/--sab). */
export default function IPhoneFrame({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(
          1,
          (window.innerHeight - 48) / 844,
          (window.innerWidth - 48) / 390,
        ),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  if (!frameMode()) return <>{children}</>;
  return (
    <div className="frame-stage">
      <div
        className="iphone-wrap"
        style={{ "--frame-scale": scale } as React.CSSProperties}
      >
        <div
          className="iphone-btn"
          style={{ left: -14, top: 140, height: 32 }}
        />
        <div
          className="iphone-btn"
          style={{ left: -14, top: 200, height: 60 }}
        />
        <div
          className="iphone-btn"
          style={{ left: -14, top: 275, height: 60 }}
        />
        <div
          className="iphone-btn"
          style={{ right: -14, top: 220, height: 96 }}
        />
        <div className="iphone">
          <div id="frame-root" style={{ position: "absolute", inset: 0 }}>
            {children}
          </div>
          <div className="island" />
          <div className="home-bar" />
        </div>
      </div>
    </div>
  );
}
