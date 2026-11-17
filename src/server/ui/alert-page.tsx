import type { AlertEvent, AlertPageData } from "../../shared/alert.js";
import { AlertView } from "./alert.js";
import { Layout } from "./layout.js";
import { PageData } from "./page-data.js";

export function AlertPage({ sample }: { sample: AlertEvent | null }) {
  const data: AlertPageData = { sample };
  return (
    <Layout title="crnpay" stylesheet="/assets/alerts.css" script="/assets/alerts.js">
      <div class="alert-stage" hidden>
        <AlertView nickname="" amount="" symbol="" message="" />
      </div>
      <PageData value={data} />
    </Layout>
  );
}
