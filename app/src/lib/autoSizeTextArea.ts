type AutoSizeOptions = { minRows?: number; maxRows?: number };

/** Restore the editor's expanding text input using the v3 native textarea ref. */
export function autoSizeTextArea(element: HTMLTextAreaElement, { minRows = 3, maxRows = 8 }: AutoSizeOptions = {}) {
  const resize = () => {
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const border = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    element.style.height = 'auto';
    const minimum = minRows * lineHeight + padding;
    const maximum = Math.max(minRows, maxRows) * lineHeight + padding;
    const height = Math.max(minimum, Math.min(element.scrollHeight, maximum));
    element.style.height = `${style.boxSizing === 'border-box' ? height + border : height - padding}px`;
    element.style.overflowY = element.scrollHeight > maximum ? 'auto' : 'hidden';
  };

  const frame = requestAnimationFrame(resize);
  element.addEventListener('input', resize);
  let width = element.clientWidth;
  const observer = new ResizeObserver(() => {
    if (element.clientWidth !== width) {
      width = element.clientWidth;
      resize();
    }
  });
  observer.observe(element);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    element.removeEventListener('input', resize);
  };
}
