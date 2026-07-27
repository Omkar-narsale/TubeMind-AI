const PREFIX = "[TubeMind AI]";

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`%c${PREFIX} info`, "color: #3b82f6; font-weight: bold;", message, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`%c${PREFIX} warn`, "color: #f59e0b; font-weight: bold;", message, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`%c${PREFIX} error`, "color: #ef4444; font-weight: bold;", message, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (import.meta.env?.DEV) {
      console.log(`%c${PREFIX} debug`, "color: #10b981; font-weight: bold;", message, ...args);
    }
  },
};
export default logger;
