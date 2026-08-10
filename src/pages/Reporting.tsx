import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { ReportingTab } from "./checklists/ReportingTab";

export default function Reporting() {
  const { t } = useTranslation("checklists");
  const [searchParams] = useSearchParams();
  const initialLocationId = searchParams.get("location") || undefined;

  return (
    <Layout title="Olia" subtitle={t("reportingShell.subtitle")}>
      <ReportingTab initialLocationId={initialLocationId} />
    </Layout>
  );
}
