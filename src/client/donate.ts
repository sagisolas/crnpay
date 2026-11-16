import "./styles/donate.css";
import { formatAmount, parseAmount, readAmount } from "../shared/amount.js";
import {
  MESSAGE_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  cleanText,
  normalizeAmount,
  textLength,
  validateDonationInput,
  type FieldErrors,
} from "../shared/donation-input.js";
import { ANONYMOUS } from "../shared/alert.js";
import type { DonatePageData, PageToken, PaymentInstructions } from "../shared/donation-api.js";
import type { Dictionary } from "../shared/locale.js";
import { formatMessage } from "../shared/i18n.js";

const FIELDS = ["amount", "message", "nickname"] as const;

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element;
};
const query = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing ${selector}`);
  }
  return element;
};

const data = JSON.parse(byId("page-data").textContent) as DonatePageData;
const phrase = (key: keyof Dictionary, values: Record<string, string | number> = {}): string =>
  formatMessage(data.locale, data.strings[key], values);

const form = byId("donation-form") as HTMLFormElement;
const inputs = {
  amount: byId("amount") as HTMLInputElement,
  message: byId("message") as HTMLTextAreaElement,
  nickname: byId("nickname") as HTMLInputElement,
};
const donateButton = byId("donate") as HTMLButtonElement;
const formBanner = byId("form-banner");
const preview = {
  nickname: query("[data-alert-nickname]"),
  amount: query("[data-alert-amount]"),
  symbol: query("[data-alert-symbol]"),
  message: query("[data-alert-message]"),
};

let attempted = false;
let sending = false;

function selectedToken(): PageToken | undefined {
  const id = new FormData(form).get("tokenId");
  return data.tokens.find((token) => token.id === id);
}

function enteredAmount(token: PageToken): string | null {
  const units = readAmount(normalizeAmount(inputs.amount.value), token.decimals);
  return typeof units === "bigint" ? formatAmount(units, token.decimals) : null;
}

function errorText(field: keyof FieldErrors, code: string, token: PageToken): string {
  const messages: Record<string, string> = {
    "amount.invalid": phrase("amountInvalid"),
    "amount.too_many_decimals": phrase("amountTooManyDecimals", {
      symbol: token.symbol,
      decimals: token.decimals,
    }),
    "amount.below_minimum": phrase("amountBelowMinimum", {
      minimum: `${token.minimum} ${token.symbol}`,
    }),
    "message.required": phrase("messageRequired"),
    "message.too_long": phrase("messageTooLong", { max: MESSAGE_MAX_LENGTH }),
    "nickname.too_long": phrase("nicknameTooLong", { max: NICKNAME_MAX_LENGTH }),
  };
  return messages[`${field}.${code}`] ?? phrase("requestFailed");
}

function showErrors(errors: FieldErrors, token: PageToken): void {
  for (const field of FIELDS) {
    const code = errors[field];
    byId(`${field}-error`).textContent = code ? errorText(field, code, token) : "";
    inputs[field].setAttribute("aria-invalid", String(Boolean(code)));
  }
}

function validate(token: PageToken) {
  return validateDonationInput(
    { amount: inputs.amount.value, message: inputs.message.value, nickname: inputs.nickname.value },
    { decimals: token.decimals, minimum: parseAmount(token.minimum, token.decimals) },
  );
}

function showBanner(message: string): void {
  formBanner.textContent = message;
  formBanner.hidden = !message;
  donateButton.hidden = Boolean(message);
}

function render(): void {
  const token = selectedToken();
  if (!token) {
    return;
  }
  const amount = enteredAmount(token);
  const message = cleanText(inputs.message.value);
  const nickname = cleanText(inputs.nickname.value);

  byId("amount-unit").textContent = token.symbol;
  byId("amount-hint").textContent = phrase("minimum", {
    amount: `${token.minimum} ${token.symbol}`,
  });
  byId("message-count").textContent =
    `${String(textLength(message))} / ${String(MESSAGE_MAX_LENGTH)}`;
  byId("nickname-count").textContent =
    `${String(textLength(nickname))} / ${String(NICKNAME_MAX_LENGTH)}`;
  donateButton.textContent = amount
    ? phrase("donateAmount", { amount: `${amount} ${token.symbol}` })
    : phrase("donate");

  preview.nickname.textContent = nickname || ANONYMOUS;
  preview.amount.textContent = amount ?? token.minimum;
  preview.symbol.textContent = token.symbol;
  preview.message.textContent = message || phrase("messagePlaceholder");
  preview.message.classList.toggle("is-empty", !message);

  if (attempted) {
    const result = validate(token);
    showErrors(result.ok ? {} : result.errors, token);
  }
}

function startCountdown(expiresAt: number): void {
  const status = byId("pay-status");
  const tick = (): void => {
    const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    status.textContent = phrase("waitingBody", { time });
    if (seconds === 0) {
      window.clearInterval(timer);
    }
  };
  const timer = window.setInterval(tick, 1000);
  tick();
}

function showInstructions(instructions: PaymentInstructions): void {
  byId("pay-network").textContent = instructions.networkName;
  byId("pay-amount").textContent = `${instructions.amount} ${instructions.symbol}`;
  byId("pay-address").textContent = instructions.address;
  byId("pay-warning-title").textContent = phrase("exactWarningTitle", {
    network: instructions.networkName,
  });
  const qr = byId("pay-qr") as HTMLImageElement;
  qr.src = instructions.qr;
  qr.alt = instructions.address;
  preview.amount.textContent = instructions.amount;

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    button.addEventListener("click", () => {
      const value =
        button.dataset["copy"] === "amount" ? instructions.amount : instructions.address;
      void navigator.clipboard.writeText(value).then(() => {
        button.textContent = button.dataset["copiedLabel"] ?? "";
        button.classList.add("is-done");
        window.setTimeout(() => {
          button.textContent = button.dataset["label"] ?? "";
          button.classList.remove("is-done");
        }, 1600);
      });
    });
  }

  startCountdown(Date.parse(instructions.expiresAt));
  byId("form-panel").hidden = true;
  byId("pay-panel").hidden = false;
  query("#pay-panel h2").focus();
}

async function submit(token: PageToken): Promise<void> {
  const response = await fetch("/api/donations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenId: token.id,
      amount: normalizeAmount(inputs.amount.value),
      message: inputs.message.value,
      nickname: inputs.nickname.value,
    }),
  });
  if (response.status === 201) {
    showInstructions((await response.json()) as PaymentInstructions);
    return;
  }
  if (response.status === 429) {
    showBanner(phrase("rateLimited"));
    return;
  }
  if (response.status === 503) {
    showBanner(phrase("tokenUnavailable", { symbol: token.symbol, network: token.networkName }));
    return;
  }
  const body = (await response.json().catch(() => null)) as { fields?: FieldErrors } | null;
  if (response.status === 422 && body?.fields) {
    showErrors(body.fields, token);
    return;
  }
  showBanner(phrase("requestFailed"));
}

form.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === "tokenId") {
    showBanner("");
  }
  render();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = selectedToken();
  if (!token || sending) {
    return;
  }
  attempted = true;
  const result = validate(token);
  if (!result.ok) {
    showErrors(result.errors, token);
    const firstInvalid = FIELDS.find((field) => result.errors[field]);
    if (firstInvalid) {
      inputs[firstInvalid].focus();
    }
    return;
  }
  sending = true;
  donateButton.disabled = true;
  submit(token)
    .catch(() => {
      showBanner(phrase("requestFailed"));
    })
    .finally(() => {
      sending = false;
      donateButton.disabled = false;
    });
});

render();
