import "./styles/alert-page.css";
import type { AlertEvent, AlertPageData } from "../shared/alert.js";

const SHOW_MS = 8000;
const GAP_MS = 600;
const RECONNECT_MS = 5000;

const query = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing ${selector}`);
  }
  return element;
};

const pageData = JSON.parse(query("#page-data").textContent) as AlertPageData;
const keyParam = `key=${encodeURIComponent(new URLSearchParams(window.location.search).get("key") ?? "")}`;
const stage = query(".alert-stage");
const alert = query("[data-alert]");
const fields = {
  icon: query("[data-alert-icon]") as HTMLImageElement,
  nickname: query("[data-alert-nickname]"),
  amount: query("[data-alert-amount]"),
  symbol: query("[data-alert-symbol]"),
  message: query("[data-alert-message]"),
};

const queue: AlertEvent[] = [];
const received = new Set<string>();
let playing = false;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function showIcon(image: HTMLImageElement, src: string | null): void {
  image.hidden = !src;
  if (src) {
    image.src = src;
  } else {
    image.removeAttribute("src");
  }
}

async function display(event: AlertEvent): Promise<void> {
  showIcon(fields.icon, event.icon);
  fields.nickname.textContent = event.nickname;
  fields.amount.textContent = event.amount;
  fields.symbol.textContent = event.symbol;
  fields.message.textContent = event.message;
  stage.hidden = false;
  alert.classList.add("is-in");
  await wait(SHOW_MS);
  alert.classList.remove("is-in");
  stage.hidden = true;
}

function reportShown(id: string): void {
  fetch(`/api/alerts/${encodeURIComponent(id)}/shown?${keyParam}`, { method: "POST" }).catch(
    (error: unknown) => {
      console.warn("Alert shown report failed", error);
    },
  );
}

async function play(): Promise<void> {
  if (playing) {
    return;
  }
  playing = true;
  for (let next = queue.shift(); next; next = queue.shift()) {
    await display(next);
    reportShown(next.id);
    await wait(GAP_MS);
  }
  playing = false;
}

function connect(): void {
  const source = new EventSource(`/api/alerts/events?${keyParam}`);
  source.addEventListener("alert", (message) => {
    const event = JSON.parse((message as MessageEvent<string>).data) as AlertEvent;
    if (received.has(event.id)) {
      return;
    }
    received.add(event.id);
    queue.push(event);
    void play();
  });
  source.addEventListener("error", () => {
    if (source.readyState === EventSource.CLOSED) {
      setTimeout(connect, RECONNECT_MS);
    }
  });
}

async function loopSample(sample: AlertEvent): Promise<void> {
  for (;;) {
    await display(sample);
    await wait(GAP_MS);
  }
}

if (pageData.sample) {
  void loopSample(pageData.sample);
} else {
  connect();
}
