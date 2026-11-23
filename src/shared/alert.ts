export interface AlertEvent {
  id: string;
  nickname: string;
  amount: string;
  symbol: string;
  message: string;
}

export interface AlertPageData {
  sample: AlertEvent | null;
}
