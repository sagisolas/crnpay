interface AlertViewProps {
  icon: string | null;
  nickname: string;
  sentLabel: string;
  amount: string;
  symbol: string;
  message: string;
  placeholder?: boolean;
}

export function AlertView({
  icon,
  nickname,
  sentLabel,
  amount,
  symbol,
  message,
  placeholder = false,
}: AlertViewProps) {
  return (
    <div class="alert" data-alert>
      <img class="alert-icon" src={icon ?? undefined} alt="" hidden={!icon} data-alert-icon />
      <p class="alert-title">
        <span class="alert-accent" data-alert-nickname>
          {nickname}
        </span>{" "}
        <span data-alert-sent>{sentLabel}</span>{" "}
        <span class="alert-accent alert-amount">
          <span data-alert-amount>{amount}</span> <span data-alert-symbol>{symbol}</span>
        </span>
      </p>
      <div class={placeholder ? "alert-msg is-empty" : "alert-msg"} data-alert-message>
        {message}
      </div>
    </div>
  );
}
