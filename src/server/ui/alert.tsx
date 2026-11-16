interface AlertViewProps {
  nickname: string;
  amount: string;
  symbol: string;
  message: string;
  placeholder?: boolean;
}

export function AlertView({
  nickname,
  amount,
  symbol,
  message,
  placeholder = false,
}: AlertViewProps) {
  return (
    <div class="alert" data-alert>
      <div class="alert-head">
        <span class="alert-nick" data-alert-nickname>
          {nickname}
        </span>
        <span class="alert-dash">—</span>
        <span class="alert-amount">
          <span data-alert-amount>{amount}</span>
          <small data-alert-symbol>{symbol}</small>
        </span>
      </div>
      <div class={placeholder ? "alert-msg is-empty" : "alert-msg"} data-alert-message>
        {message}
      </div>
    </div>
  );
}
