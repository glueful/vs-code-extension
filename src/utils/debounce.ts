export const debounce = <T extends (...args: any[]) => void>(fn: T, ms = 300) => {
  let timeout: NodeJS.Timeout | undefined;
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => fn(...args), ms);
  };
};

export const throttle = <T extends (...args: any[]) => void>(fn: T, ms = 300) => {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  };
};