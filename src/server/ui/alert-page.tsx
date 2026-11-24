import type { AlertEvent, AlertPageData } from "../../shared/alert.js";
import { AlertView } from "./alert.js";
import { useI18n } from "./i18n.js";
import { Layout } from "./layout.js";
import { PageData } from "./page-data.js";

export function AlertPage({ sample }: { sample: AlertEvent | null }) {
  const { locale, strings: t } = useI18n();
  const data: AlertPageData = { sample };
  return (
    <Layout title="crnpay" lang={locale} stylesheet="/assets/alerts.css" script="/assets/alerts.js">
      <div class="alert-stage" hidden>
        <AlertView icon={null} nickname="" sentLabel={t.alertSent} amount="" symbol="" message="" />
      </div>
      <PageData value={data} />
    </Layout>
  );
}
