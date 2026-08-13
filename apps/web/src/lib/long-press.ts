export function installReleaseGuards() {
  const clickGuard = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    document.removeEventListener("click", clickGuard, true);
  };
  const upGuard = (ev: PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    document.removeEventListener("pointerup", upGuard, true);
  };
  document.addEventListener("click", clickGuard, true);
  document.addEventListener("pointerup", upGuard, true);
  setTimeout(() => {
    document.removeEventListener("click", clickGuard, true);
    document.removeEventListener("pointerup", upGuard, true);
  }, 600);
}
