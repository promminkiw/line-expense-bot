export function createBannerSetter(el) {
  return (text) => {
    el.textContent = text;
    el.hidden = !text;
  };
}
