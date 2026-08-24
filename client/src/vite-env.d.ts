/// <reference types="vite/client" />

declare module '@sms-config' {
  const value: {
    enabled: boolean;
    kinds: string[];
    watchIds: string[];
    leadMinutes: number;
    cronIntervalMinutes?: number;
    autoDisabled?: boolean;
    issueFallback?: boolean;
  };
  export default value;
}
