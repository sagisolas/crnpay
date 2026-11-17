import { ANONYMOUS } from "../../shared/alert.js";
import type { DonatePageData, PageToken } from "../../shared/donation-api.js";
import { AlertView } from "./alert.js";
import { Banner } from "./banner.js";
import { Button } from "./button.js";
import { ChipGroup } from "./chip-group.js";
import { CopyButton } from "./copy-button.js";
import { Field } from "./field.js";
import { useI18n } from "./i18n.js";
import { Layout } from "./layout.js";

export interface DonateToken extends PageToken {
  icon: string | null;
}

interface DonatePageProps {
  streamerName: string;
  tokens: DonateToken[];
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function DonatePage({ streamerName, tokens }: DonatePageProps) {
  const { locale, strings: t, phrase } = useI18n();
  const first = tokens[0];
  const pageData: DonatePageData = {
    locale,
    strings: t,
    tokens: tokens.map(({ id, symbol, networkName, decimals, minimum }) => ({
      id,
      symbol,
      networkName,
      decimals,
      minimum,
    })),
  };

  return (
    <Layout
      title={phrase("pageTitle", { name: streamerName })}
      lang={locale}
      stylesheet="/assets/donate.css"
      script="/assets/donate.js"
    >
      <main class="page">
        <header class="topbar">
          <div class="streamer">
            <h1>{streamerName}</h1>
            <p>{t.tagline}</p>
          </div>
        </header>

        <section class="panel" id="form-panel">
          <form id="donation-form" novalidate>
            <ChipGroup
              name="tokenId"
              legend={t.payWith}
              selected={first?.id}
              options={tokens.map((token) => ({
                value: token.id,
                label: token.symbol,
                detail: token.networkName,
                icon: token.icon,
              }))}
            />
            <div class="field-row">
              <Field
                id="amount"
                label={t.amount}
                hint={
                  first
                    ? phrase("minimum", {
                        amount: `${first.minimum} ${first.symbol}`,
                      })
                    : ""
                }
              >
                <div class="amount-wrap">
                  <input
                    class="input input-amount"
                    id="amount"
                    name="amount"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="0.00"
                    aria-describedby="amount-hint amount-error"
                  />
                  <span class="unit" id="amount-unit">
                    {first?.symbol}
                  </span>
                </div>
              </Field>
              <Field id="nickname" label={t.nickname} hint={t.nicknameHint} counter>
                <input
                  class="input"
                  id="nickname"
                  name="nickname"
                  autocomplete="nickname"
                  aria-describedby="nickname-hint nickname-error"
                />
              </Field>
            </div>
            <Field id="message" label={t.message} hint={t.messageHint} counter>
              <textarea
                class="input"
                id="message"
                name="message"
                rows={3}
                aria-describedby="message-hint message-error"
              />
            </Field>
            <Banner tone="error" id="form-banner" hidden />
            <Button variant="primary" type="submit" id="donate" disabled={!first}>
              {t.donate}
            </Button>
            <p class="cta-note">{t.donateNote}</p>
          </form>
        </section>

        <section class="panel pay" id="pay-panel" hidden aria-live="polite">
          <h2 tabindex={-1}>{t.payTitle}</h2>
          <p class="pay-net">
            {t.network} <strong id="pay-network" />
          </p>
          <div class="pay-grid">
            <div>
              <div class="qr">
                <img id="pay-qr" alt="" />
              </div>
              <p class="qr-note">{t.qrAddressOnly}</p>
            </div>
            <div>
              <div class="copy-row">
                <div class="value-label">{t.exactAmount}</div>
                <p class="value value-amount" id="pay-amount" />
                <CopyButton target="amount" label={t.copyAmount} />
              </div>
              <div class="copy-row">
                <div class="value-label">{t.address}</div>
                <p class="value" id="pay-address" />
                <CopyButton target="address" label={t.copyAddress} />
              </div>
            </div>
          </div>
          <Banner tone="caution" id="pay-warning">
            <strong id="pay-warning-title" /> {t.exactWarningBody}
          </Banner>
          <div class="status" id="pay-state" data-state="waiting">
            <span class="status-dot" aria-hidden="true" />
            <div>
              <p class="status-title" id="pay-status-title">
                {t.waitingTitle}
              </p>
              <p class="status-body" id="pay-status" />
            </div>
          </div>
        </section>

        <aside class="stage" aria-label={t.previewCaption}>
          <div class="screen">
            <span class="screen-live">{t.live}</span>
            <p class="stage-caption">{t.previewCaption}</p>
            <AlertView
              nickname={ANONYMOUS}
              amount={first?.minimum ?? ""}
              symbol={first?.symbol ?? ""}
              message={t.messagePlaceholder}
              placeholder
            />
          </div>
        </aside>
      </main>
      <script
        type="application/json"
        id="page-data"
        dangerouslySetInnerHTML={{ __html: scriptJson(pageData) }}
      />
    </Layout>
  );
}
