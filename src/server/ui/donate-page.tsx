import { ANONYMOUS } from "../../shared/alert.js";
import type {
  DonatePageData,
  DonationStatus,
  PageToken,
  PayState,
} from "../../shared/donation-api.js";
import { AlertView } from "./alert.js";
import { PageData } from "./page-data.js";
import { Banner } from "./banner.js";
import { Button } from "./button.js";
import { ChipGroup } from "./chip-group.js";
import { Field } from "./field.js";
import { useI18n } from "./i18n.js";
import { Layout } from "./layout.js";
import { LocaleSwitch } from "./locale-switch.js";
import { PayPanel, type PayView } from "./pay-panel.js";

export interface DonateToken extends PageToken {
  icon: string | null;
}

interface DonatePageProps {
  streamerName: string;
  tokens: DonateToken[];
  testMode: boolean;
  pay?: PayState | undefined;
  keyParam?: string | undefined;
  rememberedTokenId?: string | undefined;
}

const TEST_TOKEN_ID = "test";

function mmss(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DonatePage({
  streamerName,
  tokens,
  testMode,
  pay,
  keyParam,
  rememberedTokenId,
}: DonatePageProps) {
  const { locale, strings: t, phrase } = useI18n();
  const selected = tokens.find((token) => token.id === rememberedTokenId) ?? tokens[0];

  const statusView = (status: DonationStatus, expiresAt: string): PayView["status"] => {
    switch (status.state) {
      case "waiting": {
        const seconds = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000));
        return {
          state: "waiting",
          title: t.waitingTitle,
          body: phrase("waitingBody", { time: mmss(seconds) }),
        };
      }
      case "seen":
        return {
          state: "seen",
          title: t.seenTitle,
          body: phrase("seenBody", {
            confirmations: status.confirmations,
            required: status.required,
          }),
        };
      case "confirmed":
        return { state: "confirmed", title: t.confirmedTitle, body: t.confirmedBody };
      case "expired":
        return { state: "expired", title: t.expiredTitle, body: t.expiredBody };
    }
  };

  const payView: PayView | undefined = pay && {
    networkName: pay.instructions.networkName,
    amount: pay.instructions.amount,
    symbol: pay.instructions.symbol,
    address: pay.instructions.address,
    minimum: pay.instructions.minimum,
    matching: pay.instructions.matching,
    qr: pay.instructions.qr,
    isTest: pay.tokenId === TEST_TOKEN_ID,
    status: statusView(pay.status, pay.instructions.expiresAt),
  };

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
    testMode,
    pay,
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
          <LocaleSwitch keyParam={keyParam} />
        </header>

        <section class="panel" id="form-panel" hidden={Boolean(pay)}>
          <form id="donation-form" novalidate>
            <ChipGroup
              name="tokenId"
              legend={t.payWith}
              selected={selected?.id}
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
                  selected
                    ? phrase("minimum", {
                        amount: `${selected.minimum} ${selected.symbol}`,
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
                    {selected?.symbol}
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
            <Button variant="primary" type="submit" id="donate" disabled={!selected}>
              {t.donate}
            </Button>
            <p class="cta-note">{t.donateNote}</p>
          </form>
        </section>

        <PayPanel testMode={testMode} view={payView} />

        <aside class="stage" aria-label={t.previewCaption}>
          <div class="screen">
            <span class="screen-live">{t.live}</span>
            <p class="stage-caption">{t.previewCaption}</p>
            <AlertView
              nickname={ANONYMOUS}
              amount={pay?.instructions.declaredAmount ?? selected?.minimum ?? ""}
              symbol={payView?.symbol ?? selected?.symbol ?? ""}
              message={t.messagePlaceholder}
              placeholder
            />
          </div>
        </aside>
      </main>
      <PageData value={pageData} />
    </Layout>
  );
}
