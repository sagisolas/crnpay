import type { DonationStatus } from "../../shared/donation-api.js";
import { Banner } from "./banner.js";
import { Button } from "./button.js";
import { CopyButton } from "./copy-button.js";
import { Field } from "./field.js";
import { useI18n } from "./i18n.js";

export interface PayView {
  networkName: string;
  amount: string;
  symbol: string;
  address: string;
  qr: string;
  isTest: boolean;
  status: { state: DonationStatus["state"]; title: string; body: string };
}

interface PayPanelProps {
  testMode: boolean;
  view?: PayView | undefined;
}

export function PayPanel({ testMode, view }: PayPanelProps) {
  const { strings: t, phrase } = useI18n();
  const state = view?.status.state ?? "waiting";

  return (
    <section class="panel pay" id="pay-panel" hidden={!view} aria-live="polite">
      <h2>{t.payTitle}</h2>
      <p class="pay-net">
        {t.network} <strong id="pay-network">{view?.networkName}</strong>
      </p>
      <div class="pay-grid">
        <div>
          <div class="qr">
            <img id="pay-qr" src={view?.qr} alt={view?.address ?? ""} />
          </div>
          <p class="qr-note">{t.qrAddressOnly}</p>
        </div>
        <div>
          <div class="copy-row">
            <div class="value-label">{t.exactAmount}</div>
            <p class="value value-amount" id="pay-amount">
              {view && `${view.amount} ${view.symbol}`}
            </p>
            <CopyButton target="amount" label={t.copyAmount} />
          </div>
          <div class="copy-row">
            <div class="value-label">{t.address}</div>
            <p class="value" id="pay-address">
              {view?.address}
            </p>
            <CopyButton target="address" label={t.copyAddress} />
          </div>
        </div>
      </div>
      <Banner tone="caution" id="pay-warning">
        <strong id="pay-warning-title">
          {view && phrase("exactWarningTitle", { network: view.networkName })}
        </strong>{" "}
        {t.exactWarningBody}
      </Banner>
      {testMode && (
        <div class="test-panel" id="test-panel" hidden={!view?.isTest}>
          <Field id="test-amount" label={t.testTitle} hint={t.testHint}>
            <input
              class="input"
              id="test-amount"
              inputmode="decimal"
              autocomplete="off"
              value={view?.isTest ? view.amount : undefined}
              aria-describedby="test-amount-hint test-amount-error"
            />
          </Field>
          <Button variant="secondary" id="test-send">
            {t.testSend}
          </Button>
        </div>
      )}
      <div class="status" id="pay-state" data-state={state}>
        <span class="status-dot" aria-hidden="true" />
        <div>
          <p class="status-title" id="pay-status-title">
            {view?.status.title ?? t.waitingTitle}
          </p>
          <p class="status-body" id="pay-status">
            {view?.status.body}
          </p>
        </div>
      </div>
    </section>
  );
}
