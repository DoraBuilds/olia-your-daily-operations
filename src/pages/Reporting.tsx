import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { ReportingTab } from "./checklists/ReportingTab";

const VALID_STATUSES = ["all", "completed", "unfinished", "unstarted"] as const;
type ReportingStatus = typeof VALID_STATUSES[number];

export default function Reporting() {
  const { t } = useTranslation("checklists");
  const [searchParams] = useSearchParams();
  const initialLocationId = searchParams.get("location") || undefined;
  const statusParam = searchParams.get("status");
  const initialStatus = VALID_STATUSES.includes(statusParam as ReportingStatus)
    ? (statusParam as ReportingStatus)
    : undefined;

  return (
    <Layout title="Olia" subtitle={t("reportingShell.subtitle")}>
      <ReportingTab initialLocationId={initialLocationId} initialStatus={initialStatus} />
    </Layout>
  );
}
