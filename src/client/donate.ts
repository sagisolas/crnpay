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
import {
  PAYMENT_HINTS,
  type DonatePageData,
  type DonationStatus,
  type PageToken,
  type PaymentInstructions,
} from "../shared/donation-api.js";
import type { Dictionary } from "../shared/locale.js";
import { formatMessage } from "../shared/i18n.js";

const FIELDS = ["amount", "message", "nickname"] as const;
const STATUS_POLL_MS = 5000;

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
const testKey = data.testMode ? new URLSearchParams(window.location.search).get("key") : null;
const withKey = (path: string): string =>
  testKey ? `${path}?key=${encodeURIComponent(testKey)}` : path;
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

const touched = new Set<keyof FieldErrors>();
let sending = false;
let payState: DonationStatus["state"] = "waiting";

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

function showErrors(
  errors: FieldErrors,
  token: PageToken,
  fields: readonly (keyof FieldErrors)[] = FIELDS,
): void {
  for (const field of fields) {
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

  const result = validate(token);
  showErrors(result.ok ? {} : result.errors, token, [...touched]);
  donateButton.disabled = sending || !result.ok;
}

function startCountdown(expiresAt: number): void {
  const status = byId("pay-status");
  const tick = (): void => {
    const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (payState === "waiting") {
      status.textContent = phrase("waitingBody", { time });
    }
    if (seconds === 0 || payState !== "waiting") {
      window.clearInterval(timer);
    }
  };
  const timer = window.setInterval(tick, 1000);
  tick();
}

function statusText(status: DonationStatus): [string, string] | null {
  switch (status.state) {
    case "waiting":
      return null;
    case "seen":
      return [
        phrase("seenTitle"),
        phrase("seenBody", { confirmations: status.confirmations, required: status.required }),
      ];
    case "confirmed":
      return [phrase("confirmedTitle"), phrase("confirmedBody")];
    case "expired":
      return [phrase("expiredTitle"), phrase("expiredBody")];
  }
}

function showStatus(status: DonationStatus): void {
  const text = statusText(status);
  if (!text) {
    return;
  }
  payState = status.state;
  byId("pay-state").dataset["state"] = status.state;
  byId("pay-status-title").textContent = text[0];
  byId("pay-status").textContent = text[1];
}

function watchStatus(id: string): void {
  const poll = async (): Promise<void> => {
    const response = await fetch(`/api/donations/${encodeURIComponent(id)}`);
    if (response.ok) {
      showStatus((await response.json()) as DonationStatus);
    }
  };
  const schedule = (): void => {
    window.setTimeout(() => {
      void poll()
        .catch(() => undefined)
        .finally(() => {
          if (payState !== "confirmed") {
            schedule();
          }
        });
    }, STATUS_POLL_MS);
  };
  schedule();
}

function showTestPanel(instructions: PaymentInstructions): void {
  const amount = byId("test-amount") as HTMLInputElement;
  const send = byId("test-send") as HTMLButtonElement;
  const hint = byId("test-amount-hint");
  const error = byId("test-amount-error");
  amount.value = instructions.amount;
  send.addEventListener("click", () => {
    send.disabled = true;
    send.setAttribute("aria-busy", "true");
    error.textContent = "";
    void fetch(withKey("/api/test-payments"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: normalizeAmount(amount.value) }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        hint.textContent = phrase("testSent");
      })
      .catch(() => {
        error.textContent = phrase("testFailed");
      })
      .finally(() => {
        send.disabled = false;
        send.removeAttribute("aria-busy");
      });
  });
  byId("test-panel").hidden = false;
}

function showInstructions(instructions: PaymentInstructions, token: PageToken): void {
  byId("pay-network").textContent = instructions.networkName;
  byId("pay-amount").textContent = `${instructions.amount} ${instructions.symbol}`;
  byId("pay-address").textContent = instructions.address;
  const hints = PAYMENT_HINTS[instructions.matching];
  const qrNote = byId("pay-qr-note");
  qrNote.textContent = hints.qrNote ? phrase(hints.qrNote) : "";
  qrNote.hidden = !hints.qrNote;
  byId("pay-warning-title").textContent = phrase(hints.warningTitle, {
    network: instructions.networkName,
    minimum: `${instructions.minimum} ${instructions.symbol}`,
  });
  byId("pay-warning-body").textContent = phrase(hints.warningBody);
  const qr = byId("pay-qr") as HTMLImageElement;
  qr.src = instructions.qr;
  qr.alt = instructions.address;
  preview.amount.textContent = instructions.amount;
  preview.symbol.textContent = instructions.symbol;

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
  watchStatus(instructions.id);
  if (data.testMode && token.id === "test") {
    showTestPanel(instructions);
  }
  byId("form-panel").hidden = true;
  byId("pay-panel").hidden = false;
}

async function submit(token: PageToken): Promise<boolean> {
  const response = await fetch(withKey("/api/donations"), {
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
    const instructions = (await response.json()) as PaymentInstructions;
    window.location.assign(withKey(`/d/${encodeURIComponent(instructions.id)}`));
    return true;
  }
  if (response.status === 429) {
    showBanner(phrase("rateLimited"));
    return false;
  }
  if (response.status === 503) {
    showBanner(phrase("tokenUnavailable", { symbol: token.symbol, network: token.networkName }));
    return false;
  }
  const body = (await response.json().catch(() => null)) as { fields?: FieldErrors } | null;
  if (response.status === 422 && body?.fields) {
    showErrors(body.fields, token);
    return false;
  }
  showBanner(phrase("requestFailed"));
  return false;
}

form.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === "tokenId") {
    showBanner("");
  }
  const field = FIELDS.find((name) => inputs[name] === event.target);
  if (field) {
    touched.add(field);
  }
  render();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = selectedToken();
  if (!token || sending) {
    return;
  }
  const result = validate(token);
  if (!result.ok) {
    FIELDS.forEach((field) => touched.add(field));
    showErrors(result.errors, token);
    const firstInvalid = FIELDS.find((field) => result.errors[field]);
    if (firstInvalid) {
      inputs[firstInvalid].focus();
    }
    return;
  }
  sending = true;
  donateButton.disabled = true;
  donateButton.setAttribute("aria-busy", "true");
  void submit(token)
    .catch(() => {
      showBanner(phrase("requestFailed"));
      return false;
    })
    .then((leaving) => {
      if (leaving) {
        return;
      }
      sending = false;
      donateButton.disabled = !validate(token).ok;
      donateButton.removeAttribute("aria-busy");
    });
});

const pay = data.pay;
if (pay) {
  payState = pay.status.state;
  const token = data.tokens.find((candidate) => candidate.id === pay.tokenId);
  if (token) {
    showStatus(pay.status);
    showInstructions(pay.instructions, token);
  }
} else {
  render();
}
