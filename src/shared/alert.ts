export const ANONYMOUS = "Аноним";

export interface AlertEvent {
  id: string;
  nickname: string | null;
  amount: string;
  symbol: string;
  message: string;
}

export interface AlertPageData {
  sample: AlertEvent | null;
}
