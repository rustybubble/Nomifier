import { useRegisterSW } from "virtual:pwa-register/react";

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="banner chrome" role="alert">
      <span>Update available</span>
      <button className="btn-tint" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  );
}
