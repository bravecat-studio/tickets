/// <reference types="vite/client" />

declare module '@sms-config' {
  const value: {
    enabled: boolean;
    kinds: string[];
    watchIds: string[];
    leadMinutes: number;
    cronIntervalMinutes?: number;
  };
  export default value;
}
