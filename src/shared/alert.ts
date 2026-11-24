export interface AlertEvent {
  id: string;
  icon: string | null;
  nickname: string;
  amount: string;
  symbol: string;
  message: string;
}

export interface AlertPageData {
  sample: AlertEvent | null;
}
